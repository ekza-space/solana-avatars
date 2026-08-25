"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEPLOYMENT_SCHEMA_VERSION = 1;
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MINTER_PROGRAM_ID = "29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz";
const PINATA_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const SOURCE_HOMEPAGE = "https://www.opensourceavatars.com";
const SOURCE_REGISTRY = "https://github.com/ToxSam/open-source-avatars";

const DEFAULTS = Object.freeze({
  collections: ["100avatars-r1"],
  count: 12,
  maxSupply: 100,
  mintFeeLamports: "0",
  mintsPerTemplate: 1,
  symbol: "EKZAAV",
  namePrefix: "Ekza ",
});

function parseInteger(
  value,
  flag,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {}
) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${flag} must be an integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseLamports(value) {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error("--mint-fee-lamports must be a non-negative integer");
  }
  return BigInt(raw).toString();
}

function parseArgs(argv, paths) {
  const args = {
    manifestPath: paths.defaultManifestPath,
    outputPath: paths.defaultOutputPath,
    collections: [...DEFAULTS.collections],
    count: DEFAULTS.count,
    maxSupply: DEFAULTS.maxSupply,
    mintFeeLamports: DEFAULTS.mintFeeLamports,
    mintsPerTemplate: DEFAULTS.mintsPerTemplate,
    symbol: DEFAULTS.symbol,
    namePrefix: DEFAULTS.namePrefix,
    rpcUrl: null,
    walletPath: null,
    execute: false,
    json: false,
    help: false,
  };
  let selectedMode = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const requireValue = () => {
      if (!next || next.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return next;
    };

    if (arg === "--manifest") {
      args.manifestPath = path.resolve(requireValue());
    } else if (arg === "--output") {
      args.outputPath = path.resolve(requireValue());
    } else if (arg === "--collections") {
      args.collections = requireValue()
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (args.collections.length === 0) {
        throw new Error(
          "--collections must contain at least one collection id"
        );
      }
    } else if (arg === "--count") {
      args.count = parseInteger(requireValue(), "--count", {
        min: 1,
        max: 20,
      });
    } else if (arg === "--max-supply") {
      args.maxSupply = parseInteger(requireValue(), "--max-supply", {
        min: 1,
      });
    } else if (arg === "--mints-per-template") {
      args.mintsPerTemplate = parseInteger(
        requireValue(),
        "--mints-per-template",
        { min: 1, max: 20 }
      );
    } else if (arg === "--mint-fee-lamports") {
      args.mintFeeLamports = parseLamports(requireValue());
    } else if (arg === "--symbol") {
      args.symbol = requireValue().trim();
    } else if (arg === "--name-prefix") {
      args.namePrefix = requireValue();
    } else if (arg === "--rpc-url") {
      args.rpcUrl = requireValue();
    } else if (arg === "--wallet") {
      args.walletPath = path.resolve(requireValue());
    } else if (arg === "--execute") {
      if (selectedMode === "dry-run") {
        throw new Error("--execute and --dry-run are mutually exclusive");
      }
      selectedMode = "execute";
      args.execute = true;
    } else if (arg === "--dry-run") {
      if (selectedMode === "execute") {
        throw new Error("--execute and --dry-run are mutually exclusive");
      }
      selectedMode = "dry-run";
      args.execute = false;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.mintsPerTemplate > args.maxSupply) {
    throw new Error("--mints-per-template cannot exceed --max-supply");
  }
  assertMetaplexText(args.symbol, "--symbol", 10);
  if (Buffer.byteLength(args.namePrefix, "utf8") > 31) {
    throw new Error("--name-prefix must leave room for an avatar name");
  }
  if (args.manifestPath === args.outputPath) {
    throw new Error("--manifest and --output must be different files");
  }

  return args;
}

function readJsonFile(filePath, label = "JSON file") {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} ${filePath}: ${error.message}`);
  }
}

function assertAssetUrl(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing`);
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("ipfs://") || trimmed.startsWith("ar://")) {
    return trimmed;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} is not a valid asset URL: ${trimmed}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} uses unsupported protocol ${parsed.protocol}`);
  }
  return trimmed;
}

function normalizeSourceAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    throw new Error("Avatar manifest entry must be an object");
  }

  const requiredStrings = [
    "id",
    "name",
    "collection_id",
    "collection_name",
    "author",
    "license",
    "format",
  ];
  for (const key of requiredStrings) {
    if (typeof avatar[key] !== "string" || avatar[key].trim() === "") {
      throw new Error(`Avatar manifest entry is missing ${key}`);
    }
  }

  return {
    ...avatar,
    id: avatar.id.trim(),
    name: avatar.name.trim(),
    collection_id: avatar.collection_id.trim(),
    collection_name: avatar.collection_name.trim(),
    author: avatar.author.trim(),
    license: avatar.license.trim(),
    format: avatar.format.trim(),
    model_file_url: assertAssetUrl(
      avatar.model_file_url,
      `model_file_url for ${avatar.id}`
    ),
    thumbnail_url: assertAssetUrl(
      avatar.thumbnail_url,
      `thumbnail_url for ${avatar.id}`
    ),
    tags: Array.isArray(avatar.tags)
      ? avatar.tags.filter((tag) => typeof tag === "string")
      : [],
  };
}

/**
 * Selects a stable, round-robin sample from the requested upstream
 * collections. Only CC0 VRM entries are eligible: a CC-BY avatar can never be
 * included by a typo in the CLI arguments.
 */
function selectCc0Avatars(manifest, collectionIds, count) {
  if (!manifest || !Array.isArray(manifest.avatars)) {
    throw new Error("Source manifest must contain an avatars array");
  }
  if (!Array.isArray(manifest.collections)) {
    throw new Error("Source manifest must contain a collections array");
  }

  const collectionById = new Map(
    manifest.collections.map((collection) => [collection.id, collection])
  );
  const uniqueCollectionIds = [...new Set(collectionIds)];
  if (uniqueCollectionIds.length !== collectionIds.length) {
    throw new Error("--collections contains duplicate ids");
  }

  const buckets = new Map();
  for (const collectionId of uniqueCollectionIds) {
    const collection = collectionById.get(collectionId);
    if (!collection) {
      throw new Error(`Unknown source collection: ${collectionId}`);
    }
    if (collection.license !== "CC0") {
      throw new Error(
        `Collection ${collectionId} is ${collection.license}, not CC0`
      );
    }
    buckets.set(collectionId, []);
  }

  const seenKeys = new Set();
  for (const rawAvatar of manifest.avatars) {
    if (!buckets.has(rawAvatar?.collection_id)) continue;
    if (rawAvatar.license !== "CC0") continue;
    if (String(rawAvatar.format).toUpperCase() !== "VRM") continue;
    const avatar = normalizeSourceAvatar(rawAvatar);
    const key = sourceAvatarKey(avatar);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate avatar source key in manifest: ${key}`);
    }
    seenKeys.add(key);
    buckets.get(avatar.collection_id).push(avatar);
  }

  const available = [...buckets.values()].reduce(
    (total, values) => total + values.length,
    0
  );
  if (available < count) {
    throw new Error(
      `Requested ${count} avatars, but only ${available} eligible CC0 VRMs are available`
    );
  }

  const selected = [];
  for (let offset = 0; selected.length < count; offset += 1) {
    for (const collectionId of uniqueCollectionIds) {
      const avatar = buckets.get(collectionId)[offset];
      if (avatar) selected.push(avatar);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function sourceAvatarKey(avatar) {
  return `${avatar.collection_id}:${avatar.id}`;
}

function buildMetaplexMetadata(avatar, options = {}) {
  const creatorAddress = options.creatorAddress || null;
  const symbol = options.symbol || DEFAULTS.symbol;
  assertMetaplexText(symbol, "metadata symbol", 10);

  const attributes = [
    { trait_type: "Collection", value: avatar.collection_name },
    { trait_type: "Author", value: avatar.author },
    { trait_type: "License", value: "CC0 1.0" },
    { trait_type: "Format", value: "VRM" },
    { trait_type: "Source ID", value: avatar.id },
  ];
  for (const tag of avatar.tags || []) {
    const separator = tag.indexOf(":");
    if (separator <= 0 || separator === tag.length - 1) continue;
    const traitType = `Source ${tag.slice(0, separator)}`;
    if (attributes.some((attribute) => attribute.trait_type === traitType)) {
      continue;
    }
    attributes.push({
      trait_type: traitType,
      value: tag.slice(separator + 1),
    });
  }

  const sourceDescription =
    typeof avatar.description === "string" && avatar.description.trim()
      ? avatar.description.trim()
      : `${avatar.name} from ${avatar.collection_name}.`;

  return {
    name: `Ekza Avatar — ${avatar.name}`,
    symbol,
    description: `${sourceDescription} CC0 1.0 public-domain avatar by ${avatar.author}; model URL is referenced directly from the Open Source Avatars registry.`,
    image: avatar.thumbnail_url,
    animation_url: avatar.model_file_url,
    external_url: avatar.source_url || SOURCE_HOMEPAGE,
    attributes,
    properties: {
      category: "vrmodel",
      files: [{ uri: avatar.model_file_url, type: "model/vrm" }],
      creators: creatorAddress ? [{ address: creatorAddress, share: 100 }] : [],
    },
    ekza: {
      atom: "solana-avatars",
      sourceDataset: "Open Source Avatars",
      sourceRegistry: SOURCE_REGISTRY,
      sourceCollectionId: avatar.collection_id,
      sourceAvatarId: avatar.id,
      sourceLicense: "CC0",
    },
  };
}

function assertMetaplexText(value, label, maxBytes) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must not be empty`);
  }
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} UTF-8 bytes (${bytes})`);
  }
  return value;
}

function truncateUtf8(value, maxBytes) {
  let result = "";
  for (const character of String(value)) {
    const candidate = result + character;
    if (Buffer.byteLength(candidate, "utf8") > maxBytes) break;
    result = candidate;
  }
  return result;
}

function decodeMetaplexMetadataUri(accountData) {
  if (!Buffer.isBuffer(accountData) && !(accountData instanceof Uint8Array)) {
    throw new Error("Metaplex metadata account data must be bytes");
  }
  const bytes = Buffer.from(
    accountData.buffer,
    accountData.byteOffset,
    accountData.byteLength
  );
  let offset = 1 + 32 + 32;

  const readBorshString = (label) => {
    if (offset + 4 > bytes.length) {
      throw new Error(`Metaplex metadata is truncated before ${label}`);
    }
    const length = bytes.readUInt32LE(offset);
    offset += 4;
    if (length > 10_000 || offset + length > bytes.length) {
      throw new Error(`Metaplex metadata has invalid ${label} length`);
    }
    const value = bytes
      .subarray(offset, offset + length)
      .toString("utf8")
      .replace(/\0/g, "")
      .trim();
    offset += length;
    return value;
  };

  readBorshString("name");
  readBorshString("symbol");
  return readBorshString("uri");
}

function buildOnChainFields(avatar, options = {}) {
  const prefix = options.namePrefix ?? DEFAULTS.namePrefix;
  const symbol = options.symbol || DEFAULTS.symbol;
  const name = truncateUtf8(`${prefix}${avatar.name}`, 32).trim();
  assertMetaplexText(name, "NFT name", 32);
  assertMetaplexText(symbol, "NFT symbol", 10);
  return { name, symbol };
}

function assertIpfsHash(value) {
  if (typeof value !== "string") {
    throw new Error("Pinata response is missing IpfsHash");
  }
  const hash = value.trim();
  if (!/^[A-Za-z0-9]+$/.test(hash) || hash.length > 64) {
    throw new Error(
      `Pinata returned an IPFS identifier incompatible with AvatarData: ${hash}`
    );
  }
  return hash;
}

function pinataErrorMessage(status, rawBody) {
  let reason = "";
  try {
    const parsed = JSON.parse(rawBody);
    reason =
      parsed?.error?.reason ||
      parsed?.error?.details ||
      parsed?.error ||
      parsed?.message ||
      "";
  } catch {
    reason = rawBody;
  }
  const safeReason = String(reason).replace(/\s+/g, " ").trim().slice(0, 300);
  return safeReason
    ? `Pinata request failed (${status}): ${safeReason}`
    : `Pinata request failed (${status})`;
}

function isRetryableHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function pinMetadataJson({
  metadata,
  jwt,
  pinName,
  sourceAvatar,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 3,
  requestTimeoutMs = 30_000,
}) {
  if (typeof jwt !== "string" || jwt.trim() === "") {
    throw new Error("PINATA_JWT is required in execute mode");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("This Node runtime does not provide fetch");
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Pinata attempts must be a positive integer");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error("Pinata request timeout must be a positive integer");
  }

  const requestBody = JSON.stringify({
    pinataContent: metadata,
    pinataMetadata: {
      name: pinName,
      keyvalues: {
        ekza_atom: "solana-avatars",
        source_collection: sourceAvatar.collection_id,
        source_avatar: sourceAvatar.id,
        source_license: "CC0",
      },
    },
  });

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(PINATA_JSON_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt.trim()}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });
      const rawBody = await response.text();
      if (!response.ok) {
        const error = new Error(pinataErrorMessage(response.status, rawBody));
        error.retryable = isRetryableHttpStatus(response.status);
        throw error;
      }

      let result;
      try {
        result = JSON.parse(rawBody);
      } catch {
        throw new Error("Pinata returned a non-JSON success response");
      }
      const ipfsHash = assertIpfsHash(result.IpfsHash);
      return {
        ipfsHash,
        uri: `ipfs://${ipfsHash}`,
        pinSize: Number.isFinite(result.PinSize) ? result.PinSize : null,
        timestamp:
          typeof result.Timestamp === "string" ? result.Timestamp : null,
      };
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === attempts) throw error;
      await sleep(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function pinNameFor(avatar) {
  const slug = `${avatar.collection_id}-${avatar.id}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `ekza-avatar-${slug || "cc0"}.json`;
}

function createDryRunPlan(manifest, args, selected) {
  return {
    schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
    mode: "dry-run",
    writes: false,
    networkRequests: false,
    cluster: "devnet",
    programId: MINTER_PROGRAM_ID,
    source: {
      dataset: manifest.dataset || "Open Source Avatars",
      registrySnapshotCommit: manifest.registry_snapshot_commit || null,
      collections: args.collections,
      count: selected.length,
    },
    config: deploymentConfig(args),
    avatars: selected.map((avatar) => ({
      sourceKey: sourceAvatarKey(avatar),
      source: deploymentSource(avatar),
      onChain: buildOnChainFields(avatar, args),
      pinName: pinNameFor(avatar),
      metadata: buildMetaplexMetadata(avatar, { symbol: args.symbol }),
    })),
  };
}

function deploymentConfig(args) {
  return {
    maxSupply: String(args.maxSupply),
    mintFeeLamports: String(args.mintFeeLamports),
    mintsPerTemplate: args.mintsPerTemplate,
    symbol: args.symbol,
    namePrefix: args.namePrefix,
  };
}

function deploymentSource(avatar) {
  return {
    id: avatar.id,
    key: sourceAvatarKey(avatar),
    name: avatar.name,
    collectionId: avatar.collection_id,
    collectionName: avatar.collection_name,
    author: avatar.author,
    license: "CC0",
    format: "VRM",
    modelUrl: avatar.model_file_url,
    thumbnailUrl: avatar.thumbnail_url,
    sourceUrl: avatar.source_url || null,
  };
}

function createDeploymentManifest({
  manifest,
  args,
  selected,
  owner,
  rpcHost,
  previous,
  now,
}) {
  const existingEntries = new Map(
    (previous?.avatars || []).map((entry) => [entry.source?.key, entry])
  );
  const createdAt = previous?.createdAt || now;
  return {
    schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
    cluster: "devnet",
    programId: MINTER_PROGRAM_ID,
    status: "in_progress",
    owner,
    rpcHost,
    source: {
      dataset: manifest.dataset || "Open Source Avatars",
      registrySource: manifest.registry_source || SOURCE_REGISTRY,
      registrySnapshotCommit: manifest.registry_snapshot_commit || null,
      collections: args.collections,
      count: selected.length,
    },
    config: deploymentConfig(args),
    createdAt,
    updatedAt: now,
    completedAt: null,
    lastError: null,
    avatars: selected.map((avatar) => {
      const existing = existingEntries.get(sourceAvatarKey(avatar));
      return (
        existing || {
          source: deploymentSource(avatar),
          status: "selected",
          metadata: null,
          avatarData: null,
          mints: [],
        }
      );
    }),
  };
}

function assertDeploymentCompatible(previous, expected) {
  if (!previous || previous.status === "not_started") return;
  const checks = [
    [previous.schemaVersion, expected.schemaVersion, "schemaVersion"],
    [previous.cluster, expected.cluster, "cluster"],
    [previous.programId, expected.programId, "programId"],
    [previous.owner, expected.owner, "owner"],
    [
      previous.source?.registrySnapshotCommit,
      expected.source?.registrySnapshotCommit,
      "source.registrySnapshotCommit",
    ],
    [
      JSON.stringify(previous.source?.collections),
      JSON.stringify(expected.source?.collections),
      "source.collections",
    ],
    [previous.source?.count, expected.source?.count, "source.count"],
    [
      JSON.stringify(previous.config),
      JSON.stringify(expected.config),
      "config",
    ],
  ];
  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) {
      throw new Error(
        `Existing deployment output is incompatible at ${label}; use the original arguments or a different --output file`
      );
    }
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  fs.renameSync(temporaryPath, filePath);
}

function safeRpcHost(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}

function sanitizeErrorMessage(error) {
  return String(error?.message || error)
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(
      /([?&](?:api[-_]?key|token|jwt|secret)=)[^&\s)]+/gi,
      "$1[redacted]"
    )
    .slice(0, 1000);
}

module.exports = {
  DEFAULTS,
  DEPLOYMENT_SCHEMA_VERSION,
  DEVNET_GENESIS_HASH,
  MINTER_PROGRAM_ID,
  PINATA_JSON_ENDPOINT,
  assertDeploymentCompatible,
  assertIpfsHash,
  buildMetaplexMetadata,
  buildOnChainFields,
  createDeploymentManifest,
  createDryRunPlan,
  decodeMetaplexMetadataUri,
  deploymentConfig,
  deploymentSource,
  parseArgs,
  pinMetadataJson,
  pinNameFor,
  readJsonFile,
  safeRpcHost,
  sanitizeErrorMessage,
  selectCc0Avatars,
  sourceAvatarKey,
  truncateUtf8,
  writeJsonAtomic,
};
