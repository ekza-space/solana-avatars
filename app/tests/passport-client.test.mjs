import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/passport-client.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { PassportApiError, passportRequest, signPassportSession, savePassportSession, readPassportSession, forgetPassportSession } = module.exports;
const session = { wallet: "wallet-a", accessToken: "session-secret", expiresAt: "2099-01-01T00:00:00.000Z" };
const challenge = { challengeId: "challenge-secret", message: "Sign this exact domain-bound nonce", projectId: "ekza-mirror" };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch; globalThis.fetch = fetchImpl;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("HTTP errors preserve status so expired logins can recover without logging out on RPC downtime", async () => {
  for (const status of [401, 503]) {
    await withFetch(async () => Response.json({ error: "Retry or reconnect" }, { status }), async () => {
      await assert.rejects(passportRequest("library", undefined, session.accessToken), (reason) => reason instanceof PassportApiError && reason.status === status);
    });
  }
  await withFetch(async () => new Response("proxy unavailable", { status: 503 }), async () => {
    await assert.rejects(passportRequest("library"), (reason) => reason.status === 503);
  });
});

test("a delayed old-session failure cannot remove a newer saved login", () => {
  const original = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  try {
    savePassportSession(session);
    const newer = { ...session, accessToken: "new-session-secret" };
    savePassportSession(newer);
    forgetPassportSession(session);
    assert.deepEqual(readPassportSession(session.wallet), newer);
    forgetPassportSession(newer);
    assert.equal(readPassportSession(session.wallet), null);
  } finally {
    if (original === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = original;
  }
});

test("a wallet switch while the challenge is loading never opens the old signing prompt", async () => {
  const pending = deferred(); let current = true, signed = 0;
  await withFetch(() => pending.promise, async () => {
    const operation = signPassportSession({ wallet: session.wallet, isCurrent: () => current, signMessage: async () => { signed++; return "signature"; } });
    current = false;
    pending.resolve(Response.json(challenge));
    assert.equal(await operation, null);
    assert.equal(signed, 0);
  });
});

test("editing or navigating to another app code while signing prevents approval submission", async () => {
  const signature = deferred(), signingStarted = deferred(); let current = true, calls = 0;
  await withFetch(async () => { calls++; return Response.json(challenge); }, async () => {
    const operation = signPassportSession({ wallet: session.wallet, device: { projectId: "ekza-mirror", userCode: "OLD123" }, isCurrent: () => current, signMessage: async () => { signingStarted.resolve(); return signature.promise; } });
    await signingStarted.promise;
    current = false;
    signature.resolve("wallet-signature");
    assert.equal(await operation, null);
    assert.equal(calls, 1);
  });
});

test("a stale in-flight login cannot replace the current wallet even after switching away and back", async () => {
  const response = deferred(), sessionRequested = deferred(); let revision = 1;
  await withFetch(async (url) => {
    if (url.endsWith("/challenge")) return Response.json(challenge);
    sessionRequested.resolve(); return response.promise;
  }, async () => {
    const capturedRevision = revision;
    const operation = signPassportSession({ wallet: session.wallet, isCurrent: () => revision === capturedRevision, signMessage: async () => "wallet-signature" });
    await sessionRequested.promise;
    revision += 2; // A -> B -> A is still a different attempt.
    response.resolve(Response.json(session));
    assert.equal(await operation, null);
  });
});

test("the server-confirmed project must match the code shown before requesting a wallet signature", async () => {
  let signed = false;
  await withFetch(async () => Response.json({ ...challenge, projectId: "omoba" }), async () => {
    await assert.rejects(signPassportSession({ wallet: session.wallet, device: { projectId: "ekza-mirror", userCode: "MIRROR123" }, isCurrent: () => true, signMessage: async () => { signed = true; return "signature"; } }), /application changed/);
    assert.equal(signed, false);
  });
});

test("a current approved device signs the exact challenge and returns its wallet session", async () => {
  const requests = [];
  await withFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json(url.endsWith("/challenge") ? challenge : session);
  }, async () => {
    const actual = await signPassportSession({ wallet: session.wallet, device: { projectId: "ekza-mirror", userCode: "MIRROR123" }, isCurrent: () => true, signMessage: async (bytes) => { assert.equal(new TextDecoder().decode(bytes), challenge.message); return "wallet-signature"; } });
    assert.deepEqual(actual, session);
    assert.deepEqual(requests.map(({ body }) => body), [{ wallet: session.wallet, userCode: "MIRROR123" }, { challengeId: challenge.challengeId, signature: "wallet-signature" }]);
    assert.ok(requests.every(({ url }) => !/secret|signature|MIRROR123/.test(url)));
  });
});
