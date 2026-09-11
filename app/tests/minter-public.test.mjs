import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compiled(source, dependencies = {}) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => dependencies[name] ?? (name.endsWith(".css") ? {} : require(name)), module, module.exports);
  return module.exports;
}
const routes = compiled(await readFile(new URL("../app/lib/routes.ts", import.meta.url), "utf8"));
let pathname = "/minter", locked = true;
const block = ({ children }) => React.createElement("div", null, children);
const { LegacyContent } = compiled(await readFile(new URL("../app/components/legacy-shell.tsx", import.meta.url), "utf8"), {
  "@remix-run/react": { useLocation: () => ({ pathname }), Link: ({ to, children }) => React.createElement("a", { href: to }, children) },
  "@solana/wallet-adapter-react": { useWallet: () => ({ publicKey: null }) },
  "@solana/wallet-adapter-phantom": {},
  "@solana/wallet-adapter-react-ui": { WalletMultiButton: () => React.createElement("button", null, "Select wallet") },
  "~/lib/network": { SOLANA_CLUSTER_OPTIONS: ["devnet"], useSolanaNetwork: () => ({ cluster: "devnet", clusterLabel: "Devnet", networkLocked: locked, setCluster: () => {} }) },
  "~/lib/routes": routes,
  "./ui": { Card: block, Notice: block, Page: block, Select: ({ children, ...props }) => React.createElement("select", props, children), PageHeader: ({ title }) => React.createElement("h1", null, title) },
});
const render = () => renderToStaticMarkup(React.createElement(LegacyContent, null, React.createElement("section", null, "Collection price and local model preview")));

test("disconnected visitors can browse exact minter and deployer pages in the real shell", () => {
  locked = true;
  for (pathname of ["/minter", "/deployer", "/minter/", "/deployer/"]) {
    const html = render();
    assert.match(html, /Collection price and local model preview/);
    assert.doesNotMatch(html, /Connect a wallet for this experiment|Experimental Web3|About these experiments/);
    assert.match(html, /Avatar (purchase|publication)/);
    assert.match(html, /href="\/passport"/);
  }
});
test("opening other legacy tools still requires a wallet and cannot expand the public route allowlist", () => {
  locked = false;
  for (pathname of ["/users", "/web3/profile", "/minter/missing", "/deployer/missing"]) {
    const html = render();
    assert.doesNotMatch(html, /Collection price and local model preview/);
    assert.match(html, /Connect a wallet for this experiment/);
  }
});
