import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import bs58 from "bs58";

const require = createRequire(import.meta.url);
async function load(name, dependencies = {}) {
  const source = await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((path) => dependencies[path] ?? require(path), module, module.exports);
  return module.exports;
}
const passport = await load("passport.server"), browser = await load("passport-client");
const { handleCreatorUpload } = await load("creator-upload.server", { "./passport.server": passport });
const { creatorUploadSession, uploadCreatorContent } = await load("creator-upload", { "./passport-client": browser });
const key = generateKeyPairSync("ed25519"), wallet = bs58.encode(key.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const cid = "QmUjTMKVJ397oHd4vA4wkCdr1V5U7GBN1eWdKJJARkffqV", uri = `https://ekza.mypinata.cloud/ipfs/${cid}`;
function fixture() {
  let time = Date.now();
  const service = new passport.PassportService({ origin: "https://avatar.example", rpcUrl: "https://rpc.example", catalogUrl: "https://registry.example/v1/avatars", programId: passport.PASSPORT_PROGRAM }, { now: () => time, fetchImpl: async () => assert.fail("Upload authentication does not query a chain or registry") });
  function login(userCode) {
    const challenge = service.challenge(wallet, userCode);
    return service.createSession(challenge.challengeId, bs58.encode(sign(null, Buffer.from(challenge.message), key.privateKey)));
  }
  const session = login(), calls = [];
  const options = { pinataJwt: "test-only-secret", fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ IpfsHash: cid }); } };
  return { service, session, calls, options, login, expire: () => { time += 1_800_001; } };
}
function request(f, body = metadata(), options = {}) {
  const form = body instanceof FormData, headers = new Headers({ Origin: "https://avatar.example", Authorization: `Bearer ${f.session.accessToken}`, ...(form ? {} : { "Content-Type": "application/json" }) });
  return new Request("https://avatar.example/api/upload-metadata", { method: "POST", headers, body: form ? body : JSON.stringify(body), ...options });
}
const metadata = () => ({ name: "Robert", symbol: "EKZA", image: uri, animation_url: uri, properties: { creators: [{ address: wallet, share: 100 }] } });
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "preview.png", { type: "image/png" });
function model() { const bytes = Buffer.alloc(20); bytes.write("glTF"); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8); return new File([bytes], "avatar.vrm", { type: "model/vrm" }); }
function unreadRequest(f, headerOverrides = {}) {
  let reads = 0;
  const body = new ReadableStream({ pull() { reads++; throw new Error("Unauthorized body read"); } }, { highWaterMark: 0 });
  return { get reads() { return reads; }, request: request(f, {}, { body, duplex: "half", headers: { Origin: "https://avatar.example", Authorization: `Bearer ${f.session.accessToken}`, "Content-Type": "application/json", ...headerOverrides } }) };
}

test("missing, invalid, expired and project-scoped sessions fail before reading the upload or contacting Pinata", async () => {
  for (const kind of ["missing", "invalid", "expired", "device"]) {
    const f = fixture();
    if (kind === "expired") f.expire();
    if (kind === "device") { const device = f.service.device("omoba"); f.session = f.login(device.userCode); }
    const input = unreadRequest(f, kind === "missing" ? { Authorization: "" } : kind === "invalid" ? { Authorization: `Bearer ${"a".repeat(43)}` } : {});
    const result = await handleCreatorUpload(input.request, f.service, f.options);
    assert.equal(result.status, kind === "device" ? 403 : 401); assert.equal(input.reads, 0); assert.equal(input.request.bodyUsed, false); assert.equal(f.calls.length, 0);
  }
});
test("a foreign or missing origin fails before upload bytes are read", async () => {
  for (const origin of ["https://evil.example", "", "null"]) {
    const f = fixture(), input = unreadRequest(f, { Origin: origin });
    assert.equal((await handleCreatorUpload(input.request, f.service, f.options)).status, 403); assert.equal(input.reads, 0);
  }
});
test("authenticated PNG/model and creator-bound metadata use only fixed Pinata endpoints and return public CIDs", async () => {
  const f = fixture(), form = new FormData(); form.append("preview", png()); form.append("model", model());
  const files = await handleCreatorUpload(request(f, form), f.service, f.options);
  assert.equal(files.status, 200); assert.equal((await files.json()).files.length, 2);
  const json = await handleCreatorUpload(request(f), f.service, f.options);
  assert.equal(json.status, 200); assert.deepEqual(await json.json(), { ipfsHash: cid, uri });
  assert.deepEqual(f.calls.map(({ url }) => url), ["https://api.pinata.cloud/pinning/pinFileToIPFS", "https://api.pinata.cloud/pinning/pinFileToIPFS", "https://api.pinata.cloud/pinning/pinJSONToIPFS"]);
  assert.equal(JSON.parse(f.calls[2].init.body).pinataContent.properties.creators[0].address, wallet);
  assert.ok(f.calls.every(({ init }) => init.redirect === "error" && init.headers.Authorization === "Bearer test-only-secret"));
});
test("every multipart file is validated before the first pin", async () => {
  for (const invalid of [new File([], "empty.vrm"), new File(["not a model"], "fake.glb")]) {
    const f = fixture(), form = new FormData(); form.append("good", png()); form.append("bad", invalid);
    assert.ok([413, 422].includes((await handleCreatorUpload(request(f, form), f.service, f.options)).status)); assert.equal(f.calls.length, 0);
  }
  const f = fixture(), form = new FormData(); for (let i = 0; i < 5; i++) form.append(`file${i}`, png());
  assert.equal((await handleCreatorUpload(request(f, form), f.service, f.options)).status, 422); assert.equal(f.calls.length, 0);
});
test("wrong creator and non-avatar JSON are rejected before any paid upstream request", async () => {
  for (const value of [{ arbitrary: "data" }, { ...metadata(), properties: { creators: [{ address: passport.PASSPORT_PROGRAM, share: 100 }] } }]) {
    const f = fixture(); assert.equal((await handleCreatorUpload(request(f, value), f.service, f.options)).status, 422); assert.equal(f.calls.length, 0);
  }
});
test("a missing or false length cannot bypass the streamed JSON or multipart cap; overflow cancels the reader", async () => {
  for (const [type, size] of [["application/json", 262_145], ["multipart/form-data; boundary=test", 25 * 1024 * 1024 + 1]]) {
    const f = fixture(); let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(size)); }, cancel() { cancelled = true; } });
    const input = request(f, {}, { body, duplex: "half", headers: { Origin: "https://avatar.example", Authorization: `Bearer ${f.session.accessToken}`, "Content-Type": type, "Content-Length": "1" } });
    assert.equal((await handleCreatorUpload(input, f.service, f.options)).status, 413); assert.equal(cancelled, true); assert.equal(f.calls.length, 0);
  }
});
test("a stalled request body times out and cancels without sending to Pinata", async () => {
  const f = fixture(); let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const input = request(f, {}, { body, duplex: "half" });
  assert.equal((await handleCreatorUpload(input, f.service, { ...f.options, bodyTimeoutMs: 5 })).status, 408);
  assert.equal(cancelled, true); assert.equal(f.calls.length, 0);
});
test("upstream timeout aborts the request, returns a redacted failure, and releases the upload slot", async () => {
  const f = fixture(); let aborted = false;
  const result = await handleCreatorUpload(request(f), f.service, { ...f.options, upstreamTimeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_, reject) => { init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("private provider diagnostic")); }); }) });
  assert.equal(result.status, 504); assert.equal(aborted, true); assert.doesNotMatch(await result.text(), /private provider|test-only-secret/);
  assert.equal((await handleCreatorUpload(request(f), f.service, f.options)).status, 200);
});
test("an upstream redirect/error, oversized result or invalid CID never enters a publication response", async () => {
  for (const reply of [new Response("private diagnostic", { status: 302 }), new Response("x".repeat(65_537)), Response.json({ IpfsHash: "../../private" })]) {
    const f = fixture(), result = await handleCreatorUpload(request(f), f.service, { ...f.options, fetchImpl: async () => reply });
    assert.ok(result.status >= 400); assert.doesNotMatch(await result.text(), /private diagnostic|test-only-secret|\.\.\/private/);
  }
});
test("creator session rejects other networks and an interrupted signing context before any upload", async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.sessionStorage; let current = true, uploads = 0;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => assert.fail("Stale session must not persist"), removeItem: () => {} };
  globalThis.fetch = async (url) => { if (url === "/api/passport/challenge") return Response.json({ challengeId: "challenge", message: "wallet challenge" }); uploads++; assert.fail("No upload or session exchange after a wallet switch"); };
  try {
    await assert.rejects(creatorUploadSession({ wallet, network: "mainnet-beta", isCurrent: () => true }), /Devnet/);
    await assert.rejects(creatorUploadSession({ wallet, network: "devnet", isCurrent: () => current, signMessage: async () => { current = false; return "unused"; } }), /changed/);
    assert.equal(uploads, 0);
  } finally { globalThis.fetch = originalFetch; globalThis.sessionStorage = originalStorage; }
});
test("creator uploads reject a stale wallet before sending and discard completion after a wallet switch", async () => {
  const originalFetch = globalThis.fetch; let current = false, calls = 0;
  const f = fixture(); globalThis.fetch = async () => { calls++; current = false; return Response.json({ ipfsHash: cid }); };
  try {
    await assert.rejects(uploadCreatorContent(metadata(), f.session, () => current), /changed/); assert.equal(calls, 0);
    current = true; await assert.rejects(uploadCreatorContent(metadata(), f.session, () => current), /changed/); assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test("an expired upload session is removed without automatically repeating paid storage writes", async () => {
  const f = fixture(), originalFetch = globalThis.fetch, originalStorage = globalThis.sessionStorage; let stored = JSON.stringify(f.session), calls = 0;
  globalThis.sessionStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem: () => { stored = null; } };
  globalThis.fetch = async () => { calls++; return Response.json({ error: "Verify your wallet again." }, { status: 401 }); };
  try { await assert.rejects(uploadCreatorContent(metadata(), f.session, () => true), /Verify your wallet/); assert.equal(stored, null); assert.equal(calls, 1); }
  finally { globalThis.fetch = originalFetch; globalThis.sessionStorage = originalStorage; }
});
