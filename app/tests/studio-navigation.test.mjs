import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/studio-navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { accountHref, accountReturnView, requiresStudioAccount, shouldPollStudio,
  shouldBlockStudioNavigation, createStudioRefreshQueue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("account links preserve only an internal Studio destination through signup and reload", () => {
  const href = accountHref("new", "signup");
  const search = new URL(href, "https://avatar.test").searchParams;
  assert.equal(search.get("view"), "account");
  assert.equal(search.get("auth"), "signup");
  assert.equal(accountReturnView(search), "new");
  for (const invalid of ["https://evil.test", "//evil.test", "/deployer", "account", "unknown"]) {
    assert.equal(accountReturnView(new URLSearchParams({ returnTo: invalid })), null);
  }
});

test("protected views stay identifiable until the session resolves; catalog and account remain public", () => {
  for (const view of ["new", "uploads", "library", "review"]) assert.equal(requiresStudioAccount(view), true);
  for (const view of ["catalog", "account"]) assert.equal(requiresStudioAccount(view), false);
});

test("empty curator queue keeps polling but a guest or idle catalog does not", () => {
  assert.equal(shouldPollStudio("review", "moderator", false), true);
  assert.equal(shouldPollStudio("review", "creator", false), false);
  assert.equal(shouldPollStudio("review", undefined, false), false);
  assert.equal(shouldPollStudio("catalog", "moderator", false), false);
  assert.equal(shouldPollStudio("uploads", "creator", true), true);
});

test("unsent files and active uploads block header navigation and history changes", () => {
  const current = { pathname: "/studio", search: "?view=new" };
  const otherView = { pathname: "/studio", search: "?view=library" };
  const otherPage = { pathname: "/about", search: "" };
  assert.equal(shouldBlockStudioNavigation(true, false, current, otherView), true);
  assert.equal(shouldBlockStudioNavigation(false, true, current, otherPage), true);
  assert.equal(shouldBlockStudioNavigation(false, false, current, otherView), false);
  assert.equal(shouldBlockStudioNavigation(true, false, current, current), false);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("concurrent refreshes share one network read", async () => {
  const gate = deferred();
  let reads = 0;
  const queue = createStudioRefreshQueue(async () => { reads++; await gate.promise; });
  const first = queue.refresh();
  const second = queue.refresh();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(reads, 1);
  gate.resolve();
  await first;
  await queue.refresh();
  assert.equal(reads, 2);
});

test("writes wait for old reads, pause background polling, and fetch the final snapshot", async () => {
  const readGate = deferred();
  const writeGate = deferred();
  const events = [];
  let reads = 0;
  const queue = createStudioRefreshQueue(async () => {
    const id = ++reads;
    events.push(`read${id}:start`);
    if (id === 1) await readGate.promise;
    events.push(`read${id}:end`);
  });
  const read = queue.refresh();
  const mutation = queue.mutate(async () => {
    events.push("write:start");
    await writeGate.promise;
    events.push("write:end");
    return "saved";
  });
  await queue.refresh();
  assert.deepEqual(events, ["read1:start"]);
  readGate.resolve();
  await read;
  await Promise.resolve();
  assert.deepEqual(events, ["read1:start", "read1:end", "write:start"]);
  await queue.refresh();
  assert.equal(reads, 1);
  writeGate.resolve();
  assert.equal(await mutation, "saved");
  assert.deepEqual(events, ["read1:start", "read1:end", "write:start", "write:end", "read2:start", "read2:end"]);
});

test("failed mutations still reconcile state and release the queue", async () => {
  let reads = 0;
  const queue = createStudioRefreshQueue(async () => { reads++; });
  await assert.rejects(queue.mutate(async () => { throw new Error("rejected publication"); }), /rejected publication/);
  assert.equal(reads, 1);
  await queue.refresh();
  assert.equal(reads, 2);
});
