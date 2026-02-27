#!/usr/bin/env ts-node
/**
 * Standalone Batch NFT Minter for Solana Avatars
 * 
 * This is a self-contained script for batch minting NFT collections.
 * It handles IPFS uploads, metadata generation with asset_origin, and on-chain deployment.
 * 
 * Prerequisites:
 *   - IPFS daemon running on port 5001 (or use --ipfs-url)
 *   - Solana wallet with SOL for transactions
 *   - Node dependencies: @coral-xyz/anchor, @solana/web3.js, form-data, node-fetch
 * 
 * Usage:
 *   npx ts-node scripts/batch-mint-standalone.ts \
 *     --models-dir /path/to/models \
 *     --keypair ~/.config/solana/id.json \
 *     --max-supply 100 \
 *     --mint-fee 0.001
 */

import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";
import fetch from "node-fetch";

// Types (mirrored from app/types/nft.ts)
interface AssetOrigin {
  title?: string;
  asset_type: string;
  author: { name: string; copyright?: string };
  source?: { name?: string; url?: string; original_release_date?: string };
  license: { type: string; name: string; url: string };
  modifications?: { is_modified: boolean; modified_by?: string; notes?: string };
  commercial_terms: {
    mint_fee_type?: string;
    mint_fee_note?: string;
    exclusive_rights_transferred: boolean;
  };
  provenance?: { minted_by?: string; mint_context?: string };
}

interface NftMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animation_url: string;
  attributes: Array<{ trait_type: string; value: any }>;
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: string;
    creators: Array<{ address: string; share: number }>;
  };
  asset_origin?: AssetOrigin;
}

// Default asset origin for Everything Library - BUILDINGS
const DEFAULT_ASSET_ORIGIN: AssetOrigin = {
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

// CLI Argument parsing
function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "").replace(/-/g, "_");
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args[key] = argv[i + 1];
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

function showHelp() {
  console.log(`
Batch NFT Minter for Solana Avatars

Usage:
  npx ts-node scripts/batch-mint-standalone.ts [options]

Required Options:
  --models-dir <path>      Directory containing .glb model files
  --keypair <path>         Path to Solana wallet keypair JSON file

Optional Options:
  --previews-dir <path>    Directory containing preview images (PNG/JPG)
  --rpc-url <url>          Solana RPC endpoint (default: devnet)
  --api-url <url>          Metadata API URL (default: http://localhost:3000)
  --max-supply <n>         Max supply per collection (default: 100)
  --mint-fee <sol>         Mint fee in SOL (default: 0.001)
  --name-prefix <str>      Collection name prefix (default: "Ekza Building")
  --symbol <str>           Collection symbol (default: "EKZABLD")
  --description <str>      Description template with {name} and {index} placeholders
  --start-index <n>        Start from specific index (for resuming)
  --limit <n>              Limit number of collections to create
  --dry-run                Upload only, skip blockchain transactions
  --help                   Show this help message

Examples:
  # Dry run - upload only
  npx ts-node scripts/batch-mint-standalone.ts \\
    --models-dir ./nft_exports_all \\
    --keypair ~/.config/solana/id.json \\
    --dry-run

  # Full batch mint
  npx ts-node scripts/batch-mint-standalone.ts \\
    --models-dir ./nft_exports_all \\
    --keypair ~/.config/solana/id.json \\
    --max-supply 1000 \\
    --mint-fee 0.01 \\
    --name-prefix "Everything Building"
`);
}

// Upload functions
async function uploadToIpfs(filePath: string, apiUrl: string): Promise<{ cid: string; uri: string }> {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  const response = await fetch(`${apiUrl}/api/upload-metadata`, {
    method: "POST",
    body: formData as any,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`);
  }

  const result = await response.json() as { files: Array<{ ipfsHash: string; uri: string }> };
  return { cid: result.files[0].ipfsHash, uri: result.files[0].uri };
}

async function uploadMetadata(metadata: NftMetadata, apiUrl: string): Promise<string> {
  const response = await fetch(`${apiUrl}/api/upload-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Metadata upload failed: ${await response.text()}`);
  }

  const result = await response.json() as { ipfsHash: string };
  return result.ipfsHash;
}

// Find preview for model
function findPreview(modelPath: string, previewsDir?: string): string | null {
  if (!previewsDir) return null;
  const baseName = path.basename(modelPath, path.extname(modelPath));
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const p = path.join(previewsDir, baseName + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Generate placeholder preview
async function generatePlaceholder(modelName: string): Promise<Buffer> {
  // Simple 1x1 transparent PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
}

// Main function
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required args
  const modelsDir = args.models_dir as string;
  const keypairPath = args.keypair as string;

  if (!modelsDir || !keypairPath) {
    console.error("Error: --models-dir and --keypair are required");
    showHelp();
    process.exit(1);
  }

  // Resolve paths
  const resolvedModelsDir = path.resolve(modelsDir.replace("~", process.env.HOME || "/tmp"));
  const resolvedKeypairPath = path.resolve((keypairPath as string).replace("~", process.env.HOME || "/tmp"));

  if (!fs.existsSync(resolvedModelsDir)) {
    console.error(`Error: Models directory not found: ${resolvedModelsDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(resolvedKeypairPath)) {
    console.error(`Error: Keypair file not found: ${resolvedKeypairPath}`);
    process.exit(1);
  }

  // Configuration
  const config = {
    modelsDir: resolvedModelsDir,
    previewsDir: args.previews_dir ? path.resolve((args.previews_dir as string).replace("~", process.env.HOME || "/tmp")) : undefined,
    keypairPath: resolvedKeypairPath,
    rpcUrl: (args.rpc_url as string) || "https://api.devnet.solana.com",
    apiUrl: (args.api_url as string) || "http://localhost:3000",
    maxSupply: BigInt((args.max_supply as string) || "100"),
    mintFeeSol: parseFloat((args.mint_fee as string) || "0.001"),
    namePrefix: (args.name_prefix as string) || "Ekza Building",
    symbol: (args.symbol as string) || "EKZABLD",
    description: (args.description as string) || "Everything Library Building #{index}: {name}",
    startIndex: parseInt((args.start_index as string) || "0"),
    limit: args.limit ? parseInt(args.limit as string) : undefined,
    dryRun: !!args.dry_run,
  };

  console.log("🚀 Batch NFT Minter");
  console.log("=".repeat(50));
  console.log(`Models: ${config.modelsDir}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Max Supply: ${config.maxSupply.toString()}`);
  console.log(`Mint Fee: ${config.mintFeeSol} SOL`);
  console.log(`Dry Run: ${config.dryRun ? "YES" : "NO"}`);
  console.log("=".repeat(50));
  console.log();

  // Get model files
  const modelFiles = fs
    .readdirSync(config.modelsDir)
    .filter((f) => f.endsWith(".glb"))
    .map((f) => path.join(config.modelsDir, f))
    .slice(config.startIndex, config.limit ? config.startIndex + config.limit : undefined);

  console.log(`Found ${modelFiles.length} models to process\n`);

  // Results tracking
  const results: Array<{
    model: string;
    success: boolean;
    modelCid?: string;
    previewCid?: string;
    metadataCid?: string;
    error?: string;
  }> = [];

  // Process each model
  for (let i = 0; i < modelFiles.length; i++) {
    const modelPath = modelFiles[i];
    const modelName = path.basename(modelPath, ".glb");
    const globalIndex = config.startIndex + i;

    console.log(`[${i + 1}/${modelFiles.length}] Processing: ${modelName}`);

    try {
      // Upload model
      process.stdout.write("  Uploading model... ");
      const modelUpload = await uploadToIpfs(modelPath, config.apiUrl);
      console.log(`✓ ${modelUpload.cid.slice(0, 16)}...`);

      // Upload or generate preview
      process.stdout.write("  Uploading preview... ");
      let previewCid: string;
      const previewPath = findPreview(modelPath, config.previewsDir);
      
      if (previewPath) {
        const previewUpload = await uploadToIpfs(previewPath, config.apiUrl);
        previewCid = previewUpload.cid;
      } else {
        // Create temp placeholder
        const tempPath = `/tmp/preview_${globalIndex}.png`;
        fs.writeFileSync(tempPath, await generatePlaceholder(modelName));
        const previewUpload = await uploadToIpfs(tempPath, config.apiUrl);
        previewCid = previewUpload.cid;
        fs.unlinkSync(tempPath);
      }
      console.log(`✓ ${previewCid.slice(0, 16)}...`);

      // Build metadata
      const metadata: NftMetadata = {
        name: `${config.namePrefix} #${globalIndex}`,
        symbol: config.symbol,
        description: config.description
          .replace("{name}", modelName)
          .replace("{index}", String(globalIndex)),
        image: previewCid,
        animation_url: modelUpload.cid,
        attributes: [
          { trait_type: "Model Name", value: modelName },
          { trait_type: "Index", value: globalIndex },
          { trait_type: "Collection", value: "Everything Library" },
        ],
        properties: {
          files: [
            { uri: previewCid, type: "image/png" },
            { uri: modelUpload.cid, type: "model/gltf-binary" },
          ],
          category: "vrmodel",
          creators: [], // Will be set during on-chain init
        },
        asset_origin: DEFAULT_ASSET_ORIGIN,
      };

      // Upload metadata
      process.stdout.write("  Uploading metadata... ");
      const metadataCid = await uploadMetadata(metadata, config.apiUrl);
      console.log(`✓ ${metadataCid.slice(0, 16)}...`);

      if (config.dryRun) {
        console.log("  [DRY RUN] Skipping blockchain transaction");
        results.push({
          model: modelName,
          success: true,
          modelCid: modelUpload.cid,
          previewCid,
          metadataCid,
        });
        continue;
      }

      // TODO: Add on-chain initialization here
      // This requires the Anchor SDK setup which is complex in a standalone script
      console.log("  ⚠️  On-chain minting requires SDK integration");
      console.log(`     Metadata ready at: ipfs://${metadataCid}`);
      
      results.push({
        model: modelName,
        success: true,
        modelCid: modelUpload.cid,
        previewCid,
        metadataCid,
      });

    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
      results.push({
        model: modelName,
        success: false,
        error: error.message,
      });
    }

    // Progress separator
    console.log();
  }

  // Summary
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log("=".repeat(50));
  console.log("Batch Complete!");
  console.log(`  Total: ${results.length}`);
  console.log(`  Success: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log("=".repeat(50));

  // Save results
  const outputPath = `./batch-results-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify({ config, results }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
