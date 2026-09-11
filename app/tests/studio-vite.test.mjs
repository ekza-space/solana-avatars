// No Vite process or files are created. The optional HTTP check reads the
// existing local dev server's actual dependency graph; it does not render WebGL.
import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.createSourceFile(
  "vite.config.ts",
  await readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const configuration = source.statements.find(ts.isExportAssignment).expression
  .arguments[0];
function property(object, name) {
  return object.properties.find((item) => item.name?.getText(source) === name)
    ?.initializer;
}
function strings(array) {
  assert.ok(array && ts.isArrayLiteralExpression(array));
  return array.elements.map((item) => {
    assert.ok(ts.isStringLiteral(item));
    return item.text;
  });
}

test("linked libraries use the host React, ReactDOM, Fiber and Three runtimes", () => {
  const dedupe = strings(
    property(property(configuration, "resolve"), "dedupe")
  );
  for (const name of ["react", "react-dom", "@react-three/fiber", "three"])
    assert.ok(dedupe.includes(name), `Missing shared runtime: ${name}`);
});

test("lazy preview and observed SDK dependencies are optimized before interaction", () => {
  const include = strings(
    property(property(configuration, "optimizeDeps"), "include")
  );
  for (const name of [
    "react",
    "react-dom",
    "react-dom/client",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@react-three/fiber",
    "@react-three/drei",
    "@ekza/avatar-renderer/model",
    "three",
    "@coral-xyz/anchor",
    "@solana/web3.js",
    "@solana/spl-token",
  ])
    assert.ok(
      include.includes(name),
      `Late dependency discovery possible: ${name}`
    );
});

test(
  "served preview and app share one React module URL without optimizer generation changes",
  {
    skip: !process.env.STUDIO_VITE_ORIGIN,
  },
  async () => {
    const origin = new URL(process.env.STUDIO_VITE_ORIGIN);
    assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
    assert.ok(["http:", "https:"].includes(origin.protocol));
    const metadata = JSON.parse(
      await readFile(
        new URL("../node_modules/.vite/deps/_metadata.json", import.meta.url),
        "utf8"
      )
    );
    for (const name of strings(
      property(property(configuration, "optimizeDeps"), "include")
    ))
      assert.ok(
        metadata.optimized[name],
        `Configured dependency is not warmed: ${name}; restart this app's dev server first`
      );
    async function get(path) {
      const response = await fetch(new URL(path, origin), {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200, path);
      return response.text();
    }
    function reactUrl(text) {
      const match = text.match(/"([^"\n]*\/react\.js\?v=[^"\n]+)"/);
      assert.ok(match, "Expected Vite's optimized React import");
      return match[1];
    }
    const before = reactUrl(await get("/app/entry.client.tsx"));
    const runtime = new Set();
    const visited = new Set();
    async function walk(path) {
      if (visited.has(path)) return;
      visited.add(path);
      assert.ok(visited.size < 160, "Unexpectedly broad module graph");
      const body = await get(path);
      if (
        body.includes(
          '"node_modules/react/cjs/react.development.js"(exports, module)'
        )
      )
        runtime.add(path);
      const imports = [...body.matchAll(/(?:from\s*|import\s*)"([^"\n]+)"/g)]
        .map((item) => item[1])
        .filter((item) => item.startsWith("/node_modules/.vite/deps/"));
      await Promise.all(imports.map(walk));
    }
    for (const path of [
      "/app/entry.client.tsx",
      "/app/components/3d/SceneWithModel.tsx",
      "/app/components/3d/UploadedModel.tsx",
    ])
      await walk(path);
    const after = reactUrl(await get("/app/entry.client.tsx"));
    assert.equal(
      before,
      after,
      "Loading the preview changed optimized dependency generation"
    );
    assert.equal(
      runtime.size,
      1,
      "App/ReactDOM/R3F/renderer must share exactly one React runtime URL"
    );
  }
);
