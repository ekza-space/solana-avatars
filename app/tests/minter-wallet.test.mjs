import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Exercise the actual purchase button callback without a wallet extension or
// chain transaction. In particular, a successful connection must stop here.
const source = await readFile(new URL("../app/routes/minter.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("minter.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onClick"
      && node.initializer?.expression?.getText(ast).includes("await minter.mintNft")) {
    handler = node.initializer.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, "Purchase callback must be present");
const javascript = ts.transpileModule(`const click = ${handler};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function click(overrides = {}) {
  const calls = [];
  const context = {
    anchorWallet: undefined, wallet: { adapter: { name: "Phantom" } },
    connecting: false, disconnecting: false, connected: false,
    connect: async () => { calls.push("connect"); },
    showWalletModal: (visible) => calls.push(["modal", visible]),
    setMintNotice: (notice) => calls.push(["notice", notice]),
    // Catch accidental fall-through after connecting, before any mint occurs.
    minter: new Proxy({}, { get() { throw new Error("Connection must not start a purchase"); } }),
    metadata: {}, pendingPurchase: null,
    readPendingPurchase: () => { throw new Error("Connection must not enter purchase flow"); },
    walletAddress: "", cluster: "devnet", ...overrides,
  };
  const run = new Function(...Object.keys(context), `${javascript}\nreturn click();`);
  await run(...Object.values(context));
  return calls;
}

test("selected but disconnected Phantom connects directly and does not buy", async () => {
  assert.deepEqual(await click(), [["notice", null], "connect"]);
});

test("first-time visitor is offered wallet selection without buying", async () => {
  assert.deepEqual(await click({ wallet: null }), [["notice", null], ["modal", true]]);
});

test("rejected connection shows a retry message instead of an unhandled rejection", async () => {
  const calls = await click({ connect: async () => { throw new Error("User rejected"); } });
  assert.equal(calls.at(-1)[1].tone, "error");
  assert.match(calls.at(-1)[1].text, /try again/i);
});

test("connection already in progress cannot trigger another connection or purchase", async () => {
  assert.deepEqual(await click({ connecting: true }), []);
  assert.deepEqual(await click({ disconnecting: true }), []);
});

test("connected wallet without transaction signing gets an explicit explanation and chooser", async () => {
  const calls = await click({ connected: true });
  assert.match(calls[1][1].text, /cannot sign/);
  assert.deepEqual(calls[2], ["modal", true]);
});
