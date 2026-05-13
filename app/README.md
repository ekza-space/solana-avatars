# Welcome to Ekza Avatars UI

**Ekza Avatars UI** is the main interface for managing 2D/3D avatars in the Ekza metaverse.  
Users can connect their wallet, set up their profile, and upload avatar NFTs that represent them in virtual worlds.

---

## 🚀 Features

- Web3 wallet connection (Phantom, Solflare, etc.)
- Create and update avatar profiles
- Link 2D/3D models stored on IPFS
- Live preview in 3D scene

---

## 🛠️ Getting Started

Make sure you have Node.js and Yarn installed, then run:

```sh
yarn install
yarn dev
```

Visit [http://localhost:7102](http://localhost:7102) in your browser to start using the UI.

---

## 📦 Tech Stack

- [Remix](https://remix.run)
- [React](https://react.dev)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [Three.js](https://threejs.org) for 3D previews

---

## 🌐 Network

This UI supports three environments: **localnet**, **devnet**, and **mainnet**.
You can switch the active network from the header (top-right dropdown) and the
selection is persisted in the browser.

You can also set defaults and RPC overrides through env vars:

```sh
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_LOCALNET_RPC=http://127.0.0.1:8899
VITE_SOLANA_DEVNET_RPC=https://api.devnet.solana.com
VITE_SOLANA_MAINNET_RPC=https://api.mainnet-beta.solana.com
VITE_IPFS_GATEWAY_LOCALNET=/api/ipfs/
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/
```

---

## 💡 Tip

To see your 3D avatar in the scene, make sure your NFT metadata includes a valid GLB on IPFS.

---

## 📬 Feedback

Open an issue or suggestion anytime — contributions are welcome!
