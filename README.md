# Solana Avatars

**Solana Avatars** is a decentralized identity system for the metaverse.  
[🚀 Try it live on Devnet](https://avatar.ekza.io) — mint your own 3D Web3 avatar NFT and explore!

<img src="./app/public/logo.jpg" alt="ekza" width="400"/>

---

## 🧠 Overview

Solana Avatars enables users to create persistent, customizable identities for use across decentralized applications and virtual worlds. It combines two core smart contracts to power a flexible, user-centric avatar system:

- 🪪 **Profile Contract** — Acts as your Web3 passport, storing identity data such as usernames, bios, and chosen avatar NFTs on-chain via PDAs (Program Derived Addresses).
- 🛠 **Avatar Minter Contract** — Allows creators to deploy NFT avatar collections with configurable fees and total supply, enabling others to mint and use them in metaverses.

Creators earn rewards from minting fees (UI for claiming is coming soon).

---

## ⚙️ How It Works

1. **Create Your Profile** — Set up your Web3 passport with a username, description, and linked avatar NFT.
2. **Deploy or Mint Avatars** — Use the Minter UI to publish collections or mint from existing ones.
3. **Explore the Metaverse** — Represent yourself anywhere in the decentralized world using your 3D avatar.

---

## ✨ Features

- 🔐 Store on-chain user identities with Program Derived Addresses (PDAs)
- 🎭 Attach metadata: usernames, descriptions, and IPFS links to 2D/3D avatars
- 🧬 Customize avatars using NFT ownership
- 🌐 Seamlessly integrate identity across Web3 and metaverse platforms

---

## 🖼 Frontend Interface

We built a full-featured UI using [Remix](https://remix.run/) located in `./app`. The interface allows users to:

- Mint their 3D avatar NFTs directly from the browser
- Create and update their Web3 profile (username, bio, avatar NFT)
- Dynamically manage and switch on-chain identities
- Deploy their own NFT avatar collections
- Set mint price and supply
- Mint avatars via UI for personal use

This intuitive interface lowers the barrier for both users and creators to participate in Web3 identity creation.

> Try it with [these sample models](https://drive.google.com/drive/u/1/folders/11oQ8pwVMV9inSVV9cGceI8xTusDxhPC3) or use your own!

---

## 🧱 Smart Contracts

- `user_profile`: Stores user data and links to avatar NFTs
- `avatar_nft_minter`: Enables publishing and minting of NFT-based avatars

---

## 🔧 Commands

### Switch between networks

```sh
# Localnet
solana config set --url http://127.0.0.1:8899

# Devnet
solana config set --url https://api.devnet.solana.com
```

### Generate and use a custom keypair for deployment

```sh
solana-keygen new --outfile target-deploy-keypair.json
solana-keygen pubkey target-deploy-keypair.json
```

---

## 📬 Feedback

We welcome issues, contributions, and feature suggestions. Let's build the future of identity together!
