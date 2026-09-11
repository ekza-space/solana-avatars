#!/usr/bin/env node
"use strict";
// Explicit devnet integration fixture. Never reads the operator's wallet,
// dotenv files, Pinata credentials, or a mainnet balance.
const fs = require("node:fs");
const path = require("node:path");
const anchor = require("@coral-xyz/anchor");
const minterSdk = require("../sdk/dist/src/minter.js").default;
const idl = require("../sdk/idl/avatar_nft_minter.json");
const GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const METADATA_HASH = "QmUjTMKVJ397oHd4vA4wkCdr1V5U7GBN1eWdKJJARkffqV";
const PRICE = 1_000_000;
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; }
const execute = args.includes("--execute");
const rpc = option("--rpc-url", "https://api.devnet.solana.com");
const stateDir = option("--state-dir", "");
const fundFrom = option("--fund-from", ""); // Explicitly authorized test-SOL donor; never a default wallet.
function json(file, value, mode = 0o600) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode }); }
const summary = { network: "solana-devnet", programId: idl.address, avatar: "Robert (CC0, Polygonal-Mind)", metadataUri: `ipfs://${METADATA_HASH}`, priceLamports: String(PRICE), maxSupply: 5, roles: ["ephemeral creator", "ephemeral buyer", "ephemeral non-owner"], executes: execute };
if (!execute) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }
if (!stateDir || !path.isAbsolute(stateDir)) throw new Error("--execute requires an absolute --state-dir for private, resumable test-wallet state.");
if (!new URL(rpc).hostname || new URL(rpc).username || new URL(rpc).password) throw new Error("Invalid RPC URL.");

async function main() {
  const connection = new anchor.web3.Connection(rpc, { commitment: "confirmed", confirmTransactionInitialTimeout: 45_000 });
  if (await connection.getGenesisHash() !== GENESIS) throw new Error("Refusing mutations: RPC is not Solana Devnet.");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const stateStat = fs.lstatSync(stateDir);
  if (!stateStat.isDirectory() || stateStat.isSymbolicLink() || (stateStat.mode & 0o077)) throw new Error("State directory must be private (0700) and not a symlink.");
  const privatePath = path.join(stateDir, "test-wallets.private.json");
  if (!fs.existsSync(privatePath)) {
    const roles = Object.fromEntries(["creator", "buyer", "nonOwner", "mint"].map((role) => [role, Array.from(anchor.web3.Keypair.generate().secretKey)]));
    fs.writeFileSync(privatePath, JSON.stringify(roles), { mode: 0o600, flag: "wx" });
  }
  const privateStat = fs.lstatSync(privatePath);
  if (privateStat.isSymbolicLink() || !privateStat.isFile() || (privateStat.mode & 0o077)) throw new Error("Unsafe private fixture file permissions.");
  const stored = JSON.parse(fs.readFileSync(privatePath, "utf8"));
  const keys = Object.fromEntries(Object.entries(stored).map(([role, bytes]) => [role, anchor.web3.Keypair.fromSecretKey(Uint8Array.from(bytes))]));
  const manifestPath = path.join(stateDir, "fixture.public.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { ...summary, createdAt: new Date().toISOString(), creator: keys.creator.publicKey.toBase58(), buyer: keys.buyer.publicKey.toBase58(), nonOwner: keys.nonOwner.publicKey.toBase58(), mint: keys.mint.publicKey.toBase58(), status: "funding" };
  const save = () => json(manifestPath, manifest);
  save();
  if (fundFrom) {
    const balances = await Promise.all(["creator", "buyer"].map((role) => connection.getBalance(keys[role].publicKey)));
    const transfers = ["creator", "buyer"].flatMap((role, index) => balances[index] < 30_000_000 ? [{ role, lamports: 30_000_000 - balances[index] }] : []);
    if (transfers.length) {
      // Genesis was verified above, before accessing any explicitly supplied key.
      const donor = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(fundFrom, "utf8"))));
      const transaction = new anchor.web3.Transaction();
      for (const { role, lamports } of transfers) transaction.add(anchor.web3.SystemProgram.transfer({ fromPubkey: donor.publicKey, toPubkey: keys[role].publicKey, lamports }));
      const signature = await anchor.web3.sendAndConfirmTransaction(connection, transaction, [donor], { commitment: "confirmed" });
      manifest.funding = { signature, totalTestLamports: transfers.reduce((sum, item) => sum + item.lamports, 0) }; save();
      console.log(JSON.stringify({ status: "funded-test-wallets", signature, testLamports: manifest.funding.totalTestLamports }));
    }
  }
  for (const role of ["creator", "buyer"]) {
    const key = keys[role].publicKey;
    if (await connection.getBalance(key) >= 30_000_000) continue;
    try {
      const signature = await connection.requestAirdrop(key, 100_000_000);
      await connection.confirmTransaction(signature, "confirmed");
    } catch {
      manifest.status = "requires-devnet-funding"; save();
      console.log(JSON.stringify({ status: manifest.status, role, address: key.toBase58(), minimumTestSol: 0.03, publicManifest: manifestPath }));
      process.exitCode = 2; return;
    }
  }
  const makeClient = (role) => {
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keys[role]), { commitment: "confirmed", preflightCommitment: "confirmed" });
    return minterSdk.create(provider, new anchor.Program(idl, provider));
  };
  const creatorClient = makeClient("creator"), buyerClient = makeClient("buyer");
  if (!manifest.avatarDataPda) {
    const result = await creatorClient.initializeAvatar({ ipfsHash: METADATA_HASH, maxSupply: new anchor.BN(5), mintingFeePerMint: new anchor.BN(PRICE) });
    const account = await creatorClient.getAvatarData(result.avatarDataPda);
    manifest.avatarDataPda = result.avatarDataPda.toBase58(); manifest.avatarDataIndex = Number(account.index.toString());
    manifest.avatarId = `solana:devnet:avatar-data:${manifest.avatarDataPda}`;
    manifest.initializeSignature = result.signature; manifest.status = "published"; save();
  }
  if (!manifest.purchaseSignature) {
    if (await connection.getAccountInfo(keys.mint.publicKey)) throw new Error("Mint already exists but its receipt is missing. Recover transaction history before retrying.");
    const [escrow] = buyerClient.getEscrowPda(manifest.avatarDataIndex);
    manifest.escrowBeforeLamports = await connection.getBalance(escrow); save();
    const result = await buyerClient.mintNft({ index: manifest.avatarDataIndex, name: "Ekza Robert", symbol: "EKZAAV", uri: `ipfs://${METADATA_HASH}`, mintKeypair: keys.mint });
    manifest.purchaseSignature = result.signature; manifest.tokenAccount = result.tokenAccountPk.toBase58();
    manifest.escrowAfterLamports = await connection.getBalance(escrow);
    manifest.creatorPaymentLamports = String(manifest.escrowAfterLamports - manifest.escrowBeforeLamports);
    manifest.status = "purchased"; save();
  }
  const template = await creatorClient.getAvatarData(new anchor.web3.PublicKey(manifest.avatarDataPda));
  const account = await connection.getParsedAccountInfo(keys.mint.publicKey);
  const mintInfo = account.value?.data?.parsed?.info;
  const ownerTokens = await connection.getParsedTokenAccountsByOwner(keys.buyer.publicKey, { mint: keys.mint.publicKey });
  const owns = ownerTokens.value.some((entry) => entry.account.data.parsed.info.tokenAmount.amount === "1");
  if (template.creator.toBase58() !== manifest.creator || template.mintingFeePerMint.toString() !== String(PRICE) || manifest.creatorPaymentLamports !== String(PRICE) || !owns || mintInfo?.supply !== "1" || mintInfo?.mintAuthority !== null || mintInfo?.freezeAuthority !== null) throw new Error("Devnet purchase postconditions failed. Inspect public manifest and transactions.");
  manifest.status = "verified-on-chain"; manifest.verifiedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ ...manifest, publicManifest: manifestPath }, null, 2));
}
main().catch((error) => { console.error(`Devnet proof failed: ${error.message}`); process.exitCode = 1; });
