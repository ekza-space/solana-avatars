import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";

// Compile with the already-installed TS compiler. No files, validator, wallet,
// Pinata uploads, or network services are created by this suite.
const source = await readFile(new URL("../app/lib/passport.server.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
const { PassportService, PassportError, PASSPORT_PROGRAM, parsePassportCatalog, handlePassportRequest } = module.exports;
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes) {
  let number = BigInt(`0x${bytes.toString("hex") || "0"}`), value = "";
  while (number) { value = alphabet[Number(number % 58n)] + value; number /= 58n; }
  let zeros = 0; while (bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + value;
}
function keypair() {
  const pair = generateKeyPairSync("ed25519");
  return { ...pair, address: b58(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32)) };
}
const user = keypair(), other = keypair(), mint = new PublicKey(randomBytes(32)).toBase58();
const system = "11111111111111111111111111111111", token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const index = 18n, indexBytes = Buffer.alloc(8); indexBytes.writeBigUInt64LE(index);
const template = PublicKey.findProgramAddressSync([Buffer.from("avatar_v1"), indexBytes], new PublicKey(PASSPORT_PROGRAM))[0].toBase58();
const escrow = PublicKey.findProgramAddressSync([Buffer.from("avatar_escrow"), indexBytes], new PublicKey(PASSPORT_PROGRAM))[0].toBase58();
const cid = "QmWPWwLs5FmTBkqNQo86Qm4PgSSFp9zvsL91nqBHHG3Ptf";
const signature = b58(randomBytes(64));
const config = { origin: "https://avatar.example", rpcUrl: "https://rpc.example", catalogUrl: "https://registry.example/v1/avatars", programId: PASSPORT_PROGRAM, allowedOrigins: ["https://space.example"] };
function string(value) { const bytes = Buffer.from(value), length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); }
function avatarData(price = 1_000_000n) {
  const numbers = Buffer.alloc(41); [100n, 1n, price, price, index].forEach((v, i) => numbers.writeBigUInt64LE(v, i * 8));
  return Buffer.concat([createHash("sha256").update("account:AvatarData").digest().subarray(0, 8), string(cid), new PublicKey(user.address).toBuffer(), numbers]);
}
function catalog() {
  return { avatars: [{ id: `solana:devnet:avatar-data:${template}`, name: "Purchased fixture", thumbnailUrl: "https://assets.example/cover.png", provenance: { network: "solana-devnet", program: PASSPORT_PROGRAM, avatarDataPda: template, avatarDataIndex: Number(index), metadataUri: `ipfs://${cid}` }, renditions: [{ id: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64), sizeBytes: 10, platform: "universal", profile: "humanoid-glb-v1", format: "glb", status: "ready", downloadUrl: "https://assets.example/avatar.glb" }], projectSupport: ["ekza-space", "ekza-mirror", "omoba"].map((projectId) => ({ projectId, platform: "universal", profile: "humanoid-glb-v1", status: "approved" })) }] };
}
function transaction() {
  const keys = [template, mint, new PublicKey(randomBytes(32)).toBase58(), new PublicKey(randomBytes(32)).toBase58(), user.address, escrow, token, "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", system, "SysvarRent111111111111111111111111111111111", PASSPORT_PROGRAM];
  const data = Buffer.concat([createHash("sha256").update("global:mint_nft").digest().subarray(0, 8), string("Purchased"), string("EKZA"), string(`ipfs://${cid}`)]);
  const transfer = Buffer.alloc(12); transfer.writeUInt32LE(2); transfer.writeBigUInt64LE(1_000_000n, 4);
  return { transaction: { signatures: [signature], message: { accountKeys: keys, instructions: [{ programIdIndex: 11, accounts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], data: b58(data) }] } }, meta: { err: null, innerInstructions: [{ index: 0, instructions: [{ programIdIndex: 9, accounts: [4, 5], data: b58(transfer), stackHeight: 2 }] }], postTokenBalances: [{ mint, owner: user.address, programId: token, uiTokenAmount: { amount: "1", decimals: 0 } }] } };
}
function fixture(overrides = {}) {
  let time = 1_800_000_000_000;
  const state = { tx: transaction(), catalog: catalog(), price: 1_000_000n, owner: user.address, genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", templateOwner: PASSPORT_PROGRAM, ...overrides };
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (url === config.catalogUrl) return Response.json(state.catalog);
    assert.equal(url, config.rpcUrl);
    const { method, params } = JSON.parse(init.body); calls.push({ method, params });
    let result;
    if (method === "getGenesisHash") result = state.genesis;
    else if (method === "getTokenAccountsByOwner") result = { value: params[0] === state.owner ? [{ account: { owner: token, data: { parsed: { info: { owner: state.owner, mint, tokenAmount: { amount: "1", decimals: 0 } } } } } }] : [] };
    else if (method === "getAccountInfo") result = { value: params[0] === template ? { owner: state.templateOwner, data: [avatarData(state.price).toString("base64"), "base64"] } : { owner: token, data: { parsed: { info: { supply: "1", decimals: 0, mintAuthority: null, freezeAuthority: null } } } } };
    else if (method === "getMultipleAccounts") result = { value: params[0].map(() => ({ owner: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", data: [Buffer.concat([Buffer.from([4]), new PublicKey(user.address).toBuffer(), new PublicKey(mint).toBuffer(), string("Purchased"), string("EKZA"), string(`ipfs://${cid}`)]).toString("base64"), "base64"] })) };
    else if (method === "getTransaction") result = state.tx;
    else if (method === "getSignaturesForAddress") { assert.equal(params.length, 2); result = [{ signature, err: null }]; }
    else assert.fail(`Unexpected RPC ${method}`);
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
  const create = () => new PassportService(config, { fetchImpl, now: () => time });
  return { state, calls, create, fetchImpl, service: create(), advance: (ms) => { time += ms; } };
}
function login(service, pair = user, userCode) {
  const challenge = service.challenge(pair.address, userCode);
  const signature = b58(sign(null, Buffer.from(challenge.message), pair.privateKey));
  return service.createSession(challenge.challengeId, signature);
}
const rejected = (status) => (error) => error instanceof PassportError && error.status === status;

test("public metadata source binds the canonical chain template CID and registry digest", async () => {
  const f = fixture(), sha256 = "b".repeat(64);
  f.state.catalog.avatars[0].provenance.metadataSha256 = sha256;
  assert.deepEqual(await f.service.minterMetadataSource(template), { cid, sha256 });
  f.state.catalog.avatars[0].provenance.metadataUri = "ipfs://QmUjTMKVJ397oHd4vA4wkCdr1V5U7GBN1eWdKJJARkffqV";
  await assert.rejects(f.service.minterMetadataSource(template), rejected(422));
});
test("registered metadata requires an integrity digest and rejects counterfeit template ownership", async () => {
  const f = fixture();
  await assert.rejects(f.service.minterMetadataSource(template), rejected(502));
  f.state.catalog.avatars[0].provenance.metadataSha256 = "a".repeat(64);
  f.state.templateOwner = user.address;
  await assert.rejects(f.service.minterMetadataSource(template), rejected(422));
});
test("newly published unapproved templates are public content without acquiring game support", async () => {
  const f = fixture(); f.state.catalog.avatars = [];
  assert.deepEqual(await f.service.minterMetadataSource(template), { cid, sha256: undefined });
  assert.deepEqual((await f.service.catalog()).items, []);
  await assert.rejects(f.service.minterMetadataSource("https://attacker.example/private"), rejected(400));
});

test("Ed25519 wallet sign-in binds domain, purpose, nonce and expiry; rejects replay", () => {
  const { service } = fixture();
  const challenge = service.challenge(user.address);
  assert.match(challenge.message, /URI: https:\/\/avatar.example/);
  assert.match(challenge.message, /Network: solana-devnet/);
  assert.match(challenge.message, /Purpose: browser-session/);
  const signature = b58(sign(null, Buffer.from(challenge.message), user.privateKey));
  const session = service.createSession(challenge.challengeId, signature);
  assert.equal(session.wallet, user.address); assert.ok(Number.isFinite(Date.parse(session.expiresAt)));
  assert.throws(() => service.createSession(challenge.challengeId, signature), rejected(401));
  for (const replacement of ["https://attacker.example", "approve-device:omoba:123"]) {
    const c = service.challenge(user.address);
    const text = replacement.startsWith("http") ? c.message.replace("https://avatar.example", replacement) : c.message.replace("browser-session", replacement);
    assert.throws(() => service.createSession(c.challengeId, b58(sign(null, Buffer.from(text), user.privateKey))), rejected(401));
  }
});
test("wrong signer and expired challenges fail and attempted challenges are consumed", () => {
  const f = fixture(), c = f.service.challenge(user.address);
  assert.throws(() => f.service.createSession(c.challengeId, b58(sign(null, Buffer.from(c.message), other.privateKey))), rejected(401));
  assert.throws(() => f.service.createSession(c.challengeId, b58(sign(null, Buffer.from(c.message), user.privateKey))), rejected(401));
  const expired = f.service.challenge(user.address); f.advance(300_001);
  assert.throws(() => f.service.createSession(expired.challengeId, b58(sign(null, Buffer.from(expired.message), user.privateKey))), rejected(401));
});
test("device code is secret, approval binds project, cannot be replaced or polled twice", async () => {
  const f = fixture(), pairing = f.service.device("omoba");
  assert.equal(new URL(pairing.verificationUrl).searchParams.get("userCode"), pairing.userCode);
  assert.equal(pairing.verificationUrl.includes(pairing.deviceCode), false);
  assert.equal(f.service.deviceDetails(pairing.userCode).projectId, "omoba");
  assert.deepEqual(f.service.poll(pairing.deviceCode), { status: "pending" });
  login(f.service, user, pairing.userCode);
  assert.throws(() => f.service.challenge(other.address, pairing.userCode), rejected(409));
  const approved = f.service.poll(pairing.deviceCode);
  assert.equal(approved.status, "approved");
  assert.throws(() => f.service.poll(pairing.deviceCode), rejected(410));
  await assert.rejects(f.service.ticket(approved.accessToken, { projectId: "ekza-space", avatarId: f.state.catalog.avatars[0].id, mint, sessionId: "session" }), rejected(403));
});
test("pairing/session expiry are enforced", () => {
  const f = fixture(), pair = f.service.device("ekza-mirror"), session = login(f.service);
  f.advance(600_001); assert.throws(() => f.service.deviceDetails(pair.userCode), rejected(410));
  assert.throws(() => f.service.poll(pair.deviceCode), rejected(410));
  f.advance(1_200_000); assert.throws(() => f.service.authenticate(session.accessToken), rejected(401));
});
test("paid mint receipt binds program, instruction, canonical template, payment and minted balance", async () => {
  const f = fixture(), session = login(f.service);
  const receipt = await f.service.receipt(session.accessToken, signature);
  assert.equal(receipt.verified, true); assert.equal(receipt.receipts[0].priceLamports, "1000000");
  assert.equal(receipt.receipts[0].template, template);
  const library = await f.service.library(session.accessToken);
  assert.equal(library.items[0].mint, mint); assert.equal(library.items[0].avatarId, f.state.catalog.avatars[0].id);
  assert.equal(library.items[0].support.length, 3);
});
test("provenance reconstructs after process restart without trusting copied NFT metadata", async () => {
  const f = fixture(); await f.service.verifyReceipt(signature);
  const restarted = f.create(), session = login(restarted);
  const library = await restarted.library(session.accessToken);
  assert.equal(library.items.length, 1);
  assert.ok(f.calls.some((call) => call.method === "getSignaturesForAddress"));
  const forged = fixture(); forged.state.tx.transaction.message.accountKeys[11] = other.address;
  const fakeSession = login(forged.service);
  assert.deepEqual((await forged.service.library(fakeSession.accessToken)).items, []);
});
test("failed tx, wrong program/template, altered discriminator and unpaid priced mints are rejected", async () => {
  const variants = [
    (f) => { f.state.tx.meta.err = { InstructionError: [0, "Custom"] }; },
    (f) => { f.state.tx.transaction.message.accountKeys[11] = other.address; },
    (f) => { f.state.tx.transaction.message.accountKeys[0] = other.address; },
    (f) => { f.state.tx.transaction.message.instructions[0].data = b58(Buffer.alloc(16)); },
    (f) => { f.state.tx.meta.innerInstructions = []; },
    (f) => { f.state.tx.meta.postTokenBalances[0].owner = other.address; },
    (f) => { f.state.templateOwner = other.address; },
  ];
  for (const mutate of variants) { const f = fixture(); mutate(f); await assert.rejects(f.service.verifyReceipt(signature), rejected(422)); }
});
test("authentically issued free avatars remain usable and are explicitly labelled zero price", async () => {
  const f = fixture({ price: 0n }); f.state.tx.meta.innerInstructions = [];
  const session = login(f.service);
  const receipt = await f.service.receipt(session.accessToken, signature);
  assert.equal(receipt.receipts[0].priceLamports, "0");
  const library = await f.service.library(session.accessToken);
  assert.equal(library.items.length, 1); assert.equal(library.items[0].priceLamports, "0");
});
test("caught failed minter CPI cannot impersonate a successful mint instruction", async () => {
  const f = fixture(), original = f.state.tx.transaction.message.instructions[0];
  f.state.tx.transaction.message.accountKeys.push(other.address);
  f.state.tx.transaction.message.instructions = [{ programIdIndex: 12, accounts: [], data: "1" }];
  f.state.tx.meta.innerInstructions[0].instructions = [{ ...original, stackHeight: 2 }, ...f.state.tx.meta.innerInstructions[0].instructions.map((value) => ({ ...value, stackHeight: 3 }))];
  // Outer success, a later independent NFT/transfer may mimic post-balances.
  f.state.tx.meta.logMessages = [`Program ${PASSPORT_PROGRAM} invoke [2]`, `Program ${PASSPORT_PROGRAM} failed: custom program error`, `Program ${other.address} success`];
  await assert.rejects(f.service.verifyReceipt(signature), rejected(422));
});
test("wrong cluster fails before querying purchased state", async () => {
  const f = fixture({ genesis: "mainnet-genesis" });
  await assert.rejects(f.service.verifyReceipt(signature), rejected(503));
  assert.equal(f.calls.length, 1);
});
test("read-only HTTP 429/503 retry is bounded and an exhausted RPC fails closed", async () => {
  const f = fixture(); let attempts = 0;
  const service = new PassportService(config, { fetchImpl: async (url, init) => {
    if (url === config.rpcUrl && JSON.parse(init.body).method === "getGenesisHash" && ++attempts < 3) return new Response("busy", { status: attempts === 1 ? 429 : 503 });
    return f.fetchImpl(url, init);
  } });
  await service.verifyReceipt(signature); assert.equal(attempts, 3);
  let failures = 0;
  const unavailable = new PassportService(config, { fetchImpl: async () => { failures++; return new Response("busy", { status: 503 }); } });
  await assert.rejects(unavailable.verifyReceipt(signature), rejected(503));
  assert.equal(failures, 3);
});
test("concurrent identical reads coalesce in-flight only; next ownership read sees transfer", async () => {
  const f = fixture(), session = login(f.service);
  await Promise.all([f.service.library(session.accessToken), f.service.library(session.accessToken)]);
  assert.equal(f.calls.filter((call) => call.method === "getTokenAccountsByOwner").length, 1);
  f.state.owner = other.address;
  assert.deepEqual((await f.service.library(session.accessToken)).items, []);
  assert.equal(f.calls.filter((call) => call.method === "getTokenAccountsByOwner").length, 2);
});
test("someone else's authentic purchase does not grant this wallet access", async () => {
  const f = fixture(), session = login(f.service, other);
  await assert.rejects(f.service.receipt(session.accessToken, signature), rejected(403));
  assert.deepEqual((await f.service.library(session.accessToken)).items, []);
});
test("one-use tickets reject wrong scope/session, concurrency replay, transfer and expiry", async () => {
  const f = fixture(), session = login(f.service), request = { projectId: "omoba", avatarId: f.state.catalog.avatars[0].id, mint, sessionId: "game-session-unique-nonce" };
  const issued = await f.service.ticket(session.accessToken, request);
  await assert.rejects(f.service.consume({ ticket: issued.ticket, projectId: "ekza-space", sessionId: request.sessionId }), rejected(403));
  await assert.rejects(f.service.consume({ ticket: issued.ticket, projectId: "omoba", sessionId: "different" }), rejected(403));
  const consumed = await Promise.allSettled([f.service.consume({ ...request, ticket: issued.ticket }), f.service.consume({ ...request, ticket: issued.ticket })]);
  assert.equal(consumed.filter((result) => result.status === "fulfilled").length, 1);
  const transferred = await f.service.ticket(session.accessToken, request); f.state.owner = other.address;
  await assert.rejects(f.service.consume({ ...request, ticket: transferred.ticket }), rejected(403));
  await assert.rejects(f.service.ticket(session.accessToken, request), rejected(403));
  f.state.owner = user.address;
  const expired = await f.service.ticket(session.accessToken, request); f.advance(60_001);
  await assert.rejects(f.service.consume({ ...request, ticket: expired.ticket }), rejected(401));
});
test("revoked or replaced project approval cannot be consumed", async () => {
  const f = fixture(), session = login(f.service), request = { projectId: "omoba", avatarId: f.state.catalog.avatars[0].id, mint, sessionId: "session" };
  const issued = await f.service.ticket(session.accessToken, request);
  f.state.catalog.avatars[0].projectSupport = [];
  await assert.rejects(f.service.consume({ ...request, ticket: issued.ticket }), rejected(403));
  await assert.rejects(f.service.ticket(session.accessToken, request), rejected(403));
});
test("catalog requires explicit approval and unambiguous approved rendition", () => {
  const raw = catalog(); delete raw.avatars[0].projectSupport;
  assert.deepEqual(parsePassportCatalog(raw, config)[0].support, []);
  const duplicate = catalog(); duplicate.avatars[0].renditions.push({ ...duplicate.avatars[0].renditions[0] });
  assert.throws(() => parsePassportCatalog(duplicate, config), rejected(502));
  const identity = catalog(); identity.avatars[0].provenance.program = other.address;
  assert.throws(() => parsePassportCatalog(identity, config), rejected(502));
});
test("HTTP CORS permits exact configured browsers and native requests, denies unrelated origins", async () => {
  const { service } = fixture();
  const request = (origin) => new Request(`${config.origin}/api/passport/catalog`, { headers: origin ? { Origin: origin } : {} });
  assert.equal((await handlePassportRequest(request("https://evil.example"), "catalog", service)).status, 403);
  const good = await handlePassportRequest(request("https://space.example"), "catalog", service);
  assert.equal(good.status, 200); assert.equal(good.headers.get("access-control-allow-origin"), "https://space.example");
  const native = await handlePassportRequest(request(), "catalog", service);
  assert.equal(native.status, 200); assert.equal(native.headers.has("access-control-allow-origin"), false);
  const preflight = await handlePassportRequest(new Request(`${config.origin}/api/passport/ticket`, { method: "OPTIONS", headers: { Origin: "https://space.example" } }), "ticket", service);
  assert.equal(preflight.status, 204); assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);
});
test("HTTP rejects oversized JSON, form posts and missing authentication without leaking secrets", async () => {
  const { service } = fixture();
  const route = (path, options = {}) => handlePassportRequest(new Request(`${config.origin}/api/passport/${path}`, options), path, service);
  assert.equal((await route("library")).status, 401);
  assert.equal((await route("challenge", { method: "POST", body: "wallet=x" })).status, 415);
  assert.equal((await route("challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(9_000) }) })).status, 413);
  const response = await route("device/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode: "keep-this-secret" }) });
  assert.equal((await response.text()).includes("keep-this-secret"), false);
});
