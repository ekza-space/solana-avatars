#!/usr/bin/env node
"use strict";

/**
 * Publish a small, reproducible set of CC0 VRM templates through the
 * solana-avatars minter and mint one or more NFTs from every template.
 *
 * Safety properties:
 * - dry-run is the default and performs no network calls or file writes;
 * - live work requires an explicit --execute;
 * - execute mode verifies the Solana devnet genesis hash before Pinata or
 *   transaction mutations;
 * - metadata uploads reference existing model/thumbnail URLs and never upload
 *   model binaries;
 * - progress is atomically checkpointed in deployments/avatars-devnet.json.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEVNET_GENESIS_HASH,
  MINTER_PROGRAM_ID,
  assertDeploymentCompatible,
  assertIpfsHash,
  buildMetaplexMetadata,
  buildOnChainFields,
  createDeploymentManifest,
  createDryRunPlan,
  decodeMetaplexMetadataUri,
  parseArgs,
  pinMetadataJson,
  pinNameFor,
  readJsonFile,
  safeRpcHost,
  sanitizeErrorMessage,
  selectCc0Avatars,
  sourceAvatarKey,
  writeJsonAtomic,
} = require("./lib/devnet-avatar-collection");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MANIFEST_PATH = path.resolve(
  __dirname,
  "../../../opensourceavatars/manifest.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  "deployments/avatars-devnet.json"
);
const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

function printHelp() {
  process.stdout.write(`Usage:
  npm run avatars:devnet:dry-run -- [options]
  npm run avatars:devnet -- --execute [options]

Default mode is dry-run: it only reads the Open Source Avatars manifest and
prints a deterministic 12-avatar plan. It does not read wallet/PINATA_JWT,
contact Pinata/RPC, or write deployments.

Options:
  --manifest PATH              Source manifest.json
  --collections ID[,ID...]     CC0 source collections (default: 100avatars-r1)
  --count N                    Number of templates, 1..20 (default: 12)
  --max-supply N               Supply cap per template (default: 100)
  --mints-per-template N       NFTs minted now per template (default: 1)
  --mint-fee-lamports N        Mint fee configured per template (default: 0)
  --symbol TEXT                Metaplex symbol, <= 10 UTF-8 bytes (default: EKZAAV)
  --name-prefix TEXT           On-chain name prefix (default: "Ekza ")
  --rpc-url URL                Devnet RPC; Helius URL recommended
  --wallet PATH                Creator/minter keypair JSON
  --output PATH                Deployment checkpoint/output JSON
  --json                       Print the complete dry-run plan as JSON
  --dry-run                    Explicitly select safe dry-run mode
  --execute                    Pin metadata, initialize templates, and mint NFTs
  -h, --help                   Show this help

Execute-mode environment (read only after --execute):
  PINATA_JWT                   Pinata JWT used only for metadata JSON
  HELIUS_DEVNET_RPC_URL        RPC fallback when --rpc-url is omitted
  SOLANA_RPC_URL               Secondary RPC fallback
  ANCHOR_WALLET                Wallet fallback; otherwise ~/.config/solana/id.json

No .env loader is used. Model and thumbnail binaries are never uploaded.
`);
}

function dryRun(args, manifest, selected) {
  const plan = createDryRunPlan(manifest, args, selected);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      "DRY RUN — no network requests and no file writes",
      `Source snapshot: ${plan.source.registrySnapshotCommit || "unknown"}`,
      `Collections: ${plan.source.collections.join(", ")}`,
      `Templates: ${plan.avatars.length}`,
      `Program: ${plan.programId}`,
      `Output on execute: ${args.outputPath}`,
      "",
      ...plan.avatars.map(
        (avatar, index) =>
          `${String(index + 1).padStart(2, "0")}. ${avatar.onChain.name} ` +
          `[${avatar.source.collectionId}]\n    ${avatar.source.modelUrl}`
      ),
      "",
      "Re-run with --execute only after checking the wallet, devnet RPC, and plan.",
    ].join("\n") + "\n"
  );
}

function loadKeypair(anchor, walletPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read wallet keypair ${walletPath}: ${error.message}`
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error(`Wallet keypair ${walletPath} must contain 64 bytes`);
  }
  try {
    return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch (error) {
    throw new Error(`Invalid wallet keypair ${walletPath}: ${error.message}`);
  }
}

function requireBuiltMinterSdk() {
  const sdkPath = path.join(REPO_ROOT, "sdk/dist/src/minter.js");
  if (!fs.existsSync(sdkPath)) {
    throw new Error(
      "Built minter SDK is missing. Run `npm run build:sdk` or use `npm run avatars:devnet`."
    );
  }
  const loaded = require(sdkPath);
  if (!loaded.default?.create) {
    throw new Error(`Built minter SDK at ${sdkPath} has an unexpected shape`);
  }
  return loaded.default;
}

async function loadRuntime(args) {
  const anchor = require("@coral-xyz/anchor");
  const {
    TOKEN_PROGRAM_ID,
    getAccount,
    getMint,
  } = require("@solana/spl-token");
  const minterSdk = requireBuiltMinterSdk();

  const rpcUrl =
    args.rpcUrl ||
    process.env.HELIUS_DEVNET_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    DEFAULT_DEVNET_RPC_URL;
  const walletPath =
    args.walletPath ||
    process.env.ANCHOR_WALLET ||
    path.join(os.homedir(), ".config/solana/id.json");
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt?.trim()) {
    throw new Error("PINATA_JWT is required with --execute");
  }

  const keypair = loadKeypair(anchor, walletPath);
  const wallet = new anchor.Wallet(keypair);
  const connection = new anchor.web3.Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 90_000,
  });

  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(
      `Refusing execution: RPC ${safeRpcHost(rpcUrl)} is not Solana devnet ` +
        `(genesis ${genesisHash})`
    );
  }

  const idlPath = path.join(REPO_ROOT, "sdk/idl/avatar_nft_minter.json");
  const idl = readJsonFile(idlPath, "minter IDL");
  if (idl.address !== MINTER_PROGRAM_ID) {
    throw new Error(
      `Minter IDL address ${idl.address} does not match ${MINTER_PROGRAM_ID}`
    );
  }
  const programId = new anchor.web3.PublicKey(MINTER_PROGRAM_ID);
  const metadataProgramId = new anchor.web3.PublicKey(
    TOKEN_METADATA_PROGRAM_ID
  );
  const [programAccount, metadataProgramAccount] = await Promise.all([
    connection.getAccountInfo(programId, "confirmed"),
    connection.getAccountInfo(metadataProgramId, "confirmed"),
  ]);
  if (!programAccount?.executable) {
    throw new Error(`Minter program ${MINTER_PROGRAM_ID} is not deployed`);
  }
  if (!metadataProgramAccount?.executable) {
    throw new Error(
      `Metaplex Token Metadata program ${TOKEN_METADATA_PROGRAM_ID} is not deployed`
    );
  }

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);
  if (!program.programId.equals(programId)) {
    throw new Error(`Anchor resolved unexpected program ${program.programId}`);
  }

  return {
    anchor,
    client: minterSdk.create(provider, program),
    connection,
    getAccount,
    getMint,
    keypair,
    metadataProgramId,
    owner: keypair.publicKey.toBase58(),
    pinataJwt,
    program,
    rpcHost: safeRpcHost(rpcUrl),
    tokenProgramId: TOKEN_PROGRAM_ID,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function metadataDigest(metadata) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(metadata))
    .digest("hex");
}

function checkpoint(outputPath, deployment) {
  deployment.updatedAt = nowIso();
  writeJsonAtomic(outputPath, deployment);
}

function accountNumber(value, label) {
  const converted = value?.toNumber?.();
  if (!Number.isSafeInteger(converted)) {
    throw new Error(`On-chain ${label} is not a safe integer`);
  }
  return converted;
}

function existingTemplateKey(data) {
  return [
    data.creator.toBase58(),
    data.uriIpfsHash,
    data.maxSupply.toString(),
    data.mintingFeePerMint.toString(),
  ].join(":");
}

function wantedTemplateKey(owner, ipfsHash, args) {
  return [owner, ipfsHash, args.maxSupply, args.mintFeeLamports].join(":");
}

async function loadExistingTemplates(program) {
  const accounts = await program.account.avatarData.all();
  const byTemplate = new Map();
  for (const account of accounts) {
    const key = existingTemplateKey(account.account);
    if (!byTemplate.has(key)) byTemplate.set(key, account);
  }
  return byTemplate;
}

async function loadOwnedNftsByMetadataUri(runtime) {
  const response = await runtime.connection.getParsedTokenAccountsByOwner(
    runtime.keypair.publicKey,
    { programId: runtime.tokenProgramId },
    "confirmed"
  );
  const candidates = [];
  for (const item of response.value) {
    const info = item.account.data?.parsed?.info;
    if (
      info?.tokenAmount?.amount !== "1" ||
      info?.tokenAmount?.decimals !== 0 ||
      typeof info.mint !== "string"
    ) {
      continue;
    }
    const mint = new runtime.anchor.web3.PublicKey(info.mint);
    const [metadataPda] = runtime.client.getMetadataPda(mint);
    candidates.push({
      mint: mint.toBase58(),
      tokenAccount: item.pubkey.toBase58(),
      metadataPda,
    });
  }

  const metadataAccounts = [];
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const batch = candidates.slice(offset, offset + 100);
    const accounts = await runtime.connection.getMultipleAccountsInfo(
      batch.map((candidate) => candidate.metadataPda),
      "confirmed"
    );
    metadataAccounts.push(...accounts);
  }

  const byUri = new Map();
  for (let index = 0; index < candidates.length; index += 1) {
    const account = metadataAccounts[index];
    if (!account?.owner.equals(runtime.metadataProgramId)) continue;
    let uri;
    try {
      uri = decodeMetaplexMetadataUri(account.data);
    } catch {
      continue;
    }
    if (!uri) continue;
    const list = byUri.get(uri) || [];
    list.push({
      mint: candidates[index].mint,
      tokenAccount: candidates[index].tokenAccount,
      metadataPda: candidates[index].metadataPda.toBase58(),
    });
    byUri.set(uri, list);
  }
  return byUri;
}

async function verifyMint(runtime, mintRecord) {
  const { PublicKey } = runtime.anchor.web3;
  const mint = new PublicKey(mintRecord.mint);
  const tokenAccount = new PublicKey(mintRecord.tokenAccount);
  const metadataPda = new PublicKey(mintRecord.metadataPda);
  const [mintAccount, holderAccount, metadataAccount] = await Promise.all([
    runtime.getMint(runtime.connection, mint, "confirmed"),
    runtime.getAccount(runtime.connection, tokenAccount, "confirmed"),
    runtime.connection.getAccountInfo(metadataPda, "confirmed"),
  ]);

  if (mintAccount.decimals !== 0 || mintAccount.supply !== 1n) {
    throw new Error(`Mint ${mint} is not a one-of-one NFT mint`);
  }
  if (
    mintAccount.mintAuthority !== null ||
    mintAccount.freezeAuthority !== null
  ) {
    throw new Error(`Mint ${mint} still has an authority`);
  }
  if (
    holderAccount.amount !== 1n ||
    !holderAccount.owner.equals(runtime.keypair.publicKey)
  ) {
    throw new Error(`Token account ${tokenAccount} does not hold the NFT`);
  }
  if (!metadataAccount?.owner.equals(runtime.metadataProgramId)) {
    throw new Error(
      `Metadata PDA ${metadataPda} is missing or has wrong owner`
    );
  }

  mintRecord.verified = true;
  mintRecord.verifiedAt = nowIso();
}

async function verifyAvatarTemplate(runtime, entry, args) {
  const [expectedPda] = runtime.client.getAvatarDataPda(entry.avatarData.index);
  if (expectedPda.toBase58() !== entry.avatarData.pda) {
    throw new Error(
      `AvatarData checkpoint PDA ${entry.avatarData.pda} does not match index ${entry.avatarData.index}`
    );
  }
  const data = await runtime.client.getAvatarData(expectedPda);
  if (!data) {
    throw new Error(`AvatarData ${expectedPda} is missing`);
  }
  if (
    data.uriIpfsHash !== entry.metadata.ipfsHash ||
    !data.creator.equals(runtime.keypair.publicKey) ||
    data.maxSupply.toString() !== String(args.maxSupply) ||
    data.mintingFeePerMint.toString() !== args.mintFeeLamports
  ) {
    throw new Error(`AvatarData ${expectedPda} does not match the checkpoint`);
  }
  entry.avatarData.currentSupply = data.currentSupply.toString();
  return data;
}

function sourceStillMatches(entry, avatar) {
  const expectedKey = sourceAvatarKey(avatar);
  if (entry.source?.key !== expectedKey) {
    throw new Error(`Deployment entry source mismatch for ${expectedKey}`);
  }
  if (
    entry.source.modelUrl !== avatar.model_file_url ||
    entry.source.thumbnailUrl !== avatar.thumbnail_url
  ) {
    throw new Error(
      `Source URLs changed for ${expectedKey}; use a new output after reviewing the updated dataset snapshot`
    );
  }
}

async function executeDeployment(args, manifest, selected) {
  const runtime = await loadRuntime(args);
  const previous = fs.existsSync(args.outputPath)
    ? readJsonFile(args.outputPath, "deployment output")
    : null;
  const deployment = createDeploymentManifest({
    manifest,
    args,
    selected,
    owner: runtime.owner,
    rpcHost: runtime.rpcHost,
    previous,
    now: nowIso(),
  });
  assertDeploymentCompatible(previous, deployment);
  checkpoint(args.outputPath, deployment);

  try {
    const balance = await runtime.connection.getBalance(
      runtime.keypair.publicKey,
      "confirmed"
    );
    process.stdout.write(
      `Devnet verified (${runtime.rpcHost}); owner ${runtime.owner}; ` +
        `balance ${(balance / runtime.anchor.web3.LAMPORTS_PER_SOL).toFixed(
          4
        )} SOL\n`
    );

    const templatesByKey = await loadExistingTemplates(runtime.program);
    const ownedNftsByUri = await loadOwnedNftsByMetadataUri(runtime);
    const checkpointedMints = new Set(
      deployment.avatars.flatMap((entry) =>
        (entry.mints || []).map((mint) => mint.mint)
      )
    );

    for (let index = 0; index < selected.length; index += 1) {
      const avatar = selected[index];
      const entry = deployment.avatars[index];
      sourceStillMatches(entry, avatar);
      const label = `[${index + 1}/${selected.length}] ${avatar.name}`;
      const metadata = buildMetaplexMetadata(avatar, {
        creatorAddress: runtime.owner,
        symbol: args.symbol,
      });
      const onChain = buildOnChainFields(avatar, args);

      if (!entry.metadata) {
        process.stdout.write(`${label}: pinning metadata JSON\n`);
        const pinned = await pinMetadataJson({
          metadata,
          jwt: runtime.pinataJwt,
          pinName: pinNameFor(avatar),
          sourceAvatar: avatar,
        });
        entry.metadata = {
          ...pinned,
          sha256: metadataDigest(metadata),
          pinName: pinNameFor(avatar),
          modelUrl: avatar.model_file_url,
          imageUrl: avatar.thumbnail_url,
        };
        entry.status = "metadata_pinned";
        checkpoint(args.outputPath, deployment);
      } else {
        assertIpfsHash(entry.metadata.ipfsHash);
        if (
          entry.metadata.sha256 !== metadataDigest(metadata) ||
          entry.metadata.modelUrl !== avatar.model_file_url
        ) {
          throw new Error(
            `${label}: pinned metadata checkpoint does not match the current plan`
          );
        }
      }

      const templateKey = wantedTemplateKey(
        runtime.owner,
        entry.metadata.ipfsHash,
        args
      );
      if (!entry.avatarData) {
        const recovered = templatesByKey.get(templateKey);
        if (recovered) {
          entry.avatarData = {
            index: accountNumber(recovered.account.index, "avatar index"),
            pda: recovered.publicKey.toBase58(),
            initializeSignature: null,
            recoveredFromChain: true,
          };
          process.stdout.write(
            `${label}: reusing on-chain template ${entry.avatarData.pda}\n`
          );
        } else {
          process.stdout.write(`${label}: initialize_avatar\n`);
          const result = await runtime.client.initializeAvatar({
            ipfsHash: entry.metadata.ipfsHash,
            maxSupply: new runtime.anchor.BN(String(args.maxSupply)),
            mintingFeePerMint: new runtime.anchor.BN(args.mintFeeLamports),
          });
          const data = await runtime.client.getAvatarData(result.avatarDataPda);
          if (!data) {
            throw new Error(
              `${label}: initialized AvatarData could not be fetched`
            );
          }
          entry.avatarData = {
            index: accountNumber(data.index, "avatar index"),
            pda: result.avatarDataPda.toBase58(),
            initializeSignature: result.signature,
            recoveredFromChain: false,
          };
          templatesByKey.set(templateKey, {
            publicKey: result.avatarDataPda,
            account: data,
          });
        }
        entry.status = "initialized";
        checkpoint(args.outputPath, deployment);
      }

      const templateData = await verifyAvatarTemplate(runtime, entry, args);

      if (!Array.isArray(entry.mints)) entry.mints = [];
      if (entry.mints.length > args.mintsPerTemplate) {
        throw new Error(
          `${label}: checkpoint contains more mints than requested by the deployment config`
        );
      }
      for (const recovered of ownedNftsByUri.get(entry.metadata.uri) || []) {
        if (entry.mints.length >= args.mintsPerTemplate) break;
        if (checkpointedMints.has(recovered.mint)) continue;
        entry.mints.push({
          ...recovered,
          signature: null,
          recoveredFromChain: true,
          verified: false,
          verifiedAt: null,
        });
        checkpointedMints.add(recovered.mint);
        entry.status = "mint_recovered";
        checkpoint(args.outputPath, deployment);
        process.stdout.write(
          `${label}: recovered owned mint ${recovered.mint} from chain\n`
        );
      }
      const remainingMints = args.mintsPerTemplate - entry.mints.length;
      if (
        templateData.currentSupply
          .add(new runtime.anchor.BN(remainingMints))
          .gt(templateData.maxSupply)
      ) {
        throw new Error(`${label}: max supply cannot fit the remaining mints`);
      }
      for (const mintRecord of entry.mints) {
        if (!mintRecord.verified) {
          await verifyMint(runtime, mintRecord);
          checkpoint(args.outputPath, deployment);
        }
      }

      while (entry.mints.length < args.mintsPerTemplate) {
        process.stdout.write(
          `${label}: mint_nft ${entry.mints.length + 1}/${
            args.mintsPerTemplate
          }\n`
        );
        const result = await runtime.client.mintNft({
          index: entry.avatarData.index,
          name: onChain.name,
          symbol: onChain.symbol,
          uri: entry.metadata.uri,
        });
        const mintRecord = {
          mint: result.mintPk.toBase58(),
          tokenAccount: result.tokenAccountPk.toBase58(),
          metadataPda: result.metadataPk.toBase58(),
          signature: result.signature,
          verified: false,
          verifiedAt: null,
        };
        entry.mints.push(mintRecord);
        checkpointedMints.add(mintRecord.mint);
        entry.status = "mint_submitted";
        checkpoint(args.outputPath, deployment);
        await verifyMint(runtime, mintRecord);
        checkpoint(args.outputPath, deployment);
      }

      const finalData = await runtime.client.getAvatarData(
        new runtime.anchor.web3.PublicKey(entry.avatarData.pda)
      );
      if (!finalData) {
        throw new Error(`${label}: AvatarData disappeared after minting`);
      }
      entry.avatarData.currentSupply = finalData.currentSupply.toString();
      entry.status = "complete";
      checkpoint(args.outputPath, deployment);
    }

    deployment.status = "complete";
    deployment.completedAt = nowIso();
    deployment.lastError = null;
    checkpoint(args.outputPath, deployment);
    process.stdout.write(
      `Complete: ${selected.length} templates and ` +
        `${selected.length * args.mintsPerTemplate} NFT(s).\n` +
        `Deployment output: ${args.outputPath}\n`
    );
  } catch (error) {
    deployment.status = "failed";
    deployment.lastError = sanitizeErrorMessage(error);
    checkpoint(args.outputPath, deployment);
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv, {
    defaultManifestPath: DEFAULT_MANIFEST_PATH,
    defaultOutputPath: DEFAULT_OUTPUT_PATH,
  });
  if (args.help) {
    printHelp();
    return;
  }

  const manifest = readJsonFile(args.manifestPath, "source manifest");
  const selected = selectCc0Avatars(manifest, args.collections, args.count);
  if (!args.execute) {
    dryRun(args, manifest, selected);
    return;
  }
  await executeDeployment(args, manifest, selected);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
