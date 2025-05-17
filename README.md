# Solana Avatars

**Solana Avatars** is a smart contract that acts as a Web3 virtual world passport.  
Each user is assigned a **Program Derived Address (PDA)** which stores their avatar profile on-chain. Users can:

- Create, update, and delete their avatar account
- Attach metadata such as username, description
- Link **2D and 3D avatars** using IPFS hashes
- Apply any **3D avatar NFT** to represent themselves in virtual reality environments

This allows for seamless identity integration across decentralized worlds.

---

## ✨ Features

- 🔐 On-chain user profiles (PDAs)
- 🎭 Avatar metadata: name, description, IPFS for 2D/3D models
- 🧬 NFT-based avatar customization
- 🌐 Designed for metaverse and Web3 platforms

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

## 📁 Directory Overview

```plaintext
/programs/avatars/     # Anchor smart contract for avatar management
/tests/avatars.ts      # Integration tests for on-chain functionality
/target/               # Build artifacts and deployment keypairs
```

---

## 🚀 Coming Soon

- 🧩 Avatar minting UI
- 🎮 VR/3D integration examples
- 📦 SDK for integrating avatar data in Web3 games and platforms

---

## 📬 Feedback

Feel free to contribute, open issues, or suggest features!