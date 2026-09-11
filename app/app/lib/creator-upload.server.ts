import { configuredService, PassportError, type PassportService } from "./passport.server";

const GATEWAY = "https://ekza.mypinata.cloud/ipfs/";
const FILE_LIMIT = 20 * 1024 * 1024;
const MULTIPART_LIMIT = 25 * 1024 * 1024;
const JSON_LIMIT = 256 * 1024;
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$/;
const fail = (status: number, message: string): never => { throw new PassportError(status, message); };
type Options = { fetchImpl?: typeof fetch; pinataJwt?: string; bodyTimeoutMs?: number; upstreamTimeoutMs?: number };
const concurrency = new WeakMap<PassportService, number>();

/** Bound the stream itself, even when Content-Length is absent or false. */
export async function boundedUploadBody(body: ReadableStream<Uint8Array> | null, limit: number, timeoutMs: number): Promise<Uint8Array> {
  const reader = body?.getReader(); if (!reader) return fail(400, "An upload body is required.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PassportError(408, "The upload timed out. Please retry.")), timeoutMs); });
  let total = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]); if (done) break;
      total += value.byteLength;
      if (total > limit) return fail(413, "The upload exceeds the size limit.");
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

async function validateFile(file: File) {
  if (file.size < 1 || file.size > FILE_LIMIT) return fail(413, "Use nonempty files of at most 20 MiB each.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = /\.png$/i.test(file.name) && Buffer.from(head.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const model = /\.(glb|vrm)$/i.test(file.name) && head.length === 12 && Buffer.from(head.subarray(0, 4)).toString("ascii") === "glTF" && new DataView(head.buffer, head.byteOffset).getUint32(4, true) === 2 && new DataView(head.buffer, head.byteOffset).getUint32(8, true) === file.size;
  if (file.name.length > 256 || (!png && !model)) return fail(422, "Upload a PNG preview or a binary GLB/VRM model.");
}
function assetUri(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 512) return false;
  if (value.startsWith("ipfs://")) return CID.test(value.slice(7));
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
function validateMetadata(value: any, wallet: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.name !== "string" || !value.name.trim() || new TextEncoder().encode(value.name).length > 32
    || typeof value.symbol !== "string" || !value.symbol.trim() || new TextEncoder().encode(value.symbol).length > 10
    || !assetUri(value.image) || !assetUri(value.animation_url)
    || !Array.isArray(value.properties?.creators) || value.properties.creators.length !== 1
    || value.properties.creators[0]?.address !== wallet || value.properties.creators[0]?.share !== 100) return fail(422, "Metadata must identify this wallet and the avatar's image and model.");
}

export async function handleCreatorUpload(request: Request, provided?: PassportService, options: Options = {}): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  let service: PassportService | undefined, entered = false;
  try {
    service = provided ?? configuredService();
    if (request.method !== "POST") return fail(405, "Use an upload POST request.");
    if (request.headers.get("origin") !== service.config.origin || new URL(request.url).origin !== service.config.origin || request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Upload from the Avatar Store page.");
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "")?.[1];
    if (!token) return fail(401, "Verify your wallet before uploading an avatar.");
    const wallet = service.authorizeCreatorUpload(token);
    if ((concurrency.get(service) || 0) >= 2) return fail(429, "Avatar uploads are busy. Please retry shortly.");
    concurrency.set(service, (concurrency.get(service) || 0) + 1); entered = true;
    const jwt = (options.pinataJwt ?? process.env.PINATA_JWT)?.trim();
    if (!jwt) return fail(503, "Creator uploads are not configured.");
    const contentType = request.headers.get("content-type") || "";
    const multipart = /^multipart\/form-data(?:;|$)/i.test(contentType);
    if (!multipart && !/^application\/json(?:;|$)/i.test(contentType)) return fail(415, "Use PNG/model files or JSON avatar metadata.");
    const limit = multipart ? MULTIPART_LIMIT : JSON_LIMIT, length = request.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) return fail(413, "The upload exceeds the size limit.");
    const bytes = await boundedUploadBody(request.body, limit, options.bodyTimeoutMs ?? 30_000);
    let files: { field: string; file: File }[] = [], metadata: unknown;
    if (multipart) {
      let form: FormData;
      try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
      catch { return fail(400, "Invalid multipart upload."); }
      for (const [field, value] of form) {
        if (typeof value === "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(field)) return fail(422, "Upload only avatar files.");
        files.push({ field, file: value });
      }
      if (files.length < 1 || files.length > 4) return fail(422, "Upload between one and four files.");
      for (const { file } of files) await validateFile(file);
    } else {
      try { metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { return fail(400, "Invalid JSON metadata."); }
      validateMetadata(metadata, wallet);
    }
    const fetcher = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const pin = async (body: FormData | string) => {
      const current = service!.authenticate(token);
      if (current.wallet !== wallet || current.projectId) return fail(403, "Reconnect the creator wallet before uploading.");
      const controller = new AbortController(), timeout = options.upstreamTimeoutMs ?? 30_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PassportError(504, "The storage upload timed out. Please retry.")); }, timeout); });
      const operation = async () => {
        const isJson = typeof body === "string";
        const result = await fetcher(`https://api.pinata.cloud/pinning/${isJson ? "pinJSONToIPFS" : "pinFileToIPFS"}`, { method: "POST", redirect: "error", signal: controller.signal, headers: { Authorization: `Bearer ${jwt}`, ...(isJson ? { "Content-Type": "application/json" } : {}) }, body });
        if (!result.ok) { void result.body?.cancel().catch(() => {}); return fail(502, "Avatar storage rejected the upload. Please retry."); }
        const responseBytes = await boundedUploadBody(result.body, 65_536, timeout);
        let value: any; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(responseBytes)); } catch { return fail(502, "Avatar storage returned an invalid response."); }
        if (typeof value.IpfsHash !== "string" || !CID.test(value.IpfsHash)) return fail(502, "Avatar storage did not return a valid content ID.");
        return { ipfsHash: value.IpfsHash, uri: `${GATEWAY}${value.IpfsHash}` };
      };
      try { return await Promise.race([operation(), deadline]); }
      catch (error) { if (error instanceof PassportError) throw error; return fail(502, "Avatar storage is unavailable. Please retry."); }
      finally { if (timer) clearTimeout(timer); controller.abort(); }
    };
    let result: unknown;
    if (multipart) {
      const uploaded = [];
      for (const { field, file } of files) { const form = new FormData(); form.append("file", file, file.name); uploaded.push({ field, ...await pin(form) }); }
      result = { files: uploaded };
    } else result = await pin(JSON.stringify({ pinataContent: metadata }));
    return new Response(JSON.stringify(result), { headers });
  } catch (error) {
    const known = error instanceof PassportError;
    return new Response(JSON.stringify({ error: known ? error.message : "Avatar upload failed. Please retry." }), { status: known ? error.status : 503, headers });
  } finally { if (entered && service) concurrency.set(service, Math.max(0, (concurrency.get(service) || 1) - 1)); }
}
