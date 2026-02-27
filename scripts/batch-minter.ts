#!/usr/bin/env node
/**
 * Batch NFT Minter for Solana Avatars
 * 
 * This script batch-mints NFT collections from 3D models (GLB/BLEND files)
 * with proper asset_origin metadata for the Everything Library - BUILDINGS collection.
 * 
 * Usage:
 *   npm run batch-mint -- --models-dir ./models --max-supply 100 --mint-fee 0.001
 * 
 * Or programmatically:
 *   import { batchMint } from './batch-minter';
 *   await batchMint({ modelsDir: './models', maxSupply: 100n, mintFeeSol: 0.001 });
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import fetch from "node-fetch";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import minterSdk from "../sdk/src/minter.js";
import type { NftMetadata, AssetOrigin } from "../app/app/types/nft.js";

// Asset origin template for Everything Library - BUILDINGS
const BUILDINGS_ASSET_ORIGIN: AssetOrigin = {
  title: "Everything Library - BUILDINGS 0.1",
  asset_type: "3d_model",
  author: {
    name: "David OReilly",
    copyright: "Everything Library © David OReilly",
  },
  source: {
    name: "Everything Library",
    url: "http://davidoreilly.com/library",
    original_release_date: "2020-08-02",
  },
  license: {
    type: "CC_BY_4_0",
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  modifications: {
    is_modified: true,
    modified_by: "Ekza Space",
    notes: "Optimized, repackaged, and prepared for minting",
  },
  commercial_terms: {
    mint_fee_type: "service_fee",
    mint_fee_note: "Fee covers minting, hosting, and platform services only",
    exclusive_rights_transferred: false,
  },
  provenance: {
    minted_by: "Ekza Space",
    mint_context: "NFT mint via platform",
  },
};

export interface BatchMintConfig {
  /** Directory containing .glb model files */
  modelsDir: string;
  /** Directory containing preview images (PNG/JPG). If not provided, will use placeholder */
  previewsDir?: string;
  /** RPC endpoint (default: devnet) */
  rpcUrl?: string;
  /** Path to wallet keypair JSON file */
  keypairPath: string;
  /** Program ID (optional, uses default if not provided) */
  programId?: string;
  /** Max supply per collection (u64 max for unlimited) */
  maxSupply: bigint;
  /** Mint fee in SOL */
  mintFeeSol: number;
  /** IPFS upload endpoint */
  ipfsEndpoint: string;
  /** Base URL for metadata API */
  metadataApiUrl: string;
  /** Collection name prefix */
  namePrefix: string;
  /** Collection symbol */
  symbol: string;
  /** Description template */
  descriptionTemplate: string;
  /** Asset origin metadata (defaults to BUILDINGS template) */
  assetOrigin?: AssetOrigin;
  /** Dry run mode (upload only, no blockchain tx) */
  dryRun?: boolean;
  /** Start from specific index (for resuming) */
  startIndex?: number;
  /** Limit number of collections to create */
  limit?: number;
}

export interface BatchMintResult {
  successful: Array<{
    modelName: string;
    modelPath: string;
    collectionIndex: number;
    avatarDataPda: string;
    metadataUri: string;
    modelUri: string;
    previewUri: string;
    signature: string;
  }>;
  failed: Array<{
    modelName: string;
    modelPath: string;
    error: string;
  }>;
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}

interface UploadedFile {
  field: string;
  ipfsHash: string;
  uri: string;
}

/**
 * Upload a file to IPFS via the metadata API
 */
async function uploadFile(
  filePath: string,
  apiUrl: string,
  fieldName: string = "file"
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append(fieldName, fs.createReadStream(filePath));

  const response = await fetch(`${apiUrl}/api/upload-metadata`, {
    method: "POST",
    body: formData as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText}`);
  }

  const result = await response.json() as { files: UploadedFile[] };
  return result.files[0];
}

/**
 * Upload JSON metadata to IPFS
 */
async function uploadMetadata(
  metadata: NftMetadata,
  apiUrl: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/upload-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Metadata upload failed: ${errorText}`);
  }

  const result = await response.json() as { ipfsHash: string };
  return result.ipfsHash;
}

/**
 * Generate a preview image for a 3D model (placeholder - implement with Blender/puppeteer if needed)
 */
async function generatePreview(modelPath: string): Promise<Buffer> {
  // TODO: Implement actual preview generation using Blender or Puppeteer + Three.js
  // For now, create a simple placeholder
  console.log(`⚠️  Preview generation not implemented for ${path.basename(modelPath)}`);
  console.log(`   Using placeholder image. Consider implementing Blender-based rendering.`);
  
  // Return a 1x1 transparent PNG as placeholder
  const placeholderPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  return placeholderPng;
}

/**
 * Find matching preview file for a model
 */
function findPreviewFile(modelPath: string, previewsDir?: string): string | null {
  if (!previewsDir || !fs.existsSync(previewsDir)) {
    return null;
  }

  const modelName = path.basename(modelPath, path.extname(modelPath));
  const previewExtensions = [".png", ".jpg", ".jpeg", ".webp"];
  
  for (const ext of previewExtensions) {
    const previewPath = path.join(previewsDir, modelName + ext);
    if (fs.existsSync(previewPath)) {
      return previewPath;
    }
  }
  
  return null;
}

/**
 * Process a single model: upload files and create metadata
 */
async function processModel(
  modelPath: string,
  config: BatchMintConfig,
  index: number
): Promise<{
  modelUri: string;
  previewUri: string;
  metadataUri: string;
  metadata: NftMetadata;
}> {
  const modelName = path.basename(modelPath, path.extname(modelPath));
  console.log(`\n📦 Processing: ${modelName}`);

  // Upload model file
  console.log(`   Uploading model...`);
  const modelUpload = await uploadFile(modelPath, config.metadataApiUrl, "file");
  const modelUri = modelUpload.ipfsHash;
  console.log(`   ✓ Model: ipfs://${modelUri}`);

  // Handle preview image
  let previewUri: string;
  const existingPreview = findPreviewFile(modelPath, config.previewsDir);
  
  if (existingPreview) {
    console.log(`   Uploading preview: ${path.basename(existingPreview)}`);
    const previewUpload = await uploadFile(existingPreview, config.metadataApiUrl, "file");
    previewUri = previewUpload.ipfsHash;
  } else {
    // Generate and upload placeholder
    console.log(`   Generating placeholder preview...`);
    const previewBuffer = await generatePreview(modelPath);
    const tempPreviewPath = path.join("/tmp", `${modelName}_preview.png`);
    fs.writeFileSync(tempPreviewPath, previewBuffer);
    const previewUpload = await uploadFile(tempPreviewPath, config.metadataApiUrl, "file");
    previewUri = previewUpload.ipfsHash;
    fs.unlinkSync(tempPreviewPath);
  }
  console.log(`   ✓ Preview: ipfs://${previewUri}`);

  // Build metadata
  const metadata: NftMetadata = {
    name: `${config.namePrefix} #${index}`,
    symbol: config.symbol,
    description: config.descriptionTemplate.replace("{name}", modelName).replace("{index}", String(index)),
    image: previewUri,
    animation_url: modelUri,
    attributes: [
      { trait_type: "Model", value: modelName },
      { trait_type: "Index", value: index },
      { trait_type: "Source", value: "Everything Library" },
    ],
    properties: {
      files: [
        { uri: previewUri, type: "image/png" },
        { uri: modelUri, type: "model/gltf-binary" },
      ],
      category: "vrmodel",
      creators: [], // Will be set during deployment
    },
    asset_origin: config.assetOrigin || BUILDINGS_ASSET_ORIGIN,
  };

  // Upload metadata
  console.log(`   Uploading metadata...`);
  const metadataUri = await uploadMetadata(metadata, config.metadataApiUrl);
  console.log(`   ✓ Metadata: ipfs://${metadataUri}`);

  return { modelUri, previewUri, metadataUri, metadata };
}

/**
 * Main batch mint function
 */
export async function batchMint(config: BatchMintConfig): Promise<BatchMintResult> {
  const result: BatchMintResult = {
    successful: [],
    failed: [],
    summary: { total: 0, success: 0, failed: 0 },
  };

  console.log("🚀 Starting batch mint process\n");
  console.log("Configuration:");
  console.log(`  Models dir: ${config.modelsDir}`);
  console.log(`  Max supply: ${config.maxSupply.toString()}`);
  console.log(`  Mint fee: ${config.mintFeeSol} SOL`);
  console.log(`  RPC: ${config.rpcUrl || "https://api.devnet.solana.com"}`);
  console.log(`  Dry run: ${config.dryRun ? "YES" : "NO"}`);
  console.log("");

  // Validate inputs
  if (!fs.existsSync(config.modelsDir)) {
    throw new Error(`Models directory does not exist: ${config.modelsDir}`);
  }
  if (!fs.existsSync(config.keypairPath)) {
    throw new Error(`Keypair file does not exist: ${config.keypairPath}`);
  }

  // Get list of models
  const modelFiles = fs
    .readdirSync(config.modelsDir)
    .filter((f) => f.endsWith(".glb") || f.endsWith(".blend"))
    .map((f) => path.join(config.modelsDir, f));

  if (modelFiles.length === 0) {
    throw new Error(`No .glb or .blend files found in ${config.modelsDir}`);
  }

  console.log(`Found ${modelFiles.length} models\n`);

  // Apply start/limit
  const startIdx = config.startIndex || 0;
  const limit = config.limit || modelFiles.length;
  const modelsToProcess = modelFiles.slice(startIdx, startIdx + limit);

  console.log(`Processing ${modelsToProcess.length} models (from index ${startIdx})\n`);

  // Setup Solana connection if not dry run
  let provider: anchor.Provider | null = null;
  let program: Program | null = null;
  let minter: ReturnType<typeof minterSdk.create> | null = null;

  if (!config.dryRun) {
    const connection = new Connection(config.rpcUrl || "https://api.devnet.solana.com");
    const keypairData = JSON.parse(fs.readFileSync(config.keypairPath, "utf-8"));
    const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const walletAdapter = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => {
        tx.partialSign(wallet);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((tx) => tx.partialSign(wallet));
        return txs;
      },
    };

    provider = new anchor.AnchorProvider(connection, walletAdapter as any, {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    // Load program
    const idl = minterSdk.idlJson;
    program = new anchor.Program(idl as any, provider);
    minter = minterSdk.create(provider, program);

    console.log(`✓ Connected to Solana`);
    console.log(`  Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`  Balance: ${await connection.getBalance(wallet.publicKey) / LAMPORTS_PER_SOL} SOL\n`);
  }

  // Process each model
  for (let i = 0; i < modelsToProcess.length; i++) {
    const modelPath = modelsToProcess[i];
    const modelName = path.basename(modelPath, path.extname(modelPath));
    const globalIndex = startIdx + i;

    try {
      // Upload files and create metadata
      const { modelUri, previewUri, metadataUri, metadata } = await processModel(
        modelPath,
        config,
        globalIndex
      );

      if (config.dryRun) {
        console.log(`   [DRY RUN] Would initialize collection for ${modelName}`);
        result.successful.push({
          modelName,
          modelPath,
          collectionIndex: -1,
          avatarDataPda: "DRY_RUN",
          metadataUri,
          modelUri,
          previewUri,
          signature: "DRY_RUN",
        });
        continue;
      }

      // Initialize on-chain collection
      console.log(`   Initializing on-chain collection...`);
      
      // Update metadata with creator
      metadata.properties.creators = [
        { address: provider!.publicKey!.toBase58(), share: 100 },
      ];

      const maxSupplyBn = new anchor.BN(config.maxSupply.toString());
      const mintFeeLamports = new anchor.BN(Math.round(config.mintFeeSol * LAMPORTS_PER_SOL));

      const { avatarDataPda, signature } = await minter!.initializeAvatar({
        ipfsHash: metadataUri,
        maxSupply: maxSupplyBn,
        mintingFeePerMint: mintFeeLamports,
      });

      console.log(`   ✓ Collection initialized!`);
      console.log(`     PDA: ${avatarDataPda.toBase58()}`);
      console.log(`     Tx: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      result.successful.push({
        modelName,
        modelPath,
        collectionIndex: globalIndex,
        avatarDataPda: avatarDataPda.toBase58(),
        metadataUri,
        modelUri,
        previewUri,
        signature,
      });

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));

    } catch (error: any) {
      console.error(`   ✗ Failed: ${error.message}`);
      result.failed.push({
        modelName,
        modelPath,
        error: error.message,
      });
    }
  }

  // Update summary
  result.summary.total = modelsToProcess.length;
  result.summary.success = result.successful.length;
  result.summary.failed = result.failed.length;

  console.log("\n" + "=".repeat(50));
  console.log("Batch mint complete!");
  console.log(`  Total: ${result.summary.total}`);
  console.log(`  Success: ${result.summary.success}`);
  console.log(`  Failed: ${result.summary.failed}`);
  console.log("=".repeat(50));

  return result;
}

// CLI entry point
if (import.meta.url === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  
  // Parse CLI arguments
  const getArg = (flag: string, defaultValue?: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : defaultValue;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  const config: BatchMintConfig = {
    modelsDir: getArg("--models-dir") || "./models",
    previewsDir: getArg("--previews-dir"),
    keypairPath: getArg("--keypair") || "~/.config/solana/id.json",
    rpcUrl: getArg("--rpc") || "https://api.devnet.solana.com",
    maxSupply: BigInt(getArg("--max-supply") || "100"),
    mintFeeSol: parseFloat(getArg("--mint-fee") || "0.001"),
    ipfsEndpoint: getArg("--ipfs") || "http://127.0.0.1:5001",
    metadataApiUrl: getArg("--api-url") || "http://localhost:3000",
    namePrefix: getArg("--name-prefix") || "Ekza Building",
    symbol: getArg("--symbol") || "EKZABLD",
    descriptionTemplate: getArg("--description") || "Everything Library Building #{index}: {name}",
    dryRun: hasFlag("--dry-run"),
    startIndex: parseInt(getArg("--start-index") || "0"),
    limit: getArg("--limit") ? parseInt(getArg("--limit")!) : undefined,
  };

  // Expand tilde in keypair path
  if (config.keypairPath.startsWith("~")) {
    config.keypairPath = config.keypairPath.replace("~", process.env.HOME || "/tmp");
  }

  batchMint(config)
    .then((result) => {
      // Save results to file
      const outputPath = getArg("--output") || "./batch-mint-results.json";
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\nResults saved to: ${outputPath}`);
      
      if (result.summary.failed > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
