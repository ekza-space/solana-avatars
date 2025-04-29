# Solana Avatars
A program for managing 3D and 2D user avatars. Each user can create, update, and delete their avatar account, which includes metadata like username, description, and IPFS hashes for 2D and 3D avatar representations.

## Commands

```sh
# Switch bwtween networks
solana config set --url http://127.0.0.1:8899
solana config set --url https://api.devnet.solana.com
```

```sh
# Preparing to Deploy with a Custom Configured Keypair
solana-keygen new --outfile target-deploy-keypair.json
solana-keygen pubkey target-deploy-keypair.json
```