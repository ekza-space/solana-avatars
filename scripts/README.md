# Batch NFT Minter

Scripts for batch minting NFT collections from 3D models with proper `asset_origin` metadata.

## Overview

These scripts help you deploy multiple NFT collections at once from a directory of 3D models (GLB files). Each model becomes its own collection with:

- Proper metadata including the Everything Library `asset_origin`
- IPFS hosting for models and previews
- On-chain Solana deployment via the Avatar NFT Minter program

## Files

- `batch-minter.ts` - Full-featured batch minter with SDK integration
- `batch-mint-standalone.ts` - Standalone script for IPFS upload and metadata generation
- `README.md` - This file

## Prerequisites

1. **IPFS Node** running locally:
   ```bash
   ipfs daemon
   # or via Docker
   docker run -d --name ipfs -p 5001:5001 -p 8080:8080 ipfs/kubo
   ```

2. **Solana Wallet** with devnet SOL:
   ```bash
   solana-keygen new -o ~/.config/solana/id.json
   solana airdrop 2 ~/.config/solana/id.json --url devnet
   ```

3. **App Running** - The Remix app must be running for the `/api/upload-metadata` endpoint:
   ```bash
   cd app && npm run dev
   ```

## Quick Start

### Step 1: Prepare Your Models

Place your `.glb` files in a directory:
```
/Users/ashrize/Assets/EverythingLibrary_Animals_002/nft_exports_all/
├── Building_001.glb
├── Building_002.glb
└── ...
```

Optional: Add preview images in a separate directory with matching names:
```
previews/
├── Building_001.png
├── Building_002.png
└── ...
```

### Step 2: Dry Run (Upload Only)

Test the upload process without blockchain transactions:

```bash
cd /Users/ashrize/.openclaw/workspace/solana-avatars

npx ts-node scripts/batch-mint-standalone.ts \
  --models-dir /Users/ashrize/Assets/EverythingLibrary_Animals_002/nft_exports_all \
  --keypair ~/.config/solana/id.json \
  --api-url http://localhost:3000 \
  --dry-run
```

### Step 3: Full Batch Mint

Deploy all collections to Solana devnet:

```bash
npx ts-node scripts/batch-mint-standalone.ts \
  --models-dir /Users/ashrize/Assets/EverythingLibrary_Animals_002/nft_exports_all \
  --keypair ~/.config/solana/id.json \
  --api-url http://localhost:3000 \
  --rpc-url https://api.devnet.solana.com \
  --max-supply 1000 \
  --mint-fee 0.001 \
  --name-prefix "Everything Building" \
  --symbol "EVBLD"
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--models-dir` | Directory containing .glb files | (required) |
| `--keypair` | Path to Solana wallet keypair | `~/.config/solana/id.json` |
| `--previews-dir` | Directory with preview images | (optional) |
| `--rpc-url` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `--api-url` | App API base URL | `http://localhost:3000` |
| `--max-supply` | Max supply per collection | `100` |
| `--mint-fee` | Mint fee in SOL | `0.001` |
| `--name-prefix` | Collection name prefix | `Ekza Building` |
| `--symbol` | Collection symbol | `EKZABLD` |
| `--start-index` | Start from specific index | `0` |
| `--limit` | Limit number of collections | (all) |
| `--dry-run` | Upload only, no blockchain | `false` |

## Asset Origin Metadata

The scripts automatically include the Everything Library - BUILDINGS asset origin:

```json
{
  "asset_origin": {
    "title": "Everything Library - BUILDINGS 0.1",
    "asset_type": "3d_model",
    "author": {
      "name": "David OReilly",
      "copyright": "Everything Library © David OReilly"
    },
    "source": {
      "name": "Everything Library",
      "url": "http://davidoreilly.com/library",
      "original_release_date": "2020-08-02"
    },
    "license": {
      "type": "CC_BY_4_0",
      "name": "Creative Commons Attribution 4.0 International",
      "url": "https://creativecommons.org/licenses/by/4.0/"
    },
    "modifications": {
      "is_modified": true,
      "modified_by": "Ekza Space",
      "notes": "Optimized, repackaged, and prepared for minting"
    },
    "commercial_terms": {
      "mint_fee_type": "service_fee",
      "mint_fee_note": "Fee covers minting, hosting, and platform services only",
      "exclusive_rights_transferred": false
    },
    "provenance": {
      "minted_by": "Ekza Space",
      "mint_context": "NFT mint via platform"
    }
  }
}
```

## Output

After running, a JSON file is created with all results:

```json
{
  "config": { ... },
  "results": [
    {
      "model": "Building_001",
      "success": true,
      "modelCid": "Qm...",
      "previewCid": "Qm...",
      "metadataCid": "Qm..."
    }
  ]
}
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   3D Models     │────▶│   IPFS       │────▶│   Solana    │
│   (.glb files)  │     │   (Upload)   │     │   (Mint)    │
└─────────────────┘     └──────────────┘     └─────────────┘
         │                       │                    │
         ▼                       ▼                    ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ Previews (.png) │────▶│  Metadata    │────▶│  Program    │
│ (optional)      │     │  (JSON)      │     │  PDA        │
└─────────────────┘     └──────────────┘     └─────────────┘
```

## Troubleshooting

### IPFS Connection Failed
- Ensure IPFS daemon is running: `ipfs daemon`
- Check port 5001 is accessible
- Verify CORS settings in IPFS config

### API Upload Failed
- Ensure the Remix app is running on the specified port
- Check that `/api/upload-metadata` endpoint is accessible
- Verify IPFS client configuration in `app/routes/api.upload-metadata.ts`

### Transaction Failed
- Check wallet has sufficient SOL for fees
- Verify you're on the correct network (devnet/mainnet)
- Check program ID is correct for your deployment

## Advanced Usage

### Resume Interrupted Batch

If a batch fails partway through, use `--start-index` to resume:

```bash
npx ts-node scripts/batch-mint-standalone.ts \
  --models-dir ./models \
  --keypair ~/.config/solana/id.json \
  --start-index 50 \
  --limit 25
```

### Custom Asset Origin

Edit the `DEFAULT_ASSET_ORIGIN` constant in the script to change metadata templates.

### Mainnet Deployment

Change the RPC URL and ensure your wallet has mainnet SOL:

```bash
npx ts-node scripts/batch-mint-standalone.ts \
  --rpc-url https://api.mainnet-beta.solana.com \
  --keypair ~/.config/solana/mainnet-id.json \
  ...
```

## License

Same as the solana-avatars project.
