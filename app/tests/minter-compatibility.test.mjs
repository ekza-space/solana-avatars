import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(relative, dependencies = {}) {
  const source = await readFile(new URL(`../app/${relative}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const client = await load("lib/passport-client.ts");
const ui = await load("components/ui.tsx", { "~/utils/cn": await load("utils/cn.ts") });
const { loadMinterCatalog, approvedMinterProjects, MinterCompatibility } = await load("components/minter-compatibility.tsx", { "~/lib/passport-client": client, "./ui": ui });
const address = "3bfPehBVoBKXUUzmGGVT3tgQTYkpispqUKfPW1UktASL";
const otherAddress = "6yquBsKM6BMgRXA8Bs1RxqPLxFNFDrZty1yhsuBEnihV";
const support = (projectId, status = "approved") => ({ projectId, status, platform: "desktop", profile: "humanoid-glb-v1", rendition: { id: "sha256:fixture", url: "https://avatar.example/model.glb", sha256: "a".repeat(64), sizeBytes: 10, format: "glb" } });
const avatar = (avatarId = `solana:devnet:avatar-data:${address}`, projects = ["ekza-space", "ekza-mirror", "omoba"].map((id) => support(id))) => ({ avatarId, name: "Robert", thumbnailUrl: "https://avatar.example/Robert.png", support: projects });
const response = (items = [avatar()]) => ({ schema: "ekza.passport.catalog.v1", network: "solana-devnet", items });
const render = (catalog, avatarData = address) => renderToStaticMarkup(React.createElement(MinterCompatibility, { avatarData, catalog, onRetry: () => {} }));

test("the public catalog supplies the three approved badges for the exact canonical template", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/passport/catalog");
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "omit");
    assert.equal(init.headers.Authorization, undefined);
    return Response.json(response());
  };
  try {
    const catalog = await loadMinterCatalog();
    assert.equal(catalog.status, "ready");
    const html = render(catalog);
    for (const name of ["Ekza Space", "Ekza Mirror", "Omoba"]) assert.ok(html.includes(`${name} · Supported`));
    assert.equal((html.match(/ui-badge-success/g) || []).length, 3);
  } finally { globalThis.fetch = previous; }
});

test("same model name, metadata, another PDA or another network never confer compatibility", () => {
  for (const identity of [
    `solana:devnet:avatar-data:${otherAddress}`,
    `solana:mainnet-beta:avatar-data:${address}`,
    `solana:devnet:mint:${address}`,
    address,
  ]) {
    const catalog = { status: "ready", items: [avatar(identity)] };
    assert.deepEqual(approvedMinterProjects(catalog.items, address), [], identity);
    assert.match(render(catalog), /No approved project support is listed/);
    assert.doesNotMatch(render(catalog), /ui-badge-success/);
  }
});

test("only approved known projects appear, once per project across multiple renditions", () => {
  const catalog = { status: "ready", items: [avatar(undefined, [
    support("omoba"), support("omoba"), support("ekza-space", "pending"),
    support("ekza-mirror", "rejected"), support("unregistered-game"),
  ])] };
  assert.deepEqual(approvedMinterProjects(catalog.items, address), ["omoba"]);
  const html = render(catalog);
  assert.match(html, /Omoba · Supported/);
  assert.doesNotMatch(html, /Ekza Space|Ekza Mirror|unregistered-game/);
  assert.equal((html.match(/ui-badge-success/g) || []).length, 1);
});

test("loading, catalog failure and a successfully checked unregistered collection stay distinct", async () => {
  assert.match(render({ status: "loading" }), /Checking approved projects.*not yet confirmed/);
  const previous = globalThis.fetch;
  try {
    for (const result of [
      () => Response.json({ error: "Temporarily unavailable" }, { status: 503 }),
      () => Response.json({ ...response(), network: "solana-mainnet" }),
      () => Response.json({ ...response(), schema: "unexpected" }),
      () => Response.json({ ...response(), items: [null] }),
      () => Response.json({ ...response(), items: [avatar(undefined, [null])] }),
      () => { throw new Error("Network offline"); },
    ]) {
      globalThis.fetch = async () => result();
      const catalog = await loadMinterCatalog();
      assert.equal(catalog.status, "unavailable");
      const html = render(catalog);
      assert.match(html, /Supported projects are unknown/);
      assert.match(html, /Retry supported projects/);
      assert.doesNotMatch(html, /No approved project support|ui-badge-success/);
    }
    globalThis.fetch = async () => Response.json(response([]));
    const empty = await loadMinterCatalog();
    assert.equal(empty.status, "ready");
    assert.match(render(empty), /No approved project support is listed/);
    assert.doesNotMatch(render(empty), /unknown|Retry supported projects/);
  } finally { globalThis.fetch = previous; }
});
