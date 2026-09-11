import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

const require = createRequire(import.meta.url);
async function load(name, dependencies = {}) {
  const source = (await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), "utf8")).replaceAll("import.meta.env", "({})");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((path) => dependencies[path] ?? require(path), module, module.exports);
  return module.exports;
}
const passport = await load("passport.server");
const { validateMinterTransaction, handleMinterRpc, minterReadParams } = await load("minter-rpc.server", { "./passport.server": passport });
const { MinterConnection, MinterPendingError, MinterRejectedError } = await load("minter-transport");
const { loadSelectedAvatar, readPendingPurchase, rememberPendingPurchase, clearPendingPurchase, signPurchaseForCurrentWallet } = await load("minter-selection");
const routes = await load("routes");
const { isPassportPurchaseRoute, isPassportPublicationRoute } = routes;
const { getIpfsGatewayBase, DEFAULT_PUBLIC_IPFS_GATEWAY } = await load("../utils/ipfsGateway", { "~/lib/routes": routes });
const { passportPurchaseHref } = await load("passport-client");
const { readOnlyMinterWallet } = await load("minter-reader");
const program = new PublicKey(passport.PASSPORT_PROGRAM), payer = Keypair.generate(), mint = Keypair.generate();
const token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), associated = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), metadata = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const hash = "QmUjTMKVJ397oHd4vA4wkCdr1V5U7GBN1eWdKJJARkffqV", index = 18n;
const disc = (name) => createHash("sha256").update(name).digest().subarray(0, 8);
const u64 = (value) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; };
const string = (value) => { const bytes = Buffer.from(value), length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); };
const pda = (seed, ordinal) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(ordinal === undefined ? [] : [u64(ordinal)])], program)[0];
const template = pda("avatar_v1", index), escrow = pda("avatar_escrow", index), registry = pda("avatar_registry");
const ata = PublicKey.findProgramAddressSync([payer.publicKey.toBuffer(), token.toBuffer(), mint.publicKey.toBuffer()], associated)[0];
const metadataPda = PublicKey.findProgramAddressSync([Buffer.from("metadata"), metadata.toBuffer(), mint.publicKey.toBuffer()], metadata)[0];
const key = (pubkey, isSigner = false, isWritable = true) => ({ pubkey: new PublicKey(pubkey), isSigner, isWritable });
function transaction(kind = "mint_nft", mutate = () => {}, signed = true) {
  const keys = kind === "mint_nft"
    ? [key(template), key(mint.publicKey, true), key(ata), key(metadataPda), key(payer.publicKey, true), key(escrow), key(token, false, false), key(associated, false, false), key(metadata, false, false), key(SystemProgram.programId, false, false), key("SysvarRent111111111111111111111111111111111", false, false)]
    : [key(registry), key(template), key(payer.publicKey, true), key(escrow), key(SystemProgram.programId, false, false)];
  const data = kind === "mint_nft" ? Buffer.concat([disc(`global:${kind}`), string("Robert"), string("EKZA"), string(`ipfs://${hash}`)]) : Buffer.concat([disc(`global:${kind}`), string(hash), u64(5n), u64(1_000_000n)]);
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(new TransactionInstruction({ programId: program, keys, data }));
  mutate(tx);
  if (signed) tx.sign(...(kind === "mint_nft" ? [payer, mint] : [payer]));
  return tx;
}
const encode = (tx) => tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
const state = Buffer.concat([disc("account:AvatarData"), string(hash), payer.publicKey.toBuffer(), u64(5n), u64(1n), u64(1_000_000n), u64(1_000_000n), u64(index), Buffer.from([1])]);
function service() {
  const calls = [], sent = [];
  return { config: { origin: "https://avatar.test", programId: program.toBase58() }, calls, sent,
    minterRead: async (method, params) => {
      calls.push({ method, params });
      if (method === "getAccountInfo") return { value: { owner: program.toBase58(), data: [(params[0] === registry.toBase58() ? Buffer.concat([disc("account:AvatarRegistry"), u64(index), Buffer.from([1])]) : state).toString("base64"), "base64"] } };
      return { context: { slot: 10 }, value: null };
    },
    submitMinterTransaction: async (encoded) => { sent.push(encoded); return bs58.encode(Transaction.from(Buffer.from(encoded, "base64")).signature); },
  };
}
function request(method, params, overrides = {}) {
  return new Request("https://avatar.test/api/devnet-rpc", { method: "POST", headers: { Origin: "https://avatar.test", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), ...overrides });
}

test("a Passport link resolves a canonical direct template with no Stellar relation and pins Devnet", async () => {
  const avatarId = `solana:devnet:avatar-data:${template}`;
  const href = passportPurchaseHref(avatarId), url = new URL(href, "https://avatar.test");
  assert.equal(url.searchParams.get("avatarData"), template.toBase58());
  assert.equal(isPassportPurchaseRoute(url.pathname, url.search), true);
  assert.equal(isPassportPublicationRoute("/deployer", "?network=devnet"), true);
  assert.equal(isPassportPurchaseRoute("/minter", `?avatarData=${template}&network=mainnet-beta`), false);
  const loaded = await loadSelectedAvatar(template.toBase58(), async () => ({ index: { toNumber: () => Number(index) } }), (value) => pda("avatar_v1", BigInt(value)).toBase58());
  assert.equal(loaded.avatarData, template.toBase58());
  await assert.rejects(loadSelectedAvatar(template.toBase58(), async () => ({ index: { toNumber: () => 19 } }), (value) => pda("avatar_v1", BigInt(value)).toBase58()), /canonical/);
});
test("fully signed canonical direct initialization and mint are accepted with the original bytes", async () => {
  for (const kind of ["initialize_avatar", "mint_nft"]) {
    const api = service(), encoded = encode(transaction(kind));
    assert.equal((await validateMinterTransaction(encoded, api)).encoded, encoded);
    const response = await handleMinterRpc(request("sendTransaction", [encoded, { encoding: "base64", skipPreflight: true, maxRetries: 99 }]), api);
    assert.equal(response.status, 200); assert.equal(typeof (await response.json()).result, "string"); assert.deepEqual(api.sent, [encoded]);
  }
});
test("unsigned, foreign-program, extra-instruction and altered canonical accounts never reach send", async () => {
  const fixtures = [transaction("mint_nft", () => {}, false), transaction("mint_nft", (tx) => { tx.instructions[0].programId = SystemProgram.programId; }), transaction("mint_nft", (tx) => { tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: template, lamports: 1 })); }), transaction("mint_nft", (tx) => { tx.instructions[0].keys[5].pubkey = registry; }), transaction("initialize_avatar", (tx) => { tx.instructions[0].keys[1].pubkey = pda("avatar_v1", 19n); })];
  for (const tx of fixtures) {
    const api = service(); const response = await handleMinterRpc(request("sendTransaction", [encode(tx), { encoding: "base64" }]), api);
    assert.equal(response.status, 400); assert.equal(api.sent.length, 0);
  }
});
test("RPC route rejects foreign/missing origins, batches, unknown methods and oversized bodies", async () => {
  const api = service();
  for (const origin of ["https://evil.test", "null", ""]) assert.equal((await handleMinterRpc(request("getLatestBlockhash", [], { headers: { Origin: origin, "Content-Type": "application/json" } }), api)).status, 403);
  assert.equal((await handleMinterRpc(request("requestAirdrop", [payer.publicKey.toBase58(), 1]), api)).status, 400);
  assert.equal((await handleMinterRpc(request("getLatestBlockhash", [], { body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] }]) }), api)).status, 400);
  assert.equal((await handleMinterRpc(request("getLatestBlockhash", [], { body: "x".repeat(8_193) }), api)).status, 413);
  assert.equal(api.calls.length, 0); assert.equal(api.sent.length, 0);
});
test("read methods rebuild bounded params and never accept arbitrary RPC options", () => {
  assert.deepEqual(minterReadParams("getAccountInfo", [template.toBase58(), { commitment: "processed", encoding: "base64" }]), [template.toBase58(), { commitment: "confirmed", encoding: "base64" }]);
  assert.throws(() => minterReadParams("getMultipleAccounts", [Array(21).fill(template.toBase58())]));
  assert.throws(() => minterReadParams("getAccountInfo", [template.toBase58(), { encoding: "jsonParsed" }]));
  assert.throws(() => minterReadParams("getProgramAccounts", [program.toBase58()]));
});
test("the actual shared service enforces Devnet and performs only one signed submission attempt", async () => {
  const calls = [];
  const api = new passport.PassportService({ origin: "https://avatar.test", rpcUrl: "https://rpc.test", catalogUrl: "https://catalog.test", programId: program.toBase58() }, { fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body); calls.push(payload);
    if (payload.method === "getGenesisHash") return Response.json({ result: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" });
    throw new Error("RPC private upstream detail must not escape");
  } });
  await assert.rejects(api.submitMinterTransaction(encode(transaction())), (error) => error.status === 503 && !error.message.includes("private"));
  assert.equal(calls.filter((call) => call.method === "sendTransaction").length, 1);
  assert.deepEqual(calls[1].params[1], { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
});
test("browser transport polls an uncertain signed submission without resending or opening a WebSocket", async () => {
  const calls = [], tx = transaction(), expected = bs58.encode(tx.signature);
  const connection = new MinterConnection("https://avatar.test", { pollIntervalMs: 1, confirmationTimeoutMs: 100, fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://avatar.test/api/devnet-rpc");
    const payload = JSON.parse(init.body); calls.push(payload.method);
    if (payload.method === "sendTransaction") return Response.json({ jsonrpc: "2.0", id: payload.id, error: { code: -32098, message: "Submission status is unknown. Check confirmation before another purchase." } }, { status: 503 });
    assert.equal(payload.method, "getSignatureStatuses");
    return Response.json({ jsonrpc: "2.0", id: payload.id, result: { context: { slot: 5 }, value: [{ slot: 5, confirmations: 1, err: null, confirmationStatus: "confirmed" }] } });
  } });
  const actual = await connection.sendRawTransaction(tx.serialize());
  assert.equal(actual, expected); assert.equal((await connection.confirmTransaction(actual, "confirmed")).value.err, null);
  assert.deepEqual(calls, ["sendTransaction", "getSignatureStatuses"]);
});
test("unconfirmed browser transaction keeps its signature and never reports success", async () => {
  const expected = bs58.encode(transaction().signature);
  const connection = new MinterConnection("https://avatar.test", { pollIntervalMs: 1, confirmationTimeoutMs: 12, fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body);
    return Response.json({ jsonrpc: "2.0", id: payload.id, result: { context: { slot: 5 }, value: [null] } });
  } });
  await assert.rejects(connection.confirmTransaction(expected), (error) => error instanceof MinterPendingError && error.signature === expected);
});

test("pending purchases survive a page reload, stay scoped to the buyer and do not erase a newer signature", () => {
  const original = globalThis.sessionStorage, values = new Map();
  globalThis.sessionStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  try {
    const pending = { wallet: payer.publicKey.toBase58(), network: "devnet", index: Number(index), signature: bs58.encode(transaction().signature) };
    rememberPendingPurchase(pending);
    assert.deepEqual(readPendingPurchase(pending.wallet, "devnet"), pending);
    assert.equal(readPendingPurchase(mint.publicKey.toBase58(), "devnet"), null);
    assert.equal(readPendingPurchase(pending.wallet, "mainnet-beta"), null);
    const newer = { ...pending, signature: bs58.encode(transaction().signature) };
    rememberPendingPurchase(newer); clearPendingPurchase(pending);
    assert.deepEqual(readPendingPurchase(pending.wallet, "devnet"), newer);
    clearPendingPurchase(newer); assert.equal(readPendingPurchase(pending.wallet, "devnet"), null);
  } finally { if (original === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = original; }
});

test("wrong-cluster RPC can never receive a signed submission", async () => {
  const calls = [];
  const api = new passport.PassportService({ origin: "https://avatar.test", rpcUrl: "https://rpc.test", catalogUrl: "https://catalog.test", programId: program.toBase58() }, { fetchImpl: async (_url, init) => {
    calls.push(JSON.parse(init.body).method); return Response.json({ result: "wrong-cluster" });
  } });
  await assert.rejects(api.submitMinterTransaction(encode(transaction())), (error) => error.status === 503);
  assert.deepEqual(calls, ["getGenesisHash"]);
});

test("a provider cannot substitute another successful signature for the signed purchase", async () => {
  const api = service(); api.submitMinterTransaction = async () => bs58.encode(transaction().signature);
  const response = await handleMinterRpc(request("sendTransaction", [encode(transaction()), { encoding: "base64" }]), api);
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, -32098);
});

test("purchase recovery is captured after signing but before signed bytes reach broadcast", async () => {
  const events = [], tx = transaction();
  const signed = await signPurchaseForCurrentWallet(tx, async (value) => { events.push("signed"); return value; }, () => true, (value) => { assert.ok(value.signature); events.push("saved"); });
  assert.equal(signed, tx); events.push("broadcast-ready");
  assert.deepEqual(events, ["signed", "saved", "broadcast-ready"]);
});

test("changing wallet while the purchase signing prompt is open discards signed bytes before broadcast", async () => {
  let current = true, release; const gate = new Promise((resolve) => { release = resolve; }); let captured = false;
  const operation = signPurchaseForCurrentWallet(transaction(), async (value) => { await gate; return value; }, () => current, () => { captured = true; });
  current = false; release();
  await assert.rejects(operation, /wallet changed/); assert.equal(captured, false);
});

test("a definite preflight rejection is actionable and never enters uncertain confirmation polling", async () => {
  const calls = [];
  const connection = new MinterConnection("https://avatar.test", { fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body); calls.push(payload.method);
    return Response.json({ jsonrpc: "2.0", id: payload.id, error: { code: -32002, message: "Solana rejected the transaction. Check the wallet balance." } }, { status: 422 });
  } });
  await assert.rejects(connection.sendRawTransaction(transaction().serialize()), (error) => error instanceof MinterRejectedError);
  assert.deepEqual(calls, ["sendTransaction"]);
});

test("a Devnet purchase or publication cannot inherit the old localnet IPFS gateway", () => {
  const original = globalThis.window;
  globalThis.window = { location: { pathname: "/minter", search: `?avatarData=${template}&network=devnet` }, localStorage: { getItem: () => "localnet" } };
  try {
    assert.equal(getIpfsGatewayBase(), DEFAULT_PUBLIC_IPFS_GATEWAY);
    globalThis.window.location = { pathname: "/deployer", search: "?network=devnet" };
    assert.equal(getIpfsGatewayBase(), DEFAULT_PUBLIC_IPFS_GATEWAY);
    globalThis.window.location = { pathname: "/minter", search: "" };
    assert.equal(getIpfsGatewayBase(), "/api/ipfs/");
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});

test("a visitor reads actual Anchor AvatarData and price without a wallet; the read-only provider cannot sign", async () => {
  const wallet = readOnlyMinterWallet(); let reads = 0;
  const connection = { getAccountInfoAndContext: async (address) => {
    assert.equal(address.toBase58(), template.toBase58()); reads++;
    return { context: { slot: 5 }, value: { data: state, owner: program, executable: false, lamports: 1 } };
  } };
  const idl = JSON.parse(await readFile(new URL("../../sdk/idl/avatar_nft_minter.json", import.meta.url), "utf8"));
  const anchorProgram = new Program(idl, new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions()));
  const account = await anchorProgram.account.avatarData.fetch(template);
  assert.equal(account.index.toString(), String(index));
  assert.equal(account.mintingFeePerMint.toString(), "1000000");
  assert.equal(account.uriIpfsHash, hash); assert.equal(reads, 1);
  await assert.rejects(wallet.signTransaction(transaction()), /Connect your wallet/);
  await assert.rejects(wallet.signAllTransactions([transaction()]), /Connect your wallet/);
});
