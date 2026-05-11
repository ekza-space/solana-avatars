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

type CollaborationPolicy = "lineageEqual" | "weighted";

describe("stellar release mint integration", () => {
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
  let nextOwnerUniverseIndex = Date.now();

  const toLeBytes = (value: number) =>
    new BN(value).toArrayLike(Buffer, "le", 8);

  const registryPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      STELLAR_PROGRAM_ID
    )[0];

  const universeIndexPda = (globalIndex: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("universe_index"), toLeBytes(globalIndex)],
      STELLAR_PROGRAM_ID
    )[0];

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

  async function nextGlobalUniverseIndex() {
    try {
      const registry = await stellarAccounts.registry.fetch(registryPda());
      return registry.universeCount.toNumber();
    } catch {
      return 0;
    }
  }

  function contributorSigner(publicKey: PublicKey) {
    if (publicKey.equals(contributor.publicKey)) return contributor;
    if (publicKey.equals(branchContributor.publicKey)) return branchContributor;
    return null;
  }

  async function send(builder: any, signer?: Keypair | null) {
    if (signer) {
      await builder.signers([signer]).rpc();
      return;
    }

    await builder.rpc();
  }

  async function createUniverse(policy: CollaborationPolicy, label: string) {
    const ownerIndex = nextOwnerUniverseIndex++;
    const globalIndex = await nextGlobalUniverseIndex();
    const universe = universePda(ownerIndex);
    const universeLookup = universeIndexPda(globalIndex);

    await stellarProgram.methods
      .createUniverse(
        new BN(ownerIndex),
        `Qm${label}UniverseHash`,
        { model3D: {} },
        { [policy]: {} },
        true
      )
      .accountsStrict({
        registry: registryPda(),
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { universe, universeLookup, ownerIndex, globalIndex };
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
        { ccBy4: {} },
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

  async function buildRelease(args: {
    policy: CollaborationPolicy;
    label: string;
  }) {
    const { universe, universeLookup, globalIndex } = await createUniverse(
      args.policy,
      args.label
    );
    const baseAsset = assetPda(universe, 0);
    const textureAsset = assetPda(universe, 1);
    const rigAsset = assetPda(universe, 2);
    const finalAsset = assetPda(universe, 3);
    const textureBaseLink = linkPda(textureAsset, baseAsset);
    const rigBaseLink = linkPda(rigAsset, baseAsset);
    const finalTextureLink = linkPda(finalAsset, textureAsset);
    const finalRigLink = linkPda(finalAsset, rigAsset);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);

    await createAsset({
      universe,
      index: 0,
      asset: baseAsset,
      creator: owner,
      kind: { image: {} },
      subtype: { concept: {} },
      metadataHash: `Qm${args.label}BaseHash`,
      previewHash: `Qm${args.label}BasePreview`,
    });
    await submitAndApproveAsset({ universe, asset: baseAsset, creator: owner });

    await createAsset({
      universe,
      index: 1,
      asset: textureAsset,
      creator: contributor,
      kind: { model3D: {} },
      subtype: { texture: {} },
      metadataHash: `Qm${args.label}TextureHash`,
      previewHash: `Qm${args.label}TexturePreview`,
    });
    await addParent({
      childAsset: textureAsset,
      parentAsset: baseAsset,
      creator: contributor,
      assetParent: textureBaseLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: textureAsset,
      creator: contributor,
    });

    await createAsset({
      universe,
      index: 2,
      asset: rigAsset,
      creator: branchContributor,
      kind: { model3D: {} },
      subtype: { rig: {} },
      metadataHash: `Qm${args.label}RigHash`,
      previewHash: `Qm${args.label}RigPreview`,
    });
    await addParent({
      childAsset: rigAsset,
      parentAsset: baseAsset,
      creator: branchContributor,
      assetParent: rigBaseLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: rigAsset,
      creator: branchContributor,
    });

    await createAsset({
      universe,
      index: 3,
      asset: finalAsset,
      creator: owner,
      kind: { model3D: {} },
      subtype: { final: {} },
      metadataHash: `Qm${args.label}FinalHash`,
      previewHash: `Qm${args.label}FinalPreview`,
    });
    await addParent({
      childAsset: finalAsset,
      parentAsset: textureAsset,
      creator: owner,
      assetParent: finalTextureLink,
    });
    await addParent({
      childAsset: finalAsset,
      parentAsset: rigAsset,
      creator: owner,
      assetParent: finalRigLink,
    });
    await submitAndApproveAsset({
      universe,
      asset: finalAsset,
      creator: owner,
    });

    await stellarProgram.methods
      .createRelease(new BN(0), `Qm${args.label}ReleaseHash`)
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
    const finalize =
      args.policy === "weighted"
        ? stellarProgram.methods.finalizeWeightedRelease(4, 4)
        : stellarProgram.methods.finalizeLineageEqualRelease(4, 4);

    await finalize
      .accountsStrict({
        universe,
        release,
        asset: finalAsset,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: finalAsset, isWritable: false, isSigner: false },
        { pubkey: textureAsset, isWritable: false, isSigner: false },
        { pubkey: rigAsset, isWritable: false, isSigner: false },
        { pubkey: baseAsset, isWritable: false, isSigner: false },
        { pubkey: finalTextureLink, isWritable: false, isSigner: false },
        { pubkey: finalRigLink, isWritable: false, isSigner: false },
        { pubkey: textureBaseLink, isWritable: false, isSigner: false },
        { pubkey: rigBaseLink, isWritable: false, isSigner: false },
        ...shareAccounts.map((pubkey) => ({
          pubkey,
          isWritable: true,
          isSigner: false,
        })),
      ])
      .rpc();

    return {
      universe,
      universeLookup,
      globalIndex,
      finalAsset,
      release,
      vault,
      contributors,
      shareAccounts,
    };
  }

  async function runMintScenario(args: {
    policy: CollaborationPolicy;
    label: string;
    expectedBpsByContributor?: Map<string, number>;
  }) {
    const releaseContext = await buildRelease({
      policy: args.policy,
      label: args.label,
    });
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
    const ipfsHash = `Qm${args.label}AvatarHash`;
    const mintingFeePerMint = new BN(1_000_000);

    try {
      await buyerClient.publishFromStellarRelease({
        ipfsHash: `${ipfsHash}Rogue`,
        maxSupply: new BN(10),
        mintingFeePerMint,
        stellarProgram: STELLAR_PROGRAM_ID,
        stellarUniverse: releaseContext.universe,
        stellarRelease: releaseContext.release,
        stellarVault: releaseContext.vault,
      });
      expect.fail("should reject release publication by a non-owner");
    } catch (e: any) {
      expect(e.message).to.match(/Unauthorized|custom program error/i);
    }

    const {
      avatarDataPda,
      stellarLinkPda,
      stellarReleaseLinkPda,
      avatarIndex,
    } = await ownerClient.publishFromStellarRelease({
      ipfsHash,
      maxSupply: new BN(10),
      mintingFeePerMint,
      stellarProgram: STELLAR_PROGRAM_ID,
      stellarUniverse: releaseContext.universe,
      stellarRelease: releaseContext.release,
      stellarVault: releaseContext.vault,
    });

    const releaseLink = await (
      minterProgram.account as any
    ).stellarReleaseLink.fetch(stellarReleaseLinkPda);
    expect(releaseLink.release.toBase58()).to.equal(
      releaseContext.release.toBase58()
    );
    expect(releaseLink.universe.toBase58()).to.equal(
      releaseContext.universe.toBase58()
    );
    expect(releaseLink.asset.toBase58()).to.equal(
      releaseContext.finalAsset.toBase58()
    );
    expect(releaseLink.avatarData.toBase58()).to.equal(
      avatarDataPda.toBase58()
    );

    try {
      await ownerClient.publishFromStellarRelease({
        ipfsHash: `${ipfsHash}Again`,
        maxSupply: new BN(10),
        mintingFeePerMint,
        stellarProgram: STELLAR_PROGRAM_ID,
        stellarUniverse: releaseContext.universe,
        stellarRelease: releaseContext.release,
        stellarVault: releaseContext.vault,
      });
      expect.fail("should reject duplicate Stellar release publication");
    } catch (e: any) {
      expect(e.message).to.match(/already in use|custom program error/i);
    }

    const releaseBeforeMint = await stellarAccounts.release.fetch(
      releaseContext.release
    );
    expect(releaseBeforeMint.status).to.deep.equal({ linked: {} });
    expect(releaseBeforeMint.linkedAvatarData.toBase58()).to.equal(
      avatarDataPda.toBase58()
    );
    expect(releaseBeforeMint.totalDepositedLamports.toNumber()).to.equal(0);

    const { tokenAccountPk, mintPk } = await buyerClient.mintNft({
      index: avatarIndex,
      name: `${args.label} Avatar`,
      symbol: args.policy === "weighted" ? "WGT" : "LEQ",
      uri: `ipfs://${ipfsHash}`,
      stellar: {
        stellarLink: stellarLinkPda,
        stellarProgram: STELLAR_PROGRAM_ID,
        stellarRelease: releaseContext.release,
        stellarVault: releaseContext.vault,
      },
    });

    const tokenAccount = await getTokenAccount(connection, tokenAccountPk);
    expect(tokenAccount.amount).to.equal(BigInt(1));
    expect(tokenAccount.owner.equals(buyer.publicKey)).to.be.true;

    const mint = await getMint(connection, mintPk);
    expect(mint.mintAuthority).to.equal(null);
    expect(mint.freezeAuthority).to.equal(null);

    const releaseAfterMint = await stellarAccounts.release.fetch(
      releaseContext.release
    );
    expect(releaseAfterMint.totalDepositedLamports.toNumber()).to.equal(
      mintingFeePerMint.toNumber()
    );

    const shareStates = await Promise.all(
      releaseContext.shareAccounts.map((share) =>
        stellarAccounts.contributorShare.fetch(share)
      )
    );
    expect(shareStates.reduce((sum, share) => sum + share.bps, 0)).to.equal(
      10_000
    );

    if (args.expectedBpsByContributor) {
      const shareByContributor = new Map(
        shareStates.map((share) => [share.contributor.toBase58(), share.bps])
      );
      for (const [
        contributorPk,
        expectedBps,
      ] of args.expectedBpsByContributor) {
        expect(shareByContributor.get(contributorPk)).to.equal(expectedBps);
      }
    } else {
      expect(shareStates.map((share) => share.bps).sort()).to.deep.equal([
        3333, 3333, 3334,
      ]);
    }

    for (const [idx, contributorPk] of releaseContext.contributors.entries()) {
      const share = shareStates[idx];
      const expectedClaim = Math.floor(
        (mintingFeePerMint.toNumber() * share.bps) / 10_000
      );
      const builder = stellarProgram.methods.claimRevenue().accountsStrict({
        release: releaseContext.release,
        vault: releaseContext.vault,
        share: releaseContext.shareAccounts[idx],
        contributor: contributorPk,
      });

      await send(builder, contributorSigner(contributorPk));

      const fetchedShare = await stellarAccounts.contributorShare.fetch(
        releaseContext.shareAccounts[idx]
      );
      expect(fetchedShare.claimedLamports.toNumber()).to.equal(expectedClaim);
    }

    const linkedAvatarData = await ownerClient.getAvatarData(avatarDataPda);
    expect(linkedAvatarData!.currentSupply.eqn(1)).to.be.true;
    expect(linkedAvatarData!.totalUnclaimedFees.eqn(0)).to.be.true;
  }

  before(async () => {
    await Promise.all([
      airdrop(contributor.publicKey, 5 * LAMPORTS_PER_SOL),
      airdrop(branchContributor.publicKey, 5 * LAMPORTS_PER_SOL),
      airdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);
  });

  it("publishes and mints a lineage-equal Stellar release", async () => {
    await runMintScenario({
      policy: "lineageEqual",
      label: "LineageEqual",
    });
  });

  it("publishes and mints a weighted Stellar release", async () => {
    await runMintScenario({
      policy: "weighted",
      label: "Weighted",
      expectedBpsByContributor: new Map([
        [owner.publicKey.toBase58(), 5000],
        [contributor.publicKey.toBase58(), 2500],
        [branchContributor.publicKey.toBase58(), 2500],
      ]),
    });
  });
});
