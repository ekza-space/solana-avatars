import { createHash } from "node:crypto";
import { configuredService, PassportError, type PassportService } from "./passport.server";

const MAX_BYTES = 262_144;
const GATEWAY = "https://ekza.mypinata.cloud/ipfs/";
const fail = (status: number, message: string): never => { throw new PassportError(status, message); };

/** Only canonical on-chain CIDs can select a document. No caller-supplied URL,
 * redirect, credentials or arbitrary local path ever reaches fetch. */
export class MinterMetadataResolver {
  private readonly fetcher: typeof fetch;
  private verified = new Map<string, Buffer>();
  private inflight = new Map<string, Promise<Buffer>>();
  constructor(private service: PassportService, fetchImpl?: typeof fetch) {
    this.fetcher = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }
  private async download(url: string, timeout: number): Promise<Buffer> {
    const response = await this.fetcher(url, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } });
    if (!response.ok) { await response.body?.cancel(); return fail(503, "Avatar metadata is temporarily unavailable. Retry shortly."); }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); return fail(502, "Avatar metadata exceeds the size limit."); }
    const reader = response.body?.getReader();
    if (!reader) return fail(502, "Avatar metadata is empty.");
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return fail(502, "Avatar metadata exceeds the size limit."); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  async resolve(template: string): Promise<Buffer> {
    // Recheck current canonical identity and operator digest before using a
    // cached document. Cached content never substitutes for entitlement checks.
    const source = await this.service.minterMetadataSource(template);
    const key = `${source.cid}:${source.sha256 ?? "unapproved"}`;
    const cached = this.verified.get(key); if (cached) return cached;
    const active = this.inflight.get(key); if (active) return active;
    const job = (async () => {
      let bytes: Buffer;
      try { bytes = await this.download(`${GATEWAY}${source.cid}`, 8_000); }
      catch (error) { if (error instanceof PassportError) throw error; return fail(503, "Avatar metadata is temporarily unavailable. Retry shortly."); }
      if (source.sha256 && createHash("sha256").update(bytes).digest("hex") !== source.sha256) return fail(502, "Avatar metadata integrity verification failed.");
      let metadata: any;
      try { metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(502, "Avatar metadata is not valid JSON."); }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== "object" || typeof metadata.name !== "string" || !metadata.name.trim() || metadata.name.length > 512 || typeof metadata.symbol !== "string" || metadata.symbol.length > 64) return fail(502, "Avatar metadata is missing its name or symbol.");
      if (source.sha256) {
        if (this.verified.size >= 32) this.verified.delete(this.verified.keys().next().value!);
        this.verified.set(key, bytes);
      }
      return bytes;
    })();
    this.inflight.set(key, job);
    try { return await job; } finally { if (this.inflight.get(key) === job) this.inflight.delete(key); }
  }
}

const resolvers = new WeakMap<PassportService, MinterMetadataResolver>();
let requests = { until: 0, count: 0 };
export async function handleMinterMetadata(request: Request, provided?: PassportService, providedResolver?: MinterMetadataResolver): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  try {
    const service = provided ?? configuredService(), url = new URL(request.url), origin = request.headers.get("origin");
    if (url.origin !== service.config.origin || (origin && origin !== service.config.origin) || request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Use the avatar store's own origin.");
    if (request.method !== "GET") return fail(405, "Use a metadata GET request.");
    if ([...url.searchParams.keys()].some((key) => key !== "avatarData") || url.searchParams.getAll("avatarData").length !== 1) return fail(400, "Choose one avatar template.");
    if (requests.until < Date.now()) requests = { until: Date.now() + 60_000, count: 0 };
    if (++requests.count > 120) return fail(429, "Metadata requests are busy. Retry shortly.");
    let resolver = providedResolver ?? resolvers.get(service);
    if (!resolver) { resolver = new MinterMetadataResolver(service); resolvers.set(service, resolver); }
    const bytes = await resolver.resolve(url.searchParams.get("avatarData") || "");
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    const known = error instanceof PassportError;
    return new Response(JSON.stringify({ error: known ? error.message : "Avatar metadata is temporarily unavailable. Retry shortly." }), { status: known ? error.status : 503, headers });
  }
}
