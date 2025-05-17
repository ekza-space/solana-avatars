# Solana Avatars
The project is currently live on devnet at https://avatar.ekza.io — try it out and mint your own Web3 Avatar NFT

<img src="logo.jpg" alt="ekza" width="400"/> 


**Solana Avatars** is a smart contract that acts as a Web3 virtual world passport.  
Each user is assigned a **Program Derived Address (PDA)** which stores their avatar profile on-chain. Users can:

- Create, update, and delete their avatar account
- Attach metadata such as username, description and **3D avatars** using NFT Mint Pubkey
- Apply any **3D avatar NFT** to represent themselves in virtual reality environments

This allows for seamless identity integration across decentralized worlds.

[🎥 Watch the video demo](https://youtu.be/3O4QAiWlvlY)
---

## ✨ Features

- 🔐 On-chain user profiles (PDAs)
- 🎭 Avatar metadata: name, description, IPFS for 2D/3D models
- 🧬 NFT-based avatar customization
- 🌐 Designed for metaverse and Web3 platforms

---

## 🖼 Frontend Interface

We built a complete UI for interacting with the Solana Avatars smart contract.  
Through the interface, users can:

- Mint their 3D avatar NFTs directly from the frontend
- Configure their Web3 passport with custom usernames, descriptions, and NFT-linked avatars
- Dynamically switch or update their on-chain identity for use across decentralized applications

The UI is designed to simplify onboarding and customization in the Web3 realm.

The frontend is located in `./app` and built using the [Remix](https://remix.run/) framework.

Use [these models](https://drive.google.com/drive/u/1/folders/11oQ8pwVMV9inSVV9cGceI8xTusDxhPC3) to try out the interface, or feel free to find or create your own.

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

Feel free to contribute, open issues, or suggest features!
