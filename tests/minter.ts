import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import type { AvatarNftMinterIDL } from "../sdk/src/minter";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAccount as getTokenAccount } from "@solana/spl-token";
import { expect } from "chai";

import minterSdk from "../sdk/src/minter";

import * as fs from "fs";
import { KEYPAIR_1, KEYPAIR_2 } from "./constants";


/* --------------------------------------------------------------------- */
/* Helpers                                                               */
/* --------------------------------------------------------------------- */

// Convenience to confirm tx on any cluster
async function confirmSig(connection: anchor.web3.Connection, sig: string) {
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
    });
}

/* --------------------------------------------------------------------- */
/* Test suite                                                             */
/* --------------------------------------------------------------------- */

describe("avatar‑nft‑minter (SDK v2)", () => {
    /* ---------- Connection / basic provider ---------- */
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const program = anchor.workspace.avatarNftMinter as Program<AvatarNftMinterIDL>;

    const connection = provider.connection;


    /* ---------- Wallet selection ---------- */
    const creatorKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_1, "utf-8")))
    );
    const creatorWallet = new anchor.Wallet(creatorKeypair);

    const minterKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_2, "utf-8")))
    );

    /* ---------- Providers & Programs ---------- */
    const providerCreator = new anchor.AnchorProvider(
        connection,
        creatorWallet,
        anchor.AnchorProvider.defaultOptions()
    );

    const providerMinter = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(minterKeypair),
        anchor.AnchorProvider.defaultOptions()
    );

    /* ---------- Programs ---------- */
    // Re-create Program instances that are bound to the correct wallet/provider,
    // otherwise the transaction is sent by the wrong signer and Anchor throws
    // "Missing signature" errors.
    const baseProgram = anchor.workspace.avatarNftMinter as Program<AvatarNftMinterIDL>;
    const idl = baseProgram.idl as AvatarNftMinterIDL;
    const programId = baseProgram.programId;

    const programCreator = new anchor.Program<AvatarNftMinterIDL>(idl, providerCreator);
    const programMinter = new anchor.Program<AvatarNftMinterIDL>(idl, providerMinter);

    /* ---------- SDK clients ---------- */
    const creatorClient = minterSdk.create(providerCreator, programCreator);
    const minterClient = minterSdk.create(providerMinter, programMinter);

    /* ---------- Shared state ---------- */
    const testIpfsHash = "Qm" + [...Array(44)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const testIpfsHash2 = "Qm" + [...Array(44)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const testIpfsHash3 = "Qm" + [...Array(44)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");

    const maxSupply = new BN(100);
    const mintingFeePerMint = new BN(0.01 * LAMPORTS_PER_SOL);
    const zeroMintingFee = new BN(0);

    let avatarDataPda!: PublicKey;
    let avatarDataPdaZeroFee!: PublicKey;
    let escrowPda!: PublicKey;
    let escrowPdaZero!: PublicKey;
    let avatarIndex!: BN;
    let avatarIndexZeroFee!: BN;

    /* ------------------------------------------------------------------ */
    /* Creation & validation                                              */
    /* ------------------------------------------------------------------ */

    it("Initializes AvatarData correctly", async () => {
        const { avatarDataPda: pda } = await creatorClient.initializeAvatar({
            ipfsHash: testIpfsHash,
            maxSupply,
            mintingFeePerMint,
        });
        avatarDataPda = pda;

        const data = await creatorClient.getAvatarData(avatarDataPda);
        expect(data).to.not.be.null;
        avatarIndex = data!.index;
        [escrowPda] = creatorClient.getEscrowPda(avatarIndex.toNumber());
    });

    it("Initializes a second AvatarData (zero fee)", async () => {
        const { avatarDataPda: pda } = await creatorClient.initializeAvatar({
            ipfsHash: testIpfsHash2,
            maxSupply,
            mintingFeePerMint: zeroMintingFee,
        });
        avatarDataPdaZeroFee = pda;

        const data = await creatorClient.getAvatarData(avatarDataPdaZeroFee);
        avatarIndexZeroFee = data!.index;
        [escrowPdaZero] = creatorClient.getEscrowPda(avatarIndexZeroFee.toNumber());
    });

    it("Fails to initialize AvatarData with invalid IPFS hash", async () => {
        try {
            await creatorClient.initializeAvatar({
                ipfsHash: "Q".repeat(65),
                maxSupply,
                mintingFeePerMint,
            });
            expect.fail("should throw");
        } catch (e: any) {
            expect(e.message).to.include("InvalidIpfsHashLength");
        }
    });

    /* ------------------------------------------------------------------ */
    /* Fee‑based avatar flow                                              */
    /* ------------------------------------------------------------------ */

    describe("Avatar with fee", () => {
        const nftName = "My Avatar NFT";
        const nftSymbol = "AVTR";
        const nftUri = `https://arweave.net/${testIpfsHash}/metadata.json`;

        let firstMintPk: PublicKey;

        it("Mints an NFT and pays fee", async () => {
            const { tokenAccountPk, mintPk } = await minterClient.mintNft({
                index: avatarIndex.toNumber(),
                name: nftName,
                symbol: nftSymbol,
                uri: nftUri,
            });
            firstMintPk = mintPk;

            // supply & fees
            const data = await creatorClient.getAvatarData(avatarDataPda);
            expect(data!.currentSupply.eqn(1)).to.be.true;
            expect(data!.totalUnclaimedFees.eq(mintingFeePerMint)).to.be.true;

            // token ownership
            const tokenAcc = await getTokenAccount(connection, tokenAccountPk);
            expect(tokenAcc.amount).to.equal(BigInt(1));
            expect(tokenAcc.owner.equals(minterKeypair.publicKey)).to.be.true;
        });

        it("Mints a second NFT and accumulates fees", async () => {
            // capture current state
            const dataBefore = await creatorClient.getAvatarData(avatarDataPda);
            expect(dataBefore).to.not.be.null;
            const prevSupply = dataBefore!.currentSupply;
            const prevFees   = dataBefore!.totalUnclaimedFees;

            // second mint
            const { tokenAccountPk } = await minterClient.mintNft({
                index: avatarIndex.toNumber(),
                name: "Second Avatar NFT",
                symbol: "AVT2",
                uri: `https://arweave.net/${testIpfsHash}/metadata2.json`,
            });

            // state after mint
            const dataAfter = await creatorClient.getAvatarData(avatarDataPda);
            expect(dataAfter!.currentSupply.eq(prevSupply.add(new BN(1)))).to.be.true;
            expect(dataAfter!.totalUnclaimedFees.eq(prevFees.add(mintingFeePerMint))).to.be.true;

            // token ownership sanity‑check
            const tokenAcc = await getTokenAccount(connection, tokenAccountPk);
            expect(tokenAcc.owner.equals(minterKeypair.publicKey)).to.be.true;
        });

        it("Creator claims accumulated fees", async () => {
            await creatorClient.claimFee({ index: avatarIndex.toNumber() });
            const data = await creatorClient.getAvatarData(avatarDataPda);
            expect(data!.totalUnclaimedFees.eqn(0)).to.be.true;
        });

        it("Fails to claim fee when no fees are available", async () => {
            try {
                await creatorClient.claimFee({ index: avatarIndex.toNumber() });
                expect.fail("should throw");
            } catch (e: any) {
                expect(e.message).to.include("NoFeesToClaim");
            }
        });

        it("Fails to claim fee if unauthorized", async () => {
            // use the minter wallet (not the creator) as the unauthorized caller
            const wrongClient = minterClient;

            // add some fees again
            await minterClient.mintNft({
                index: avatarIndex.toNumber(),
                name: "Fee build",
                symbol: "FEE",
                uri: "uri",
            });

            try {
                await wrongClient.claimFee({ index: avatarIndex.toNumber() });
                expect.fail("should throw");
            } catch (e: any) {
                expect(e.message).to.include("Unauthorized");
            }

            // creator can still claim
            await creatorClient.claimFee({ index: avatarIndex.toNumber() });
            const data = await creatorClient.getAvatarData(avatarDataPda);
            expect(data!.totalUnclaimedFees.eqn(0)).to.be.true;
        });
    });

    /* ------------------------------------------------------------------ */
    /* Zero‑fee avatar flow                                               */
    /* ------------------------------------------------------------------ */

    describe("Avatar with zero fee", () => {
        const nftName = "Zero Fee NFT";
        const nftSymbol = "ZFTR";
        const nftUri = `https://arweave.net/${testIpfsHash2}/metadata.json`;

        it("Mints without charging fee", async () => {
            await minterClient.mintNft({
                index: avatarIndexZeroFee.toNumber(),
                name: nftName,
                symbol: nftSymbol,
                uri: nftUri,
            });

            const data = await creatorClient.getAvatarData(avatarDataPdaZeroFee);
            expect(data!.totalUnclaimedFees.eqn(0)).to.be.true;
        });

        it("Fails to claim when no fees collected", async () => {
            try {
                await creatorClient.claimFee({ index: avatarIndexZeroFee.toNumber() });
                expect.fail("should throw");
            } catch (e: any) {
                expect(e.message).to.include("NoFeesToClaim");
            }
        });
    });

    /* ------------------------------------------------------------------ */
    /* Max‑supply guard                                                   */
    /* ------------------------------------------------------------------ */

    it("Fails to mint when max supply reached", async () => {
        const smallSupply = new BN(1);
        const { avatarDataPda: pda } = await creatorClient.initializeAvatar({
            ipfsHash: testIpfsHash3,
            maxSupply: smallSupply,
            mintingFeePerMint,
        });
        const data = await creatorClient.getAvatarData(pda);
        const idx = data!.index;

        // first mint succeeds
        await minterClient.mintNft({
            index: idx.toNumber(),
            name: "First",
            symbol: "ONE",
            uri: "uri1",
        });

        // second mint should fail
        try {
            await minterClient.mintNft({
                index: idx.toNumber(),
                name: "Second",
                symbol: "TWO",
                uri: "uri2",
            });
            expect.fail("should throw");
        } catch (e: any) {
            expect(e.message).to.include("MaxSupplyReached");
        }
    });

    /* ------------------------------------------------------------------ */
    /* Non‑existent PDA fetch                                             */
    /* ------------------------------------------------------------------ */

    it("Returns null for non‑existent AvatarData", async () => {
        const bogus = Keypair.generate().publicKey;
        const data = await creatorClient.getAvatarData(bogus);
        expect(data).to.be.null;
    });

    it.skip("Registry helpers return consistent snapshot", async () => {
        // Fetch the global registry
        const { registry } = await creatorClient.getAvatarRegistry();
        console.log("Fetched registry:", registry);
        expect(registry).to.not.be.null;

        // Fetch all AvatarData accounts via helper
        const all = await creatorClient.getAllAvatarData();
        console.log("Total avatar data entries:", all.length);

        // The helper should return exactly `nextIndex` entries
        expect(all.length).to.equal(registry!.nextIndex.toNumber());

        // Each returned entry's `index` field should match its position
        all.forEach(({ index, data }) => {
            console.log(`Checking entry at index ${index}:`, data.index.toNumber());
            expect(data.index.eqn(index)).to.be.true;
        });

        // Also verify getAvatarDataByIndex returns the same data
        for (let i = 0; i < all.length; i++) {
            const viaIndex = await creatorClient.getAvatarDataByIndex(i);
            console.log(viaIndex)
            expect(viaIndex).to.not.be.null;
            expect(viaIndex!.index.toNumber()).to.equal(i);
            expect(viaIndex!.ipfsHash).to.equal(all[i].data.ipfsHash);
        }
    });
});