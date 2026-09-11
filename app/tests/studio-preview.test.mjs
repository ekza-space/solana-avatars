import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/components/3d/PreviewBoundary.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from "(react(?:\/jsx-runtime)?)"/g, (_match, name) => `from "${pathToFileURL(require.resolve(name))}"`);
const { default: PreviewBoundary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("healthy boundary leaves the viewer content intact", () => {
  const html = renderToStaticMarkup(React.createElement(PreviewBoundary, { onClose() {} }, React.createElement("div", null, "viewer")));
  assert.match(html, /viewer/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("hook/import failure has a local recoverable fallback, not a network diagnosis", () => {
  const boundary = new PreviewBoundary({ onClose() {}, children: null });
  boundary.state = PreviewBoundary.getDerivedStateFromError(new Error('can\'t access property "useState", dispatcher is null'));
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /role="alert"/);
  assert.match(html, /uploaded model and publication are unchanged/);
  assert.match(html, /Close preview/);
  assert.match(html, /Retry preview/);
  assert.doesNotMatch(html, /metadata service/);
});

test("fallback bounds and escapes untrusted error text", () => {
  const boundary = new PreviewBoundary({ onClose() {}, children: null });
  boundary.state = PreviewBoundary.getDerivedStateFromError(new Error("<script>bad</script>" + "x".repeat(1000)));
  assert.equal(boundary.state.message.length, 500);
  assert.doesNotMatch(renderToStaticMarkup(boundary.render()), /<script>/);
  assert.match(PreviewBoundary.getDerivedStateFromError(null).message, /could not be opened/);
});

test("Studio contains lazy imports and render failures outside the viewer itself", async () => {
  const route = await readFile(new URL("../app/routes/studio.tsx", import.meta.url), "utf8");
  assert.match(route, /<PreviewBoundary key=\{source\}[\s\S]*?<Suspense[\s\S]*?<ModelPreview[\s\S]*?<\/Suspense>[\s\S]*?<\/PreviewBoundary>/);
});
