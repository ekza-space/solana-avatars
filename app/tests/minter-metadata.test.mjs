import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(name, dependencies = {}) {
  const source = await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((path) => dependencies[path] ?? require(path), module, module.exports);
  return module.exports;
}
const passport = await load("passport.server");
const { MinterMetadataResolver, handleMinterMetadata } = await load("minter-metadata.server", { "./passport.server": passport });
const cid = "QmUjTMKVJ397oHd4vA4wkCdr1V5U7GBN1eWdKJJARkffqV";
const template = "3bfPehBVoBKXUUzmGGVT3tgQTYkpispqUKfPW1UktASL";
const bytes = Buffer.from('{ "name": "Exact document", "symbol": "EKZA", "image": "https://assets.example/original.png" }\n');
const digest = (value) => createHash("sha256").update(value).digest("hex");
function fixture(fetchImpl, localIpfs = false) {
  const source = { cid, sha256: digest(bytes) }, requests = [];
  const service = { config: { origin: "https://avatar.example", catalogUrl: "https://registry.example/v1/avatars" }, minterMetadataSource: async (value) => { requests.push(value); assert.equal(value, template); return source; } };
  if (localIpfs) service.config = { ...service.config, origin: "http://127.0.0.1:5190", allowLocalhost: true };
  return { source, requests, service, resolver: new MinterMetadataResolver(service, fetchImpl, localIpfs) };
}
const request = (query = `avatarData=${template}`, extra = {}) => new Request(`https://avatar.example/api/avatar-metadata?${query}`, extra);

test("public same-origin metadata returns exact upstream bytes and rechecks identity before a cache hit", async () => {
  const urls = [], f = fixture(async (url, options) => {
    urls.push(url); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    return new Response(bytes);
  });
  for (let i = 0; i < 2; i++) {
    const result = await handleMinterMetadata(request(), f.service, f.resolver);
    assert.equal(result.status, 200); assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  }
  assert.equal(f.requests.length, 2);
  assert.deepEqual(urls, [`https://ekza.mypinata.cloud/ipfs/${cid}`]);
});
test("a changed registry digest prevents a stale cached document from being accepted", async () => {
  const f = fixture(async () => new Response(bytes));
  assert.deepEqual(await f.resolver.resolve(template), bytes);
  f.source.sha256 = "a".repeat(64);
  await assert.rejects(f.resolver.resolve(template), /integrity verification failed/);
});
test("tampered upstream content fails closed without cache pollution", async () => {
  let count = 0; const f = fixture(async () => { count++; return new Response(count === 1 ? Buffer.from('{"name":"Substitute","symbol":"BAD"}') : bytes); });
  await assert.rejects(f.resolver.resolve(template), /integrity verification failed/);
  assert.equal(count, 1);
  assert.deepEqual(await f.resolver.resolve(template), bytes);
});
test("bounded streaming rejects oversized content even without a length header", async () => {
  const f = fixture(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(262_145)); controller.close(); } })));
  await assert.rejects(f.resolver.resolve(template), /size limit/);
});
test("HTML and malformed JSON cannot be returned as NFT metadata", async () => {
  for (const invalid of ["<html>gateway error</html>", "[]", '{"image":"https://assets.example/cover"}']) {
    const f = fixture(async () => new Response(invalid)); f.source.sha256 = digest(invalid);
    await assert.rejects(f.resolver.resolve(template), /metadata/);
  }
});
test("metadata route rejects foreign origins, duplicate selectors, arbitrary URL parameters and POST", async () => {
  const f = fixture(async () => assert.fail("No upstream fetch expected"));
  const cases = [
    [request(undefined, { headers: { Origin: "https://evil.example" } }), 403],
    [request(undefined, { headers: { "Sec-Fetch-Site": "cross-site" } }), 403],
    [request(`avatarData=${template}&avatarData=${template}`), 400],
    [request(`avatarData=${template}&url=http://127.0.0.1/private`), 400],
    [request(undefined, { method: "POST" }), 405],
  ];
  for (const [input, expected] of cases) assert.equal((await handleMinterMetadata(input, f.service, f.resolver)).status, expected);
  assert.equal(f.requests.length, 0);
});
test("transport failure is redacted and never yields fabricated metadata", async () => {
  const f = fixture(async () => { throw new Error("private upstream diagnostic"); });
  const result = await handleMinterMetadata(request(), f.service, f.resolver);
  assert.equal(result.status, 503); const body = await result.text();
  assert.match(body, /temporarily unavailable/); assert.doesNotMatch(body, /private upstream|name|image/);
});

test("explicit local rehearsal resolves the canonical CID with exact bytes while Pinata is unavailable", async () => {
  const urls = [];
  const f = fixture(async (url, options) => {
    urls.push(url);
    assert.equal(options.redirect, "error");
    assert.equal(url, `http://127.0.0.1:8080/ipfs/${cid}`);
    return new Response(bytes);
  }, true);
  assert.deepEqual(await f.resolver.resolve(template), bytes);
  assert.equal(urls.length, 1);
});

test("offline local IPFS falls back to the canonical CID on Pinata", async () => {
  const urls = [];
  const f = fixture(async (url) => {
    urls.push(url);
    if (url.startsWith("http://127.0.0.1")) throw new Error("connection refused");
    return new Response(bytes);
  }, true);
  assert.deepEqual(await f.resolver.resolve(template), bytes);
  assert.deepEqual(urls, [`http://127.0.0.1:8080/ipfs/${cid}`, `https://ekza.mypinata.cloud/ipfs/${cid}`]);
});

test("local metadata must match the same approved digest and cannot pollute the cache", async () => {
  let calls = 0;
  const f = fixture(async () => new Response(++calls === 1 ? '{"name":"Forged","symbol":"BAD"}' : bytes), true);
  await assert.rejects(f.resolver.resolve(template), /integrity verification failed/);
  assert.equal(calls, 1);
  assert.deepEqual(await f.resolver.resolve(template), bytes);
});

test("public storefronts and implicit localhost mode cannot enable local IPFS", () => {
  const f = fixture(async () => assert.fail("Must not fetch"));
  assert.throws(() => new MinterMetadataResolver(f.service, undefined, true), /localhost demo/);
  f.service.config.origin = "http://127.0.0.1:5190";
  assert.throws(() => new MinterMetadataResolver(f.service, undefined, true), /localhost demo/);
});
