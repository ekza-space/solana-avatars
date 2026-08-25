"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MINTER_PROGRAM_ID,
  PINATA_JSON_ENDPOINT,
  assertDeploymentCompatible,
  assertIpfsHash,
  buildMetaplexMetadata,
  buildOnChainFields,
  createDeploymentManifest,
  createDryRunPlan,
  decodeMetaplexMetadataUri,
  parseArgs,
  pinMetadataJson,
  sanitizeErrorMessage,
  selectCc0Avatars,
  truncateUtf8,
} = require("../scripts/lib/devnet-avatar-collection");

const paths = {
  defaultManifestPath: "/dataset/manifest.json",
  defaultOutputPath: "/repo/deployments/avatars-devnet.json",
};

function avatar(overrides = {}) {
  const id = overrides.id || "avatar-1";
  const collectionId = overrides.collection_id || "collection-a";
  return {
    id,
    name: "Avatar One",
    collection_id: collectionId,
    collection_name: overrides.collection_name || `Collection ${collectionId}`,
    author: "Public Domain Author",
    license: "CC0",
    format: "VRM",
    model_file_url: `https://arweave.net/model-${id}`,
    thumbnail_url: `https://arweave.net/image-${id}`,
    description: "A test avatar.",
    tags: ["series:R1", "number:001"],
    ...overrides,
  };
}

function sourceManifest(avatars) {
  const collectionIds = [...new Set(avatars.map((item) => item.collection_id))];
  return {
    dataset: "Open Source Avatars",
    registry_source: "https://example.test/registry",
    registry_snapshot_commit: "snapshot-1",
    collections: collectionIds.map((id) => ({
      id,
      license:
        avatars.find((item) => item.collection_id === id)?.license || "CC0",
    })),
    avatars,
  };
}

test("CLI defaults to a bounded, side-effect-free dry run", () => {
  const args = parseArgs([], paths);
  assert.equal(args.execute, false);
  assert.equal(args.count, 12);
  assert.deepEqual(args.collections, ["100avatars-r1"]);
  assert.equal(args.maxSupply, 100);
  assert.equal(args.mintsPerTemplate, 1);
  assert.equal(args.mintFeeLamports, "0");
});

test("CLI accepts explicit execute configuration and rejects unsafe ambiguity", () => {
  const args = parseArgs(
    [
      "--execute",
      "--count",
      "20",
      "--collections",
      "a,b",
      "--max-supply",
      "5",
      "--mints-per-template",
      "2",
      "--mint-fee-lamports",
      "1000",
    ],
    paths
  );
  assert.equal(args.execute, true);
  assert.equal(args.count, 20);
  assert.deepEqual(args.collections, ["a", "b"]);
  assert.equal(args.maxSupply, 5);
  assert.equal(args.mintsPerTemplate, 2);
  assert.equal(args.mintFeeLamports, "1000");

  assert.throws(
    () => parseArgs(["--execute", "--dry-run"], paths),
    /mutually exclusive/
  );
  assert.throws(() => parseArgs(["--count", "21"], paths), /between 1 and 20/);
  assert.throws(
    () => parseArgs(["--max-supply", "1", "--mints-per-template", "2"], paths),
    /cannot exceed/
  );
});

test("selection is stable, round-robin, VRM-only, and CC0-only", () => {
  const avatars = [
    avatar({ id: "a1", collection_id: "a" }),
    avatar({ id: "a2", collection_id: "a" }),
    avatar({ id: "ignored-glb", collection_id: "a", format: "GLB" }),
    avatar({ id: "b1", collection_id: "b" }),
    avatar({ id: "b2", collection_id: "b" }),
  ];
  const selected = selectCc0Avatars(sourceManifest(avatars), ["a", "b"], 4);
  assert.deepEqual(
    selected.map((item) => item.id),
    ["a1", "b1", "a2", "b2"]
  );

  const ccByManifest = sourceManifest([
    avatar({ id: "licensed", collection_id: "licensed", license: "CC-BY" }),
  ]);
  assert.throws(
    () => selectCc0Avatars(ccByManifest, ["licensed"], 1),
    /not CC0/
  );
});

test("Metaplex metadata exposes the original VRM URL without repinning it", () => {
  const source = avatar();
  const metadata = buildMetaplexMetadata(source, {
    creatorAddress: "11111111111111111111111111111111",
    symbol: "EKZAAV",
  });

  assert.equal(metadata.animation_url, source.model_file_url);
  assert.deepEqual(metadata.properties.files, [
    { uri: source.model_file_url, type: "model/vrm" },
  ]);
  assert.deepEqual(metadata.properties.creators, [
    { address: "11111111111111111111111111111111", share: 100 },
  ]);
  assert.equal(
    metadata.attributes.find((item) => item.trait_type === "License").value,
    "CC0 1.0"
  );
  assert.equal(metadata.ekza.atom, "solana-avatars");
});

test("on-chain text uses Metaplex byte limits without splitting Unicode", () => {
  const source = avatar({ name: "🤖".repeat(20) });
  const fields = buildOnChainFields(source, {
    namePrefix: "Ekza ",
    symbol: "EKZAAV",
  });
  assert.ok(Buffer.byteLength(fields.name, "utf8") <= 32);
  assert.equal(Buffer.from(fields.name).toString("utf8"), fields.name);
  assert.equal(Buffer.byteLength(truncateUtf8("🤖🤖", 5), "utf8"), 4);
});

test("Metaplex account URI decoder handles variable-length Borsh strings", () => {
  const encodeString = (value) => {
    const content = Buffer.from(value, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(content.length);
    return Buffer.concat([length, content]);
  };
  const account = Buffer.concat([
    Buffer.alloc(1 + 32 + 32),
    encodeString("Avatar"),
    encodeString("EKZAAV"),
    encodeString("ipfs://bafy-test"),
  ]);
  assert.equal(decodeMetaplexMetadataUri(account), "ipfs://bafy-test");
  assert.throws(() => decodeMetaplexMetadataUri(Buffer.alloc(4)), /truncated/);
});

test("Pinata client uploads only metadata JSON and validates the returned CID", async () => {
  const source = avatar();
  const metadata = buildMetaplexMetadata(source);
  const cid = `bafy${"a".repeat(55)}`;
  let request;
  const result = await pinMetadataJson({
    metadata,
    jwt: "test-jwt",
    pinName: "avatar.json",
    sourceAvatar: source,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            IpfsHash: cid,
            PinSize: 123,
            Timestamp: "2026-08-25T00:00:00.000Z",
          }),
      };
    },
    sleep: async () => {},
  });

  assert.equal(request.url, PINATA_JSON_ENDPOINT);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-jwt");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.pinataContent, metadata);
  assert.equal(body.pinataContent.animation_url, source.model_file_url);
  assert.equal(result.ipfsHash, cid);
  assert.equal(result.uri, `ipfs://${cid}`);

  assert.throws(() => assertIpfsHash(`b${"a".repeat(64)}`), /incompatible/);
});

test("dry-run plan and deployment checkpoint have explicit modes", () => {
  const manifest = sourceManifest([avatar()]);
  const args = parseArgs(
    ["--count", "1", "--collections", "collection-a"],
    paths
  );
  const selected = selectCc0Avatars(manifest, args.collections, args.count);
  const dryRun = createDryRunPlan(manifest, args, selected);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.writes, false);
  assert.equal(dryRun.networkRequests, false);
  assert.equal(dryRun.programId, MINTER_PROGRAM_ID);

  const deployment = createDeploymentManifest({
    manifest,
    args,
    selected,
    owner: "11111111111111111111111111111111",
    rpcHost: "devnet.helius-rpc.com",
    previous: null,
    now: "2026-08-25T00:00:00.000Z",
  });
  assert.equal(deployment.status, "in_progress");
  assert.equal(deployment.avatars[0].status, "selected");
  assert.doesNotThrow(() =>
    assertDeploymentCompatible(deployment, { ...deployment })
  );
  assert.throws(
    () =>
      assertDeploymentCompatible(deployment, {
        ...deployment,
        owner: "different-owner",
      }),
    /incompatible at owner/
  );
});

test("errors redact bearer tokens and RPC query credentials", () => {
  const message = sanitizeErrorMessage(
    new Error(
      "request https://devnet.example.test/?api-key=super-secret failed with Bearer jwt-value"
    )
  );
  assert.doesNotMatch(message, /super-secret|jwt-value/);
  assert.match(message, /api-key=\[redacted\]/);
  assert.match(message, /Bearer \[redacted\]/);
});
