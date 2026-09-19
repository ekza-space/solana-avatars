import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findStudioBuild } from "../scripts/start.mjs";

async function fixture(context, entries) {
  const root = await mkdtemp(join(tmpdir(), "ekza-studio-start-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of entries) {
    const entry = join(root, "build/server", relative);
    await mkdir(join(entry, ".."), { recursive: true });
    await writeFile(entry, "export const routes = {};");
  }
  return root;
}

for (const relative of ["index.js", "nodejs-bundle/index.js"])
  test(`compiled start supports ${relative}`, async (context) => {
    const root = await fixture(context, [relative]);
    assert.equal(findStudioBuild(root), join(root, "build/server", relative));
  });

test("compiled start refuses missing or ambiguous builds", async (context) => {
  const missing = await fixture(context, []);
  assert.throws(() => findStudioBuild(missing), /build is missing/);
  const ambiguous = await fixture(context, ["index.js", "other/index.js"]);
  assert.throws(() => findStudioBuild(ambiguous), /exactly one/);
});

test("compiled start refuses a symlinked server bundle", async (context) => {
  const root = await fixture(context, ["original.js"]);
  await symlink(
    join(root, "build/server/original.js"),
    join(root, "build/server/index.js")
  );
  assert.throws(() => findStudioBuild(root), /exactly one/);
});
