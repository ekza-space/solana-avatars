import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/passport-identity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(() => ({ PROJECT_NAMES: { "ekza-mirror": "Ekza Mirror", "omoba": "Omoba" } }), module, module.exports);
const { approveIdentity, validateIdentityDevice } = module.exports;
const device = { userCode: "ABCDEF123456", projectId: "ekza-mirror", purpose: "identity", expiresAt: "2099-01-01T00:00:00Z" };
const challenge = { challengeId: "nonce", message: `Header\nPurpose: approve-device:${device.projectId}:${device.userCode}:identity-only\nExpiry`, projectId: device.projectId, purpose: "identity" };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; }
test("identity approval signs the exact identity purpose and never requests assets or saves credentials", async () => {
  const calls = [];
  assert.equal(await approveIdentity({ wallet: "wallet", device, isCurrent: () => true,
    signMessage: async (bytes) => { assert.equal(new TextDecoder().decode(bytes), challenge.message); return "signature"; },
    request: async (path, body) => { calls.push({ path, body }); return path === "challenge" ? challenge : { wallet: "wallet" }; },
  }), true);
  assert.deepEqual(calls, [
    { path: "challenge", body: { wallet: "wallet", userCode: device.userCode } },
    { path: "session", body: { challengeId: "nonce", signature: "signature" } },
  ]);
});
test("wrong-purpose, expired, mismatched and unknown application codes cannot be signed", async () => {
  for (const invalid of [{ ...device, purpose: "avatars" }, { ...device, projectId: "external-store" }, { ...device, userCode: "OTHER" }, { ...device, expiresAt: "2000-01-01T00:00:00Z" }]) {
    assert.throws(() => validateIdentityDevice(invalid, device.userCode));
  }
  for (const invalid of [{ ...challenge, purpose: "avatars" }, { ...challenge, projectId: "omoba" }, { ...challenge, message: "Purchase approval" }]) {
    let signed = false;
    await assert.rejects(approveIdentity({ wallet: "wallet", device, isCurrent: () => true,
      request: async () => invalid, signMessage: async () => { signed = true; return "signature"; } }));
    assert.equal(signed, false);
  }
});
test("wallet or code change while loading challenge never opens a stale signing prompt", async () => {
  const pending = deferred(); let current = true, signed = false;
  const operation = approveIdentity({ wallet: "wallet", device, isCurrent: () => current,
    request: () => pending.promise, signMessage: async () => { signed = true; return "signature"; } });
  current = false; pending.resolve(challenge);
  assert.equal(await operation, false); assert.equal(signed, false);
});
test("wallet or code change during signing prevents session submission", async () => {
  const pending = deferred(), started = deferred(); let current = true; const calls = [];
  const operation = approveIdentity({ wallet: "wallet", device, isCurrent: () => current,
    request: async (path) => { calls.push(path); return challenge; },
    signMessage: () => { started.resolve(); return pending.promise; } });
  await started.promise; current = false; pending.resolve("signature");
  assert.equal(await operation, false); assert.deepEqual(calls, ["challenge"]);
});
test("an in-flight session cannot approve a replacement context or another wallet", async () => {
  const pending = deferred(), started = deferred(); let current = true;
  const operation = approveIdentity({ wallet: "wallet", device, isCurrent: () => current, signMessage: async () => "signature",
    request: async (path) => { if (path === "challenge") return challenge; started.resolve(); return pending.promise; } });
  await started.promise; current = false; pending.resolve({ wallet: "wallet" });
  assert.equal(await operation, false);
  await assert.rejects(approveIdentity({ wallet: "wallet", device, isCurrent: () => true, signMessage: async () => "signature",
    request: async (path) => path === "challenge" ? challenge : { wallet: "other-wallet" } }));
});
