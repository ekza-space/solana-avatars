import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { getAccount as getTokenAccount, getMint } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import minterSdk, { type AvatarNftMinterIDL } from "../sdk/src/minter";
import stellarIdl from "../../solana-stellar/target/idl/solana_stellar.json";

const STELLAR_PROGRAM_ID = new PublicKey(
  "3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA"
);

describe("stellar lineage equal mint integration", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const owner = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const minterProgram = anchor.workspace
    .avatarNftMinter as Program<AvatarNftMinterIDL>;
  const stellarProgram = new anchor.Program(
    stellarIdl as anchor.Idl,
    provider
  ) as Program;
  const stellarAccounts = (stellarProgram as any).account;

  const contributor = Keypair.generate();
  const branchContributor = Keypair.generate();
  const buyer = Keypair.generate();

  const toLeBytes = (value: number) =>
    new BN(value).toArrayLike(Buffer, "le", 8);

  const universePda = (index: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("universe"), owner.publicKey.toBuffer(), toLeBytes(index)],
      STELLAR_PROGRAM_ID
    )[0];

  const assetPda = (universe: PublicKey, index: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("asset"), universe.toBuffer(), toLeBytes(index)],
      STELLAR_PROGRAM_ID
    )[0];

  const linkPda = (child: PublicKey, parent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("link"), child.toBuffer(), parent.toBuffer()],
      STELLAR_PROGRAM_ID
    )[0];

  const releasePda = (universe: PublicKey, index: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("release"), universe.toBuffer(), toLeBytes(index)],
      STELLAR_PROGRAM_ID
    )[0];

  const vaultPda = (release: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("release_vault"), release.toBuffer()],
      STELLAR_PROGRAM_ID
    )[0];

  const sharePda = (release: PublicKey, contributorPk: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("share"), release.toBuffer(), contributorPk.toBuffer()],
      STELLAR_PROGRAM_ID
    )[0];

  async function confirmSig(signature: string) {
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...latest,
    });
  }

  async function airdrop(publicKey: PublicKey, lamports: number) {
    await confirmSig(await connection.requestAirdrop(publicKey, lamports));
  }

  async function createAsset(args: {
    universe: PublicKey;
    index: number;
    asset: PublicKey;
    creator: Keypair | anchor.Wallet;
    kind: any;
    subtype: any;
    metadataHash: string;
    previewHash: string;
  }) {
    const creatorPublicKey = args.creator.publicKey;
    const signers = args.creator instanceof Keypair ? [args.creator] : [];

    await stellarProgram.methods
      .createAsset(
        new BN(args.index),
        args.kind,
        args.subtype,
        args.metadataHash,
        args.previewHash
      )
      .accountsStrict({
        universe: args.universe,
        asset: args.asset,
        creator: creatorPublicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers(signers)
      .rpc();
  }

  async function submitAndApproveAsset(args: {
    universe: PublicKey;
    asset: PublicKey;
    creator: Keypair | anchor.Wallet;
  }) {
    const creatorPublicKey = args.creator.publicKey;
    const signers = args.creator instanceof Keypair ? [args.creator] : [];

    await stellarProgram.methods
      .submitAsset()
      .accountsStrict({ asset: args.asset, creator: creatorPublicKey })
      .signers(signers)
      .rpc();

    await stellarProgram.methods
      .approveAsset()
      .accountsStrict({
        universe: args.universe,
        asset: args.asset,
        owner: owner.publicKey,
      })
      .rpc();
  }

  async function addParent(args: {
    childAsset: PublicKey;
    parentAsset: PublicKey;
    creator: Keypair | anchor.Wallet;
    assetParent: PublicKey;
  }) {
    const creatorPublicKey = args.creator.publicKey;
    const signers = args.creator instanceof Keypair ? [args.creator] : [];

    await stellarProgram.methods
      .addAssetParent()
      .accountsStrict({
        childAsset: args.childAsset,
        parentAsset: args.parentAsset,
        creator: creatorPublicKey,
        assetParent: args.assetParent,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers(signers)
      .rpc();
  }

  before(async () => {
    await Promise.all([
      airdrop(contributor.publicKey, 5 * LAMPORTS_PER_SOL),
      airdrop(branchContributor.publicKey, 5 * LAMPORTS_PER_SOL),
      airdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);
  });

  it("mints a Stellar-linked avatar and splits mint revenue by lineage", async () => {
    const universeIndex = Date.now();
    const universe = universePda(universeIndex);
    const baseAsset = assetPda(universe, 0);
    const uvAsset = assetPda(universe, 1);
    const animationAsset = assetPda(universe, 2);
    const finalAsset = assetPda(universe, 3);
    const uvBaseLink = linkPda(uvAsset, baseAsset);
    const animationBaseLink = linkPda(animationAsset, baseAsset);
    const finalUvLink = linkPda(finalAsset, uvAsset);
    const finalAnimationLink = linkPda(finalAsset, animationAsset);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);

    await stellarProgram.methods
      .createUniverse(
        new BN(universeIndex),
        "QmIntegrationUniverseHash",
        { model3D: {} },
        { lineageEqual: {} },
        true
      )
      .accountsStrict({
        universe,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await createAsset({
      universe,
      index: 0,
      asset: baseAsset,
      creator: owner,
      kind: { image: {} },
      subtype: { concept: {} },
      metadataHash: "QmIntegrationBaseHash",
      previewHash: "QmIntegrationBasePreview",
    });
    await submitAndApproveAsset({
      universe,
      asset: baseAsset,
      creator: owner,
    });

    await createAsset({
      universe,
      index: 1,
      asset: uvAsset,
      creator: contributor,
      kind: { model3D: {} },
      subtype: { texture: {} },
      metadataHash: "QmIntegrationUvHash",
      previewHash: "QmIntegrationUvPreview",
    });
    await addParent({
      childAsset: uvAsset,
      parentAsset: baseAsset,
      creator: contributor,
      assetParent: uvBaseLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: uvAsset,
      creator: contributor,
    });

    await createAsset({
      universe,
      index: 2,
      asset: animationAsset,
      creator: branchContributor,
      kind: { animation: {} },
      subtype: { motion: {} },
      metadataHash: "QmIntegrationAnimHash",
      previewHash: "QmIntegrationAnimPreview",
    });
    await addParent({
      childAsset: animationAsset,
      parentAsset: baseAsset,
      creator: branchContributor,
      assetParent: animationBaseLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: animationAsset,
      creator: branchContributor,
    });

    await createAsset({
      universe,
      index: 3,
      asset: finalAsset,
      creator: owner,
      kind: { model3D: {} },
      subtype: { final: {} },
      metadataHash: "QmIntegrationFinalHash",
      previewHash: "QmIntegrationFinalPreview",
    });
    await addParent({
      childAsset: finalAsset,
      parentAsset: uvAsset,
      creator: owner,
      assetParent: finalUvLink,
    });
    await addParent({
      childAsset: finalAsset,
      parentAsset: animationAsset,
      creator: owner,
      assetParent: finalAnimationLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: finalAsset,
      creator: owner,
    });

    await stellarProgram.methods
      .createRelease(new BN(0), "QmIntegrationReleaseHash")
      .accountsStrict({
        universe,
        asset: finalAsset,
        release,
        vault,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const contributors = [
      owner.publicKey,
      contributor.publicKey,
      branchContributor.publicKey,
    ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
    const shareAccounts = contributors.map((pk) => sharePda(release, pk));

    await stellarProgram.methods
      .finalizeLineageEqualRelease(4, 4)
      .accountsStrict({
        universe,
        release,
        asset: finalAsset,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: finalAsset, isWritable: false, isSigner: false },
        { pubkey: uvAsset, isWritable: false, isSigner: false },
        { pubkey: animationAsset, isWritable: false, isSigner: false },
        { pubkey: baseAsset, isWritable: false, isSigner: false },
        { pubkey: finalUvLink, isWritable: false, isSigner: false },
        { pubkey: finalAnimationLink, isWritable: false, isSigner: false },
        { pubkey: uvBaseLink, isWritable: false, isSigner: false },
        { pubkey: animationBaseLink, isWritable: false, isSigner: false },
        ...shareAccounts.map((pubkey) => ({
          pubkey,
          isWritable: true,
          isSigner: false,
        })),
      ])
      .rpc();

    const buyerProvider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(buyer),
      anchor.AnchorProvider.defaultOptions()
    );
    const buyerMinterProgram = new anchor.Program<AvatarNftMinterIDL>(
      JSON.parse(JSON.stringify(minterProgram.idl)) as AvatarNftMinterIDL,
      buyerProvider
    );
    const ownerClient = minterSdk.create(provider, minterProgram);
    const buyerClient = minterSdk.create(buyerProvider, buyerMinterProgram);

    const ipfsHash = "QmIntegrationAvatarHash000000000000000000000000";
    const mintingFeePerMint = new BN(1_000_000);
    const { avatarDataPda, stellarLinkPda } =
      await ownerClient.initializeAvatarFromStellar({
        ipfsHash,
        maxSupply: new BN(10),
        mintingFeePerMint,
        stellarProgram: STELLAR_PROGRAM_ID,
        stellarRelease: release,
        stellarVault: vault,
      });

    const avatarData = await ownerClient.getAvatarData(avatarDataPda);
    const avatarIndex = avatarData!.index.toNumber();

    const releaseBeforeMint = await stellarAccounts.release.fetch(release);
    expect(releaseBeforeMint.totalDepositedLamports.toNumber()).to.equal(0);

    const { tokenAccountPk, mintPk } = await buyerClient.mintNft({
      index: avatarIndex,
      name: "Lineage Equal Avatar",
      symbol: "LEQ",
      uri: `ipfs://${ipfsHash}`,
      stellar: {
        stellarLink: stellarLinkPda,
        stellarProgram: STELLAR_PROGRAM_ID,
        stellarRelease: release,
        stellarVault: vault,
      },
    });

    const tokenAccount = await getTokenAccount(connection, tokenAccountPk);
    expect(tokenAccount.amount).to.equal(BigInt(1));
    expect(tokenAccount.owner.equals(buyer.publicKey)).to.be.true;

    const mint = await getMint(connection, mintPk);
    expect(mint.mintAuthority).to.equal(null);
    expect(mint.freezeAuthority).to.equal(null);

    const releaseAfterMint = await stellarAccounts.release.fetch(release);
    expect(releaseAfterMint.totalDepositedLamports.toNumber()).to.equal(
      mintingFeePerMint.toNumber()
    );

    const shareStates = await Promise.all(
      shareAccounts.map((share) =>
        stellarAccounts.contributorShare.fetch(share)
      )
    );
    expect(shareStates.reduce((sum, share) => sum + share.bps, 0)).to.equal(
      10_000
    );

    for (const [idx, contributorPk] of contributors.entries()) {
      const share = shareStates[idx];
      const expectedClaim = Math.floor(
        (mintingFeePerMint.toNumber() * share.bps) / 10_000
      );
      const signer = contributorPk.equals(contributor.publicKey)
        ? contributor
        : branchContributor;
      const builder = stellarProgram.methods.claimRevenue().accountsStrict({
        release,
        vault,
        share: shareAccounts[idx],
        contributor: contributorPk,
      });

      if (contributorPk.equals(owner.publicKey)) {
        await builder.rpc();
      } else {
        await builder.signers([signer]).rpc();
      }

      const fetchedShare = await stellarAccounts.contributorShare.fetch(
        shareAccounts[idx]
      );
      expect(fetchedShare.claimedLamports.toNumber()).to.equal(expectedClaim);
    }

    const linkedAvatarData = await ownerClient.getAvatarData(avatarDataPda);
    expect(linkedAvatarData!.currentSupply.eqn(1)).to.be.true;
    expect(linkedAvatarData!.totalUnclaimedFees.eqn(0)).to.be.true;
  });
});
