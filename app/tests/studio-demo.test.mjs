import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/lib/studio-demo.server.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { demoEnabled, demoSample, DEMO_SOURCE_SHA256 } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("demo assets are off by default and never accept request paths", async () => {
  assert.equal(demoEnabled({}), false);
  assert.equal(demoEnabled({ EKZA_STUDIO_DEMO: "true" }), false);
  await assert.rejects(
    demoSample("source", {}),
    (error) => error.status === 404
  );
  for (const value of [
    null,
    "../../demo.json",
    "accounts",
    "source?path=secret",
  ])
    await assert.rejects(
      demoSample(value, { EKZA_STUDIO_DEMO: "1" }),
      (error) => error.status === 404
    );
});

test("missing samples do not leak the operator's local file paths", async () => {
  const response = await demoSample("source", {
    EKZA_STUDIO_DEMO: "1",
    EKZA_STUDIO_DEMO_SOURCE: "/not-a-real-ekza-sample/private/path",
  }).catch((error) => error);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private\/path/);
});

test("an arbitrary local file cannot be served as the prepared VRM", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ekza-demo-asset-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "unexpected.vrm");
  await writeFile(path, "not the prepared model");
  await assert.rejects(
    demoSample("source", {
      EKZA_STUDIO_DEMO: "1",
      EKZA_STUDIO_DEMO_SOURCE: path,
    }),
    (error) => error.status === 503
  );
});

test("cover downloads have fixed filenames and safe headers", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ekza-demo-cover-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "thumbnail.png");
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await writeFile(path, bytes);
  const response = await demoSample("thumbnail", {
    EKZA_STUDIO_DEMO: "1",
    EKZA_STUDIO_DEMO_THUMBNAIL: path,
  });
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="Robert.png"'
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test(
  "the real local sample is served byte-for-byte only after its hash matches",
  {
    skip: !process.env.STUDIO_DEMO_SOURCE,
  },
  async () => {
    const response = await demoSample("source", {
      EKZA_STUDIO_DEMO: "1",
      EKZA_STUDIO_DEMO_SOURCE: process.env.STUDIO_DEMO_SOURCE,
    });
    assert.equal(response.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex"),
      DEMO_SOURCE_SHA256
    );
  }
);
