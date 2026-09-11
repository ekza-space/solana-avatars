import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const source = await readFile(new URL("../app/lib/avatar-publication.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { publicationTerms, requireCurrentPreview, signPublicationTransaction, publicationAddressFromTransaction, checkPublicationConfirmation, publicationSignatureBytes, readPendingPublication, rememberPendingPublication, clearPendingPublication, requirePublicationStorage } = module.exports;
const terms = (price, supply = "1", name = "Robert", symbol = "ROB") => publicationTerms({ name, symbol, supply, price });

test("creator prices retain every lamport, including the full on-chain u64 range", () => {
  for (const [price, expected] of [["0", "0"], ["0.001", "1000000"], ["0.000000001", "1"], ["0.1", "100000000"], ["18446744073.709551615", "18446744073709551615"]]) {
    assert.equal(terms(price).priceLamports, expected);
  }
  assert.equal(terms("1", "18446744073709551615").maxSupply, "18446744073709551615");
});

test("invalid supply, precision and overflow fail before publication", () => {
  for (const price of ["-1", "NaN", "Infinity", "1e3", "0.0000000001", "18446744073.709551616"]) assert.throws(() => terms(price));
  for (const supply of ["0", "-1", "1.5", "1e3", "18446744073709551616"]) assert.throws(() => terms("0.001", supply));
});

test("collection text limits use UTF-8 bytes, not JavaScript character counts", () => {
  assert.equal(terms("0", "1", "🙂".repeat(8)).name, "🙂".repeat(8));
  assert.throws(() => terms("0", "1", "🙂".repeat(9)), /32 UTF-8/);
  assert.throws(() => terms("0", "1", "Robert", "界".repeat(4)), /10 UTF-8/);
});

test("publishing a replacement model cannot reuse another model's captured image", () => {
  const first = { name: "avatar.vrm" }, replacement = { name: "avatar.vrm" };
  const blob = new Blob(["captured PNG bytes"], { type: "image/png" });
  assert.equal(requireCurrentPreview(first, { file: first, blob }), blob);
  assert.throws(() => requireCurrentPreview(replacement, { file: first, blob }), /this model/);
  assert.throws(() => requireCurrentPreview(replacement, null));
  assert.throws(() => requireCurrentPreview(null, { file: first, blob }));
  assert.throws(() => requireCurrentPreview(first, { file: first, blob: new Blob([], { type: "image/png" }) }));
  assert.throws(() => requireCurrentPreview(first, { file: first, blob: new Blob(["model"], { type: "model/vrm" }) }));
});

test("a wallet change during Anchor preparation never opens the previous signing prompt", async () => {
  let calls = 0;
  await assert.rejects(signPublicationTransaction(async () => { calls++; return "signed"; }, () => { throw new Error("changed"); }), /changed/);
  assert.equal(calls, 0);
});

test("a wallet change while its prompt is open never returns stale signed bytes for broadcast", async () => {
  let current = true, finish;
  const signed = new Promise((resolve) => { finish = resolve; });
  const result = signPublicationTransaction(() => signed, () => { if (!current) throw new Error("changed"); });
  current = false;
  finish("old signed transaction");
  await assert.rejects(result, /changed/);
  assert.equal(await signPublicationTransaction(async () => "current signed transaction", () => {}), "current signed transaction");
});

test("pending publication recovers the exact signed initialize PDA for legacy and versioned transactions", () => {
  const program = new PublicKey("29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz");
  const registry = new PublicKey("11111111111111111111111111111111");
  const address = new PublicKey("3bfPehBVoBKXUUzmGGVT3tgQTYkpispqUKfPW1UktASL");
  const discriminator = [234, 87, 220, 236, 146, 157, 181, 84];
  const initialize = new TransactionInstruction({ programId: program,
    keys: [{ pubkey: registry, isWritable: true, isSigner: false }, { pubkey: address, isWritable: true, isSigner: false }],
    data: Buffer.from([...discriminator, 1, 2, 3]) });
  const legacy = new Transaction().add(initialize);
  const versioned = new VersionedTransaction(new TransactionMessage({ payerKey: registry, recentBlockhash: registry.toBase58(), instructions: [initialize] }).compileToV0Message());
  for (const transaction of [legacy, versioned]) {
    assert.equal(publicationAddressFromTransaction(transaction, program.toBase58(), discriminator), address.toBase58());
    assert.throws(() => publicationAddressFromTransaction(transaction, registry.toBase58(), discriminator), /exactly one/);
    assert.throws(() => publicationAddressFromTransaction(transaction, program.toBase58(), [0, ...discriminator.slice(1)]), /exactly one/);
  }
  assert.throws(() => publicationAddressFromTransaction(new Transaction().add(initialize, initialize), program.toBase58(), discriminator), /exactly one/);
  assert.throws(() => publicationAddressFromTransaction(legacy, program.toBase58(), []), /unavailable/);
});

test("only a confirmed original transaction outcome releases pending publication", async () => {
  for (const [value, expected] of [
    [null, "pending"],
    [{ confirmationStatus: "processed", err: null }, "pending"],
    [{ confirmationStatus: "processed", err: { InstructionError: [0, "Custom"] } }, "pending"],
    [{ confirmationStatus: "confirmed", err: null }, "confirmed"],
    [{ confirmationStatus: "finalized", err: null }, "confirmed"],
    [{ confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } }, "failed"],
  ]) {
    const connection = { async getSignatureStatuses(signatures, options) {
      assert.deepEqual(signatures, ["original-public-signature"]);
      assert.deepEqual(options, { searchTransactionHistory: true });
      return { value: [value] };
    } };
    assert.equal(await checkPublicationConfirmation(connection, "original-public-signature"), expected);
  }
  assert.equal(await checkPublicationConfirmation({ async getSignatureStatuses() { throw new Error("transient RPC outage"); } }, "original-public-signature"), "pending");
});

test("recovery uses the captured connection even after the active network changes", async () => {
  let originalReads = 0, replacementReads = 0;
  let activeConnection = { async getSignatureStatuses() { originalReads++; return { value: [{ confirmationStatus: "confirmed", err: null }] }; } };
  const pending = { connection: activeConnection, signature: "original-signature" };
  activeConnection = { async getSignatureStatuses() { replacementReads++; throw new Error("wrong network"); } };
  assert.equal(await checkPublicationConfirmation(pending.connection, pending.signature), "confirmed");
  assert.equal(originalReads, 1);
  assert.equal(replacementReads, 0);
});

const publicReceipt = { wallet: "2".repeat(32), network: "devnet", address: "3".repeat(32), signature: "4".repeat(88) };
function sessionStorageFixture(entries = new Map()) {
  return { entries, getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
}

test("a reload during the initial confirmation wait restores only four public receipt fields", () => {
  const initialTab = sessionStorageFixture();
  requirePublicationStorage(initialTab, publicReceipt.wallet, publicReceipt.network);
  // This write happens at the guarded wallet boundary, before returning signed
  // bytes to Anchor. It does not wait for a MinterPendingError timeout.
  rememberPendingPublication(initialTab, { ...publicReceipt, connection: { rpcEndpoint: "https://private-provider.invalid/key" }, deviceCode: "must-not-persist" });
  const reloadedTab = sessionStorageFixture(initialTab.entries);
  const restored = readPendingPublication(reloadedTab, publicReceipt.wallet, publicReceipt.network);
  assert.deepEqual(restored, publicReceipt);
  assert.deepEqual(Object.keys(JSON.parse([...initialTab.entries.values()][0])).sort(), ["address", "network", "signature", "wallet"]);
  assert.throws(() => rememberPendingPublication(reloadedTab, { ...publicReceipt, signature: "5".repeat(88) }), /earlier publication/);
  assert.equal(readPendingPublication(reloadedTab, "6".repeat(32), publicReceipt.network), null);
  assert.equal(readPendingPublication(reloadedTab, publicReceipt.wallet, "mainnet-beta"), null);
});

test("clearing a resolved receipt allows retry but cannot remove a newer pending signature", () => {
  const storage = sessionStorageFixture();
  rememberPendingPublication(storage, publicReceipt);
  clearPendingPublication(storage, publicReceipt);
  assert.equal(readPendingPublication(storage, publicReceipt.wallet, publicReceipt.network), null);
  const next = { ...publicReceipt, signature: "5".repeat(88) };
  rememberPendingPublication(storage, next);
  clearPendingPublication(storage, publicReceipt);
  assert.deepEqual(readPendingPublication(storage, publicReceipt.wallet, publicReceipt.network), next);
});

test("unavailable or corrupt recovery storage fails visibly before another signing attempt", () => {
  let walletCalls = 0;
  const unavailable = { getItem: () => null, setItem: () => { throw new Error("session storage denied"); }, removeItem: () => {} };
  assert.throws(() => { requirePublicationStorage(unavailable, publicReceipt.wallet, publicReceipt.network); walletCalls++; }, /denied/);
  assert.equal(walletCalls, 0);
  const silentFailure = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.throws(() => requirePublicationStorage(silentFailure, publicReceipt.wallet, publicReceipt.network), /unavailable/);
  const corrupt = sessionStorageFixture();
  rememberPendingPublication(corrupt, publicReceipt);
  corrupt.entries.set([...corrupt.entries.keys()][0], '{"signature":"garbage"}');
  assert.throws(() => readPendingPublication(corrupt, publicReceipt.wallet, publicReceipt.network), /invalid/);
});

test("only fully signed legacy or versioned transaction bytes provide the persisted public signature", () => {
  const signature = Uint8Array.from({ length: 64 }, (_, index) => index + 1);
  assert.deepEqual(publicationSignatureBytes({ signature }), signature);
  assert.deepEqual(publicationSignatureBytes({ signatures: [signature] }), signature);
  for (const transaction of [{ signature: null }, { signature: new Uint8Array(64) }, { signatures: [] }, { signature: new Uint8Array(12) }]) {
    assert.throws(() => publicationSignatureBytes(transaction), /did not return a signed/);
  }
});
