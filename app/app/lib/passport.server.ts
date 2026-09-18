import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

// This service deliberately owns no account database. Wallet sessions and
// one-use handoffs expire in memory; purchase provenance is reconstructed from
// successful chain transactions, including after a process restart.
export const PASSPORT_PROGRAM = "29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const PROJECTS = ["ekza-space", "ekza-mirror", "omoba"] as const;
type ProjectId = (typeof PROJECTS)[number];
export type ProjectSupport = {
  projectId: ProjectId; platform: string; profile: string; status: "approved";
  rendition: { id: string; url: string; sha256: string; sizeBytes: number; format: string };
};
export type CatalogAvatar = {
  avatarId: string; name: string; thumbnailUrl: string; support: ProjectSupport[];
};
export type PurchasedAvatar = CatalogAvatar & { mint: string; priceLamports: string };
type CatalogRecord = CatalogAvatar & { template: string; index: bigint; metadataUri: string; metadataSha256?: string };
export type PassportConfig = {
  origin: string; rpcUrl: string; catalogUrl: string; programId: string;
  allowedOrigins?: string[]; allowLocalhost?: boolean;
};
type Options = { fetchImpl?: typeof fetch; now?: () => number };
type SessionPurpose = "avatars" | "identity";
type Session = { wallet: string; projectId?: ProjectId; purpose: SessionPurpose; expiresAt: number };
type Challenge = { wallet: string; userCode?: string; message: string; expiresAt: number };
type Device = { userCode: string; projectId: ProjectId; purpose: SessionPurpose; expiresAt: number; token?: string; sessionKey?: string; wallet?: string; lastPoll?: number; claimed?: boolean };
type Ticket = { wallet: string; avatarId: string; mint: string; projectId: ProjectId; sessionId: string; support: ProjectSupport; expiresAt: number };
type Receipt = { mint: string; template: string; signature: string; priceLamports: string };
const SESSION_MS = 30 * 60_000;
const CHALLENGE_MS = 5 * 60_000;
const DEVICE_MS = 10 * 60_000;
const TICKET_MS = 60_000;
const MAX_STATE = 5_000;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MINT_DISCRIMINATOR = createHash("sha256").update("global:mint_nft").digest().subarray(0, 8);
const AVATAR_DISCRIMINATOR = createHash("sha256").update("account:AvatarData").digest().subarray(0, 8);

export class PassportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new PassportError(status, message); };
const object = (value: unknown): Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const iso = (value: number) => new Date(value).toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

export function decodeBase58(value: string, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !value || value.length > 4_096) return fail(400, "Invalid base58 value.");
  let number = 0n;
  for (const char of value) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return fail(400, "Invalid base58 value.");
    number = number * 58n + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = number === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  const result = Buffer.concat([Buffer.alloc(value.match(/^1*/)?.[0].length || 0), bytes]);
  if (expectedLength !== undefined && result.length !== expectedLength) return fail(400, "Invalid base58 length.");
  return result;
}
function address(value: unknown): string {
  if (typeof value !== "string") return fail(400, "A wallet or account address is required.");
  decodeBase58(value, 32);
  return value;
}
function project(value: unknown): ProjectId {
  if (!PROJECTS.includes(value as ProjectId)) return fail(400, "Unsupported project.");
  return value as ProjectId;
}
function boundedString(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value || value.length > max || /[\u0000-\u001f]/.test(value)) return fail(400, "Invalid request value.");
  return value;
}
export function trustedUrl(value: string, local = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { return fail(503, "Passport URL configuration is invalid."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(local && loopback && url.protocol === "http:"))) return fail(503, "Passport requires HTTPS (or explicitly enabled localhost).");
  return url;
}

function readString(bytes: Buffer, cursor: { offset: number }, max = 512): string {
  if (cursor.offset + 4 > bytes.length) return fail(422, "Truncated chain data.");
  const size = bytes.readUInt32LE(cursor.offset); cursor.offset += 4;
  if (size > max || cursor.offset + size > bytes.length) return fail(422, "Invalid chain string.");
  const value = bytes.subarray(cursor.offset, cursor.offset + size).toString("utf8"); cursor.offset += size;
  return value;
}
const uriKey = (value: string) => value.replace(/^ipfs:\/\//, "").replace(/^https?:\/\/[^/]+\/ipfs\//, "");

/** Parse only operator-published approval entries; a compatible format alone
 * never confers approval or turns a model into a purchased entitlement. */
export function parsePassportCatalog(payload: unknown, config: PassportConfig): CatalogRecord[] {
  const source = object(payload);
  const values = source.avatars ?? source.items;
  if (!Array.isArray(values) || values.length > 2_000) return fail(502, "Registry returned an invalid catalog.");
  const ids = new Set<string>();
  return values.map((raw): CatalogRecord => {
    const item = object(raw), provenance = object(item.provenance);
    const template = address(provenance.avatarDataPda);
    const avatarId = `solana:devnet:avatar-data:${template}`;
    if (item.id !== avatarId || ids.has(avatarId) || !["devnet", "solana-devnet"].includes(provenance.network) || provenance.program !== config.programId) return fail(502, "Registry identity or network does not match passport.");
    ids.add(avatarId);
    if (!Number.isSafeInteger(provenance.avatarDataIndex) || provenance.avatarDataIndex < 0) return fail(502, "Registry template index is invalid.");
    const support: ProjectSupport[] = [];
    const approvedProjects = new Set<string>();
    for (const rawSupport of item.projectSupport ?? []) {
      const entry = object(rawSupport);
      if (entry.status !== "approved") continue;
      const projectId = project(entry.projectId);
      if (approvedProjects.has(projectId)) return fail(502, "Registry has ambiguous project support.");
      approvedProjects.add(projectId);
      const matches = (Array.isArray(item.renditions) ? item.renditions : []).filter((r: any) => r.platform === entry.platform && r.profile === entry.profile && r.status === "ready");
      if (matches.length !== 1) return fail(502, "Approved support has no unique ready rendition.");
      const rendition = matches[0];
      if (!/^[0-9a-f]{64}$/.test(rendition.sha256) || rendition.id !== `sha256:${rendition.sha256}` || !Number.isSafeInteger(rendition.sizeBytes) || rendition.sizeBytes < 1 || rendition.sizeBytes > 104_857_600) return fail(502, "Registry rendition integrity is invalid.");
      const url = trustedUrl(rendition.downloadUrl, config.allowLocalhost).toString();
      support.push({ projectId, platform: boundedString(entry.platform, 64), profile: boundedString(entry.profile, 64), status: "approved", rendition: { id: rendition.id, url, sha256: rendition.sha256, sizeBytes: rendition.sizeBytes, format: boundedString(rendition.format, 32) } });
    }
    const thumbnailUrl = trustedUrl(item.thumbnailUrl, config.allowLocalhost).toString();
    if (provenance.metadataSha256 !== undefined && !/^[0-9a-f]{64}$/.test(provenance.metadataSha256)) return fail(502, "Registry metadata integrity is invalid.");
    return { avatarId, template, index: BigInt(provenance.avatarDataIndex), metadataUri: boundedString(provenance.metadataUri, 512), metadataSha256: provenance.metadataSha256, name: boundedString(item.name, 256), thumbnailUrl, support };
  });
}
function publicAvatar(record: CatalogRecord): CatalogAvatar {
  return { avatarId: record.avatarId, name: record.name, thumbnailUrl: record.thumbnailUrl, support: record.support };
}

export class PassportService {
  readonly config: PassportConfig;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private sessions = new Map<string, Session>();
  private challenges = new Map<string, Challenge>();
  private devices = new Map<string, Device>();
  private tickets = new Map<string, Ticket>();
  private receipts = new Map<string, Receipt>();
  private issued = new Map<string, { count: number; until: number }>();
  private genesisVerified = false;
  private inflightRpc = new Map<string, Promise<any>>();

  constructor(config: PassportConfig, options: Options = {}) {
    this.config = { ...config, origin: trustedUrl(config.origin, config.allowLocalhost).origin };
    trustedUrl(config.rpcUrl, config.allowLocalhost); trustedUrl(config.catalogUrl, config.allowLocalhost); address(config.programId);
    this.fetcher = options.fetchImpl ?? fetch; this.now = options.now ?? Date.now;
  }
  private cleanup() {
    for (const map of [this.sessions, this.challenges, this.devices, this.tickets] as Map<string, { expiresAt: number }>[]) {
      for (const [key, value] of map) if (value.expiresAt <= this.now()) map.delete(key);
    }
    for (const [key, value] of this.issued) if (value.until <= this.now()) this.issued.delete(key);
  }
  private limit(key: string, maximum = 30) {
    this.cleanup();
    const current = this.issued.get(key) ?? { count: 0, until: this.now() + 60_000 };
    if (++current.count > maximum || this.issued.size > MAX_STATE) return fail(429, "Too many passport requests. Retry shortly.");
    this.issued.set(key, current);
    if (this.sessions.size + this.challenges.size + this.devices.size + this.tickets.size >= MAX_STATE) return fail(503, "Passport is busy. Retry shortly.");
  }
  private async jsonFetch(url: string, init?: RequestInit): Promise<any> {
    let response: Response | undefined;
    // Every upstream operation here is a read (including JSON-RPC POSTs).
    // Retry only transient transport/status failures, never signatures, writes
    // or user operations. Keep the complete retry budget below client timeout.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { response = await this.fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8_000) }); }
      catch {
        if (attempt === 2) return fail(503, "Passport registry or Solana RPC is unavailable.");
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
      await response.body?.cancel();
      const requested = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(requested) && requested > 0 ? Math.min(1_000, requested * 1_000) : 200 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (!response) return fail(503, "Passport registry or Solana RPC is unavailable.");
    if (!response.ok) return fail(503, "Passport registry or Solana RPC is unavailable.");
    const reader = response.body?.getReader();
    if (!reader) return fail(502, "Upstream response is empty.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); return fail(502, "Upstream response is too large."); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) { if (error instanceof PassportError) throw error; return fail(502, "Upstream returned invalid JSON."); }
  }
  private async rpc(method: string, params: unknown[] = []): Promise<any> {
    const requestKey = JSON.stringify([method, params]);
    const active = this.inflightRpc.get(requestKey);
    if (active) return active;
    const request = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const payload = await this.jsonFetch(this.config.rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        if ([429, -32005].includes(payload.error?.code) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
          continue;
        }
        if (payload.error || !("result" in payload)) return fail(503, "Solana RPC could not verify the request.");
        return payload.result;
      }
      return fail(503, "Solana RPC could not verify the request.");
    })();
    this.inflightRpc.set(requestKey, request);
    try { return await request; }
    finally { if (this.inflightRpc.get(requestKey) === request) this.inflightRpc.delete(requestKey); }
  }
  private async ensureDevnet() {
    if (this.genesisVerified) return;
    if (await this.rpc("getGenesisHash") !== DEVNET_GENESIS) return fail(503, "Configured RPC is not Solana devnet.");
    this.genesisVerified = true;
  }
  /** Fixed read surface shared by the browser minter transport. */
  async minterRead(method: string, params: unknown[]) {
    if (!["getAccountInfo", "getMultipleAccounts", "getLatestBlockhash", "getSignatureStatuses", "getBlockHeight", "isBlockhashValid", "getBalance", "getMinimumBalanceForRentExemption", "getGenesisHash", "getTransaction"].includes(method)) return fail(400, "Unsupported minter read.");
    await this.ensureDevnet();
    return this.rpc(method, params);
  }
  /** Called only after the route verifies the complete signed minter transaction.
   * No server key and no automatic resubmission after an uncertain response. */
  async submitMinterTransaction(encoded: string): Promise<string> {
    await this.ensureDevnet();
    let response: Response;
    try {
      response = await this.fetcher(this.config.rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [encoded, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 }] }), redirect: "error", signal: AbortSignal.timeout(8_000) });
    } catch { return fail(503, "Submission status is unknown. Check confirmation before another purchase."); }
    if (!response.ok) return fail(503, "Submission status is unknown. Check confirmation before another purchase.");
    const reader = response.body?.getReader();
    if (!reader) return fail(503, "Submission status is unknown. Check confirmation before another purchase.");
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 32_768) { await reader.cancel(); return fail(503, "Submission status is unknown. Check confirmation before another purchase."); } chunks.push(value); }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (payload.error) return fail(422, "Solana rejected the transaction. Check the wallet balance, collection supply and transaction details.");
      if (typeof payload.result !== "string") return fail(503, "Submission status is unknown. Check confirmation before another purchase.");
      decodeBase58(payload.result, 64);
      return payload.result;
    } catch (error) { if (error instanceof PassportError) throw error; return fail(503, "Submission status is unknown. Check confirmation before another purchase."); }
  }
  private async catalogRecords() { return parsePassportCatalog(await this.jsonFetch(this.config.catalogUrl), this.config); }
  async catalog() { return { schema: "ekza.passport.catalog.v1", network: "solana-devnet", items: (await this.catalogRecords()).map(publicAvatar) }; }
  private token(session: Session) {
    const accessToken = secret(); this.sessions.set(hash(accessToken), session);
    return { accessToken, expiresAt: iso(session.expiresAt), wallet: session.wallet };
  }
  authenticate(token: string): Session {
    const session = this.sessions.get(hash(boundedString(token)));
    if (!session || session.expiresAt <= this.now()) return fail(401, "Wallet session expired. Connect again.");
    return session;
  }
  identity(token: string) {
    const session = this.authenticate(token);
    if (session.purpose !== "identity") return fail(403, "Use an identity-only wallet session.");
    return { schema: "ekza.passport.identity.v1", network: "solana-devnet", wallet: session.wallet,
      projectId: session.projectId, purpose: session.purpose, expiresAt: iso(session.expiresAt) };
  }
  revoke(token: string) {
    this.authenticate(token);
    this.sessions.delete(hash(token));
    for (const [key, device] of this.devices) if (device.sessionKey === hash(token)) this.devices.delete(key);
    return { revoked: true };
  }
  private avatarSession(token: string) {
    const session = this.authenticate(token);
    if (session.purpose === "identity") return fail(403, "This session only verifies wallet identity.");
    return session;
  }
  authorizeCreatorUpload(token: string): string {
    const session = this.avatarSession(token);
    if (session.projectId) return fail(403, "Use a browser wallet session to upload an avatar.");
    this.limit(`creator-upload:${session.wallet}`, 12);
    this.limit("creator-upload:all", 60);
    return session.wallet;
  }
  device(projectId: unknown, purposeInput: unknown = "avatars") {
    this.limit("device", 100);
    if (purposeInput !== "avatars" && purposeInput !== "identity") return fail(400, "Unsupported session purpose.");
    const purpose = purposeInput;
    const deviceCode = secret(), userCode = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = this.now() + DEVICE_MS;
    this.devices.set(hash(deviceCode), { projectId: project(projectId), purpose, userCode, expiresAt });
    return { deviceCode, userCode, purpose, verificationUrl: `${this.config.origin}${purpose === "identity" ? "/auth/solana" : "/connect"}?userCode=${userCode}`, expiresAt: iso(expiresAt), interval: 3 };
  }
  deviceDetails(userCode: unknown) {
    const code = boundedString(userCode, 12).toUpperCase();
    const device = [...this.devices.values()].find((value) => value.userCode === code);
    if (!device || device.expiresAt <= this.now() || device.claimed) return fail(410, "Device pairing expired. Start again in the application.");
    return { projectId: device.projectId, purpose: device.purpose, userCode: device.userCode, expiresAt: iso(device.expiresAt) };
  }
  poll(deviceCode: unknown) {
    const device = this.devices.get(hash(boundedString(deviceCode)));
    if (!device || device.expiresAt <= this.now() || device.claimed) return fail(410, "Device pairing expired. Start again.");
    if (device.token && device.wallet) {
      const session = this.authenticate(device.token);
      device.claimed = true;
      const accessToken = device.token; delete device.token;
      return { status: "approved", accessToken, wallet: device.wallet, expiresAt: iso(session.expiresAt) };
    }
    if (device.lastPoll !== undefined && this.now() - device.lastPoll < 2_500) return fail(429, "Poll no more than once every 3 seconds.");
    device.lastPoll = this.now();
    return { status: "pending" };
  }
  challenge(walletInput: unknown, userCodeInput?: unknown) {
    const wallet = address(walletInput); this.limit(`challenge:${wallet}`, 10);
    const userCode = userCodeInput === undefined ? undefined : boundedString(userCodeInput, 12).toUpperCase();
    const device = userCode ? this.deviceDetails(userCode) : undefined;
    if (userCode && [...this.devices.values()].some((value) => value.userCode === userCode && value.token)) return fail(409, "This device has already been approved.");
    const challengeId = secret(), expiresAt = this.now() + CHALLENGE_MS;
    const message = [
      `${new URL(this.config.origin).host} requests an Ekza wallet sign-in.`,
      `Wallet: ${wallet}`, `URI: ${this.config.origin}`, "Network: solana-devnet",
      `Purpose: ${device ? `approve-device:${device.projectId}:${userCode}${device.purpose === "identity" ? ":identity-only" : ""}` : "browser-session"}`,
      `Nonce: ${challengeId}`, `Issued At: ${iso(this.now())}`, `Expiration Time: ${iso(expiresAt)}`,
      "This signature does not send a transaction or transfer funds.",
    ].join("\n");
    this.challenges.set(hash(challengeId), { wallet, userCode, message, expiresAt });
    return { challengeId, message, expiresAt: iso(expiresAt), ...(device ? { projectId: device.projectId, purpose: device.purpose } : {}) };
  }
  createSession(challengeIdInput: unknown, signatureInput: unknown) {
    const key = hash(boundedString(challengeIdInput)), challenge = this.challenges.get(key);
    this.challenges.delete(key); // Every attempt consumes this exact challenge.
    if (!challenge || challenge.expiresAt <= this.now()) return fail(401, "Wallet challenge expired or already used.");
    let valid = false;
    try {
      const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeBase58(challenge.wallet, 32)]), format: "der", type: "spki" });
      valid = verify(null, Buffer.from(challenge.message, "utf8"), key, decodeBase58(signatureInput as string, 64));
    } catch { valid = false; }
    if (!valid) return fail(401, "Wallet signature is invalid.");
    let device: Device | undefined;
    if (challenge.userCode) {
      this.deviceDetails(challenge.userCode);
      device = [...this.devices.values()].find((value) => value.userCode === challenge.userCode);
      if (!device || device.token || device.claimed) return fail(409, "This device has already been approved.");
    }
    const session = this.token({ wallet: challenge.wallet, projectId: device?.projectId, purpose: device?.purpose ?? "avatars", expiresAt: this.now() + SESSION_MS });
    if (device) { device.token = session.accessToken; device.sessionKey = hash(session.accessToken); device.wallet = challenge.wallet; }
    return session;
  }
  private async ownedMints(wallet: string): Promise<string[]> {
    await this.ensureDevnet();
    const response = await this.rpc("getTokenAccountsByOwner", [wallet, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed", commitment: "confirmed" }]);
    if (!Array.isArray(response?.value)) return fail(502, "Solana returned invalid ownership data.");
    const mints = new Set<string>();
    for (const row of response.value) {
      const info = row?.account?.data?.parsed?.info;
      if (row?.account?.owner === TOKEN_PROGRAM && info?.owner === wallet && info?.tokenAmount?.decimals === 0 && info?.tokenAmount?.amount === "1") mints.add(address(info.mint));
    }
    if (mints.size > 200) return fail(422, "This wallet exceeds the current 200-NFT library limit.");
    return [...mints];
  }
  private async catalogCandidates(mints: string[], records: CatalogRecord[]): Promise<string[]> {
    // Metadata is used only as a cheap prefilter. A counterfeit copying this
    // URI still has to pass actual mint-instruction/payment provenance below.
    const metadataProgram = new PublicKey(METADATA_PROGRAM);
    const candidates: string[] = [];
    const allowedUris = new Set(records.map((record) => uriKey(record.metadataUri)));
    for (let start = 0; start < mints.length; start += 100) {
      const group = mints.slice(start, start + 100);
      const keys = group.map((mint) => PublicKey.findProgramAddressSync([Buffer.from("metadata"), metadataProgram.toBuffer(), new PublicKey(mint).toBuffer()], metadataProgram)[0].toBase58());
      const response = await this.rpc("getMultipleAccounts", [keys, { encoding: "base64", commitment: "confirmed" }]);
      if (!Array.isArray(response?.value) || response.value.length !== group.length) return fail(502, "Solana returned incomplete metadata accounts.");
      response.value.forEach((account: any, offset: number) => {
        if (account?.owner !== METADATA_PROGRAM || !Array.isArray(account.data)) return;
        try {
          const bytes = Buffer.from(account.data[0], "base64");
          if (bytes[0] !== 4 || bytes.length < 65 || new PublicKey(bytes.subarray(33, 65)).toBase58() !== group[offset]) return;
          const cursor = { offset: 65 }; readString(bytes, cursor); readString(bytes, cursor);
          const uri = readString(bytes, cursor).replace(/\0/g, "").trim();
          if (allowedUris.has(uriKey(uri))) candidates.push(group[offset]);
        } catch { /* A malformed unrelated NFT is not a passport candidate. */ }
      });
    }
    return candidates;
  }
  private async readTemplate(template: string) {
    const account = (await this.rpc("getAccountInfo", [template, { encoding: "base64", commitment: "confirmed" }]))?.value;
    if (!account || account.owner !== this.config.programId || !Array.isArray(account.data) || account.data[1] !== "base64") return fail(422, "Avatar template is not owned by the configured minter.");
    const bytes = Buffer.from(account.data[0], "base64");
    if (!bytes.subarray(0, 8).equals(AVATAR_DISCRIMINATOR)) return fail(422, "Invalid AvatarData account.");
    const cursor = { offset: 8 }, uri = readString(bytes, cursor, 64);
    if (cursor.offset + 73 > bytes.length) return fail(422, "Truncated AvatarData account.");
    const creator = new PublicKey(bytes.subarray(cursor.offset, cursor.offset + 32)).toBase58(); cursor.offset += 32;
    const supply = bytes.readBigUInt64LE(cursor.offset); cursor.offset += 8;
    const minted = bytes.readBigUInt64LE(cursor.offset); cursor.offset += 8;
    const price = bytes.readBigUInt64LE(cursor.offset); cursor.offset += 16; // price + unclaimed
    const index = bytes.readBigUInt64LE(cursor.offset);
    const indexBytes = Buffer.alloc(8); indexBytes.writeBigUInt64LE(index);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("avatar_v1"), indexBytes], new PublicKey(this.config.programId));
    if (pda.toBase58() !== template || supply < 1n || minted > supply) return fail(422, "Avatar template does not match its canonical chain account.");
    return { price, creator, uri, index };
  }
  private async template(record: CatalogRecord) {
    const result = await this.readTemplate(record.template);
    if (result.index !== record.index || uriKey(result.uri) !== uriKey(record.metadataUri)) return fail(422, "Registry template does not match its canonical chain account.");
    return result;
  }
  /** Public content lookup, separate from ownership. Registered avatars require
   * the operator's exact metadata digest; newly published templates may be
   * browsed before game support is approved, using their on-chain IPFS CID. */
  async minterMetadataSource(templateInput: unknown) {
    const template = address(templateInput);
    await this.ensureDevnet();
    const [chain, records] = await Promise.all([this.readTemplate(template), this.catalogRecords()]);
    const record = records.find((item) => item.template === template);
    if (record && (record.index !== chain.index || uriKey(record.metadataUri) !== uriKey(chain.uri))) return fail(422, "Registry metadata does not match the canonical avatar template.");
    if (record && !record.metadataSha256) return fail(502, "Registered avatar metadata has no integrity digest.");
    const cid = uriKey(chain.uri);
    if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$/.test(cid)) return fail(422, "This metadata resolver requires a plain IPFS CID.");
    return { cid, sha256: record?.metadataSha256 };
  }
  /** Never accept NFT metadata as proof of purchase. Bind the account positions
   * in a successful instruction of the configured actual minter, and verify
   * its positive creator payment and minted token balance in the same tx. */
  async verifyReceipt(signatureInput: unknown, records?: CatalogRecord[]): Promise<Receipt[]> {
    const signature = boundedString(signatureInput, 100); decodeBase58(signature, 64);
    await this.ensureDevnet();
    const tx = await this.rpc("getTransaction", [signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    if (!tx || tx.meta?.err !== null || !tx.transaction?.signatures?.includes(signature)) return fail(422, "No successful mint transaction found.");
    const catalog = records ?? await this.catalogRecords();
    const message = tx.transaction.message;
    const keys: string[] = [...(message.accountKeys ?? []), ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])].map((key: any) => typeof key === "string" ? key : key.pubkey);
    const instructions: { instruction: any; nested: any[] }[] = [];
    for (const [index, instruction] of (message.instructions ?? []).entries()) {
      const inner = tx.meta.innerInstructions?.find((block: any) => block.index === index)?.instructions ?? [];
      instructions.push({ instruction, nested: inner });
    }
    // Current storefront emits a direct top-level mint. Do not infer CPI
    // success from a successful overall transaction: a caller can catch a
    // failed minter CPI whose inner effects were rolled back. Supporting
    // third-party CPI wrappers requires per-invocation success proof first.
    const verified: Receipt[] = [];
    for (const { instruction, nested } of instructions) {
      if (keys[instruction.programIdIndex] !== this.config.programId || typeof instruction.data !== "string") continue;
      let data: Buffer;
      try { data = decodeBase58(instruction.data); } catch { continue; }
      if (!data.subarray(0, 8).equals(MINT_DISCRIMINATOR)) continue;
      const accounts = (instruction.accounts ?? []).map((index: number) => keys[index]);
      const record = catalog.find((item) => item.template === accounts[0]);
      if (!record || accounts[6] !== TOKEN_PROGRAM || accounts[9] !== SYSTEM_PROGRAM) continue;
      const cursor = { offset: 8 };
      readString(data, cursor, 64); readString(data, cursor, 32); const uri = readString(data, cursor, 512);
      if (cursor.offset !== data.length || uriKey(uri) !== uriKey(record.metadataUri)) continue;
      const template = await this.template(record);
      const recipient = template.creator === SYSTEM_PROGRAM ? accounts[14] : accounts[5];
      const paid = template.price === 0n || nested.some((inner: any) => {
        if (keys[inner.programIdIndex] !== SYSTEM_PROGRAM || typeof inner.data !== "string") return false;
        try {
          const transfer = decodeBase58(inner.data);
          return transfer.length === 12 && transfer.readUInt32LE(0) === 2 && keys[inner.accounts[0]] === accounts[4] && keys[inner.accounts[1]] === recipient && transfer.readBigUInt64LE(4) === template.price;
        } catch { return false; }
      });
      const minted = (tx.meta.postTokenBalances ?? []).some((balance: any) => balance.mint === accounts[1] && balance.owner === accounts[4] && balance.programId === TOKEN_PROGRAM && balance.uiTokenAmount?.amount === "1" && balance.uiTokenAmount?.decimals === 0);
      if (!paid || !minted) continue;
      const receipt = { mint: address(accounts[1]), template: record.template, signature, priceLamports: template.price.toString() };
      this.receipts.set(receipt.mint, receipt); verified.push(receipt);
    }
    if (!verified.length) return fail(422, "Transaction has no verified avatar mint for this catalog.");
    return verified;
  }
  private async discover(mint: string, records: CatalogRecord[]): Promise<Receipt | null> {
    if (this.receipts.has(mint)) return this.receipts.get(mint)!;
    let before: string | undefined;
    // Bounded scan: fail explicitly when history is truncated instead of
    // quietly claiming the user owns no avatar. Receipt submission is a fast path.
    for (let page = 0; page < 20; page++) {
      const history = await this.rpc("getSignaturesForAddress", [mint, { limit: 100, commitment: "confirmed", ...(before ? { before } : {}) }]);
      if (!Array.isArray(history)) return fail(502, "Solana returned invalid transaction history.");
      for (const entry of [...history].reverse()) {
        if (entry.err !== null) continue;
        try { await this.verifyReceipt(entry.signature, records); }
        catch (error) { if (!(error instanceof PassportError) || error.status !== 422) throw error; }
        const receipt = this.receipts.get(mint); if (receipt) return receipt;
      }
      if (history.length < 100) return null;
      before = history[history.length - 1].signature;
    }
    return fail(503, "Mint history exceeds the discovery limit. Submit its original purchase receipt.");
  }
  private async purchase(wallet: string, mint: string, records: CatalogRecord[]): Promise<PurchasedAvatar | null> {
    const receipt = await this.discover(mint, records);
    if (!receipt) return null;
    const record = records.find((item) => item.template === receipt.template);
    if (!record) return null;
    const account = (await this.rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]))?.value;
    const info = account?.data?.parsed?.info;
    if (account?.owner !== TOKEN_PROGRAM || info?.supply !== "1" || info?.decimals !== 0 || info?.mintAuthority !== null || info?.freezeAuthority !== null) return null;
    return { ...publicAvatar(record), mint, priceLamports: receipt.priceLamports };
  }
  async library(accessToken: string) {
    const session = this.avatarSession(accessToken); this.limit(`library:${session.wallet}`, 15);
    const records = await this.catalogRecords();
    const mints = await this.catalogCandidates(await this.ownedMints(session.wallet), records), items: PurchasedAvatar[] = [];
    // Keep RPC load bounded; do not multiply requests by the wallet size.
    for (const mint of mints) {
      const item = await this.purchase(session.wallet, mint, records);
      if (item) items.push(item);
    }
    return { schema: "ekza.passport.library.v1", network: "solana-devnet", wallet: session.wallet, expiresAt: iso(session.expiresAt), items };
  }
  async receipt(accessToken: string, signature: unknown) {
    const session = this.avatarSession(accessToken); this.limit(`receipt:${session.wallet}`, 30);
    const verified = await this.verifyReceipt(signature), owned = new Set(await this.ownedMints(session.wallet));
    if (!verified.some((receipt) => owned.has(receipt.mint))) return fail(403, "This wallet does not currently own the avatar NFT.");
    return { verified: true, receipts: verified.filter((receipt) => owned.has(receipt.mint)) };
  }
  async ticket(accessToken: string, request: Record<string, unknown>) {
    const session = this.avatarSession(accessToken), projectId = project(request.projectId), mint = address(request.mint);
    this.limit(`ticket:${session.wallet}`, 60);
    if (session.projectId && session.projectId !== projectId) return fail(403, "This device session belongs to another project.");
    const sessionId = boundedString(request.sessionId, 128), avatarId = boundedString(request.avatarId, 128);
    const records = await this.catalogRecords();
    if (!(await this.ownedMints(session.wallet)).includes(mint)) return fail(403, "Wallet no longer owns this avatar.");
    const avatar = await this.purchase(session.wallet, mint, records);
    if (!avatar || avatar.avatarId !== avatarId) return fail(403, "No authenticated purchase matches this avatar.");
    const support = avatar.support.find((entry) => entry.projectId === projectId);
    if (!support) return fail(403, "This avatar has no approved rendition for this project.");
    const ticket = secret(), expiresAt = this.now() + TICKET_MS;
    this.tickets.set(hash(ticket), { wallet: session.wallet, avatarId, mint, projectId, sessionId, support, expiresAt });
    return { ticket, expiresAt: iso(expiresAt), avatar, support };
  }
  async consume(request: Record<string, unknown>) {
    const key = hash(boundedString(request.ticket)), value = this.tickets.get(key);
    if (!value || value.expiresAt <= this.now()) return fail(401, "Ticket expired or already consumed.");
    if (request.projectId !== value.projectId || request.sessionId !== value.sessionId) return fail(403, "Ticket belongs to another project or session.");
    // Delete synchronously before any await: concurrent consume requests cannot
    // both succeed. Even a subsequent upstream outage never re-enables a ticket.
    this.tickets.delete(key);
    if (!(await this.ownedMints(value.wallet)).includes(value.mint)) return fail(403, "Wallet no longer owns this avatar.");
    const record = (await this.catalogRecords()).find((item) => item.avatarId === value.avatarId);
    const current = record?.support.find((entry) => entry.projectId === value.projectId);
    if (!current || JSON.stringify(current) !== JSON.stringify(value.support)) return fail(403, "Approved rendition changed. Request a new ticket.");
    return { wallet: value.wallet, avatarId: value.avatarId, mint: value.mint, expiresAt: iso(value.expiresAt), support: value.support };
  }
}

function environmentConfig(): PassportConfig {
  const origin = process.env.EKZA_PASSPORT_ORIGIN;
  const rpcUrl = process.env.EKZA_PASSPORT_RPC_URL;
  const catalogUrl = process.env.EKZA_PASSPORT_REGISTRY_URL;
  if (!origin || !rpcUrl || !catalogUrl) return fail(503, "Passport is not configured. Set its origin, devnet RPC and registry URL.");
  return { origin, rpcUrl, catalogUrl, programId: process.env.EKZA_PASSPORT_MINTER_PROGRAM_ID || PASSPORT_PROGRAM, allowLocalhost: process.env.EKZA_PASSPORT_ALLOW_LOCALHOST === "1", allowedOrigins: (process.env.EKZA_PASSPORT_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean) };
}
let singleton: { key: string; service: PassportService } | undefined;
export function configuredService() {
  const config = environmentConfig(), key = JSON.stringify(config);
  if (!singleton || singleton.key !== key) singleton = { key, service: new PassportService(config) };
  return singleton.service;
}
async function requestJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "JSON body is required.");
  let text = "", size = 0; const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8_192) { await reader.cancel(); return fail(413, "Request is too large."); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const parsed = JSON.parse(text + decoder.decode());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail(400, "JSON object is required.");
    return parsed;
  } catch { return fail(400, "Invalid JSON body."); }
}
export async function handlePassportRequest(request: Request, path: string, providedService?: PassportService): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" });
  try {
    const service = providedService ?? configuredService();
    const origin = request.headers.get("origin"), config = service.config;
    const allowed = new Set([config.origin, ...(config.allowedOrigins ?? []).map((value) => trustedUrl(value, config.allowLocalhost).origin)]);
    if (origin && !allowed.has(origin)) return fail(403, "This browser origin is not allowed to access passport.");
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      return new Response(null, { status: 204, headers });
    }
    const bearer = () => {
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
      if (!match) return fail(401, "Connect your wallet to access passport.");
      return match[1];
    };
    let result: unknown;
    if (request.method === "GET" && path === "catalog") result = await service.catalog();
    else if (request.method === "GET" && path === "device") result = service.deviceDetails(new URL(request.url).searchParams.get("userCode"));
    else if (request.method === "GET" && path === "library") result = await service.library(bearer());
    else if (request.method === "GET" && path === "session") result = service.identity(bearer());
    else if (request.method === "DELETE" && path === "session") result = service.revoke(bearer());
    else if (request.method === "POST") {
      const body = await requestJson(request);
      switch (path) {
        case "device": result = service.device(body.projectId, body.purpose); break;
        case "device/poll": result = service.poll(body.deviceCode); break;
        case "challenge": result = service.challenge(body.wallet, body.userCode); break;
        case "session": result = service.createSession(body.challengeId, body.signature); break;
        case "receipt": result = await service.receipt(bearer(), body.signature); break;
        case "ticket": result = await service.ticket(bearer(), body); break;
        case "ticket/consume": result = await service.consume(body); break;
        default: return fail(404, "Passport endpoint not found.");
      }
    } else return fail(404, "Passport endpoint not found.");
    return new Response(JSON.stringify(result), { headers });
  } catch (error) {
    const known = error instanceof PassportError;
    return new Response(JSON.stringify({ error: known ? error.message : "Passport verification failed. Please retry." }), { status: known ? error.status : 503, headers });
  }
}
