import { createHash } from "node:crypto";
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { configuredService, decodeBase58, PassportError, type PassportService } from "./passport.server";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SYSTEM = "11111111111111111111111111111111";
const RENT = "SysvarRent111111111111111111111111111111111";
const discriminator = (name: string) => createHash("sha256").update(name).digest().subarray(0, 8);
const rejected = (message = "This transaction is not a supported avatar publication or purchase."): never => { throw new PassportError(400, message); };
const address = (value: unknown) => { if (typeof value !== "string") return rejected(); decodeBase58(value, 32); return value; };
const signature = (value: unknown) => { if (typeof value !== "string") return rejected(); decodeBase58(value, 64); return value; };
const plain = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const noExtra = (value: unknown, allowed: string[]) => { if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key)))) rejected("Unsupported RPC options."); };
const chainOptions = { commitment: "confirmed" };

export function minterReadParams(method: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) return rejected("RPC params must be an array.");
  const params = value;
  switch (method) {
    case "getGenesisHash": if (params.length !== 0) return rejected(); return [];
    case "getLatestBlockhash": case "getBlockHeight":
      if (params.length > 1) return rejected(); noExtra(params[0], ["commitment", "minContextSlot"]); return [chainOptions];
    case "getAccountInfo": case "getBalance": case "isBlockhashValid":
      if (params.length < 1 || params.length > 2) return rejected();
      noExtra(params[1], ["commitment", "encoding", "minContextSlot"]);
      if (plain(params[1]).encoding !== undefined && plain(params[1]).encoding !== "base64") return rejected("Use base64 account encoding.");
      return [address(params[0]), { ...chainOptions, ...(method === "getAccountInfo" ? { encoding: "base64" } : {}) }];
    case "getMultipleAccounts": {
      if (params.length < 1 || params.length > 2 || !Array.isArray(params[0]) || params[0].length < 1 || params[0].length > 20) return rejected();
      noExtra(params[1], ["commitment", "encoding", "minContextSlot"]);
      if (plain(params[1]).encoding !== undefined && plain(params[1]).encoding !== "base64") return rejected();
      return [params[0].map(address), { ...chainOptions, encoding: "base64" }];
    }
    case "getSignatureStatuses":
      if (params.length < 1 || params.length > 2 || !Array.isArray(params[0]) || params[0].length < 1 || params[0].length > 10) return rejected();
      noExtra(params[1], ["searchTransactionHistory"]); return [params[0].map(signature), { searchTransactionHistory: true }];
    case "getMinimumBalanceForRentExemption":
      if (params.length < 1 || params.length > 2 || !Number.isSafeInteger(params[0]) || Number(params[0]) < 0 || Number(params[0]) > 65_536) return rejected();
      noExtra(params[1], ["commitment"]); return [params[0], chainOptions];
    case "getTransaction":
      if (params.length < 1 || params.length > 2) return rejected();
      noExtra(params[1], ["encoding", "commitment", "maxSupportedTransactionVersion"]);
      return [signature(params[0]), { ...chainOptions, encoding: "json", maxSupportedTransactionVersion: 0 }];
    default: return rejected("This RPC method is not available for the avatar minter.");
  }
}

function readString(data: Buffer, cursor: { offset: number }, maximum: number): string {
  if (cursor.offset + 4 > data.length) return rejected();
  const length = data.readUInt32LE(cursor.offset); cursor.offset += 4;
  if (length < 1 || length > maximum || cursor.offset + length > data.length) return rejected();
  const result = data.subarray(cursor.offset, cursor.offset + length).toString("utf8"); cursor.offset += length;
  return result;
}
const pda = (seed: string, program: PublicKey, index?: bigint) => {
  const seeds = [Buffer.from(seed)];
  if (index !== undefined) { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(index); seeds.push(bytes); }
  return PublicKey.findProgramAddressSync(seeds, program)[0];
};
async function accountBytes(service: PassportService, key: PublicKey, kind: string): Promise<Buffer> {
  const account = (await service.minterRead("getAccountInfo", [key.toBase58(), { ...chainOptions, encoding: "base64" }]))?.value;
  if (!account || account.owner !== service.config.programId || !Array.isArray(account.data) || account.data[1] !== "base64") return rejected("The canonical minter account is unavailable.");
  const bytes = Buffer.from(account.data[0], "base64");
  if (!bytes.subarray(0, 8).equals(discriminator(`account:${kind}`))) return rejected();
  return bytes;
}

/** Validate signatures and the entire direct legacy transaction before any send.
 * Only the payer's own signature authorizes spending; the server never signs. */
export async function validateMinterTransaction(encoded: unknown, service: PassportService): Promise<{ transaction: Transaction; encoded: string }> {
  if (typeof encoded !== "string" || encoded.length > 1_644 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return rejected();
  let tx: Transaction; let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64");
    if (bytes.length > 1_232 || bytes.toString("base64") !== encoded) return rejected();
    tx = Transaction.from(bytes);
    if (!tx.feePayer || !tx.verifySignatures() || !tx.serialize().equals(bytes)) return rejected("The transaction must have every required wallet signature.");
  } catch { return rejected("The transaction must be a fully signed legacy transaction."); }
  if (tx.instructions.length !== 1 || !tx.instructions[0].programId.equals(new PublicKey(service.config.programId))) return rejected();
  const ix = tx.instructions[0], keys = ix.keys, cursor = { offset: 8 }, program = ix.programId;
  const requireKey = (position: number, expected: PublicKey | string, signer: boolean, writable: boolean) => {
    const key = keys[position];
    if (!key || key.pubkey.toBase58() !== String(expected) || key.isSigner !== signer || key.isWritable !== writable) rejected();
  };
  if (ix.data.subarray(0, 8).equals(discriminator("global:initialize_avatar"))) {
    if (keys.length !== 5 || tx.signatures.length !== 1) return rejected();
    readString(ix.data, cursor, 64);
    if (cursor.offset + 16 !== ix.data.length || ix.data.readBigUInt64LE(cursor.offset) === 0n) return rejected();
    const registry = pda("avatar_registry", program), state = await accountBytes(service, registry, "AvatarRegistry");
    if (state.length < 17) return rejected();
    const index = state.readBigUInt64LE(8);
    requireKey(0, registry, false, true); requireKey(1, pda("avatar_v1", program, index), false, true);
    requireKey(2, tx.feePayer!, true, true); requireKey(3, pda("avatar_escrow", program, index), false, true); requireKey(4, SYSTEM, false, false);
  } else if (ix.data.subarray(0, 8).equals(discriminator("global:mint_nft"))) {
    if (keys.length !== 11 || tx.signatures.length !== 2) return rejected("Only direct avatar purchases are supported by this Devnet transport.");
    readString(ix.data, cursor, 32); readString(ix.data, cursor, 10); const uri = readString(ix.data, cursor, 200);
    if (cursor.offset !== ix.data.length) return rejected();
    const state = await accountBytes(service, keys[0].pubkey, "AvatarData"), stateCursor = { offset: 8 }, hash = readString(state, stateCursor, 64);
    if (stateCursor.offset + 73 > state.length || uri !== (hash.startsWith("http://") || hash.startsWith("https://") || hash.startsWith("local:") ? hash : `ipfs://${hash}`)) return rejected();
    const index = state.readBigUInt64LE(stateCursor.offset + 64), mint = keys[1].pubkey, payer = tx.feePayer!;
    const ata = PublicKey.findProgramAddressSync([payer.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ASSOCIATED)[0];
    const metadata = PublicKey.findProgramAddressSync([Buffer.from("metadata"), METADATA.toBuffer(), mint.toBuffer()], METADATA)[0];
    requireKey(0, pda("avatar_v1", program, index), false, true); requireKey(1, mint, true, true); requireKey(2, ata, false, true);
    requireKey(3, metadata, false, true); requireKey(4, payer, true, true); requireKey(5, pda("avatar_escrow", program, index), false, true);
    requireKey(6, TOKEN, false, false); requireKey(7, ASSOCIATED, false, false); requireKey(8, METADATA, false, false); requireKey(9, SYSTEM, false, false); requireKey(10, RENT, false, false);
  } else return rejected();
  return { transaction: tx, encoded };
}

let reads = { until: 0, count: 0 }, sends = { until: 0, count: 0 };
function rateLimit(sending: boolean) {
  const state = sending ? sends : reads;
  if (state.until < Date.now()) { state.until = Date.now() + 60_000; state.count = 0; }
  if (++state.count > (sending ? 30 : 300)) throw new PassportError(429, "The minter is busy. Retry shortly.");
}
export async function handleMinterRpc(request: Request, provided?: PassportService): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
  let id: number | string | null = null, sending = false;
  try {
    const service = provided ?? configuredService();
    if (request.headers.get("origin") !== service.config.origin || new URL(request.url).origin !== service.config.origin) throw new PassportError(403, "Use the avatar store's own origin.");
    if (request.method !== "POST" || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PassportError(415, "Use a JSON POST.");
    const reader = request.body?.getReader(); if (!reader) return rejected();
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8_192) { await reader.cancel(); throw new PassportError(413, "RPC request is too large."); } chunks.push(value); }
    let body: any; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return rejected("Invalid JSON RPC request."); }
    if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some((key) => !["jsonrpc", "id", "method", "params"].includes(key)) || body.jsonrpc !== "2.0" || !(Number.isSafeInteger(body.id) || (typeof body.id === "string" && body.id.length <= 64)) || typeof body.method !== "string") return rejected("Use one JSON RPC request.");
    id = body.id; sending = body.method === "sendTransaction"; rateLimit(sending);
    let result: unknown;
    if (sending) {
      if (!Array.isArray(body.params) || body.params.length < 1 || body.params.length > 2) return rejected();
      noExtra(body.params[1], ["encoding", "skipPreflight", "preflightCommitment", "maxRetries", "minContextSlot"]);
      if (plain(body.params[1]).encoding !== "base64") return rejected("Use base64 transactions.");
      const validated = await validateMinterTransaction(body.params[0], service);
      result = await service.submitMinterTransaction(validated.encoded);
      if (result !== bs58.encode(validated.transaction.signature!)) throw new PassportError(503, "Submission status is unknown. Check confirmation before another purchase.");
    } else result = await service.minterRead(body.method, minterReadParams(body.method, body.params));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers });
  } catch (error) {
    const known = error instanceof PassportError, status = known ? error.status : 503;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: status >= 500 && sending ? -32098 : status >= 500 ? -32005 : status === 422 ? -32002 : -32602, message: known ? error.message : "The minter RPC is unavailable. Please retry." } }), { status, headers });
  }
}
