import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";

// ---- IDL ----
import idl from "../idl/avatar_nft_minter.json";
import type { AvatarNftMinter as AvatarNftMinterIDL } from "../idl/avatar_nft_minter";

/**
 * The Minter SDK mirrors the structure of `profile.ts`.
 * – No internal `anchor.Program` construction.
 * – Caller supplies a ready‑made `Program` instance.
 * – All helpers are closures captured by `create`.
 */
export default {
  idlJson: idl,
  idlType: null as unknown as AvatarNftMinterIDL, // type‑only reference

  create(provider: anchor.Provider, program: Program<AvatarNftMinterIDL>) {
    // ---- Constants scoped to this client ----
    const payer = provider.publicKey!;
    const METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
    const METADATA_SEED = "metadata";
    const AVATAR_PDA_SEED = "avatar_v1";
    const REGISTRY_PDA_SEED = "avatar_registry";
    const ESCROW_PDA_SEED = "avatar_escrow";
    const STELLAR_LINK_PDA_SEED = "stellar_avatar_link";
    const STELLAR_RELEASE_LINK_PDA_SEED = "stellar_release_link";

    // ---- PDA helpers ----
    function getAvatarDataPda(index: number): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from(AVATAR_PDA_SEED),
          new anchor.BN(index).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
    }

    function getEscrowPda(index: number): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from(ESCROW_PDA_SEED),
          new anchor.BN(index).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
    }

    function getMetadataPda(mint: PublicKey): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from(METADATA_SEED),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );
    }

    function getStellarLinkPda(avatarData: PublicKey): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [Buffer.from(STELLAR_LINK_PDA_SEED), avatarData.toBuffer()],
        program.programId
      );
    }

    function getStellarReleaseLinkPda(
      stellarRelease: PublicKey
    ): [PublicKey, number] {
      return PublicKey.findProgramAddressSync(
        [Buffer.from(STELLAR_RELEASE_LINK_PDA_SEED), stellarRelease.toBuffer()],
        program.programId
      );
    }

    // ---- Instructions ----
    async function initializeAvatar(args: {
      ipfsHash: string;
      maxSupply: anchor.BN;
      mintingFeePerMint: anchor.BN;
    }): Promise<{ avatarDataPda: PublicKey; signature: string }> {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(REGISTRY_PDA_SEED)],
        program.programId
      );

      let nextIndex = 0;
      try {
        const registry = await program.account.avatarRegistry.fetch(
          registryPda
        );
        nextIndex = registry.nextIndex.toNumber();
      } catch {
        /* registry not yet created */
      }

      const [avatarDataPda] = getAvatarDataPda(nextIndex);
      const [escrowPda] = getEscrowPda(nextIndex);

      const signature = await program.methods
        .initializeAvatar(args.ipfsHash, args.maxSupply, args.mintingFeePerMint)
        .accountsStrict({
          registry: registryPda,
          avatarData: avatarDataPda,
          payer,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { avatarDataPda, signature };
    }

    async function initializeAvatarFromStellar(args: {
      ipfsHash: string;
      maxSupply: anchor.BN;
      mintingFeePerMint: anchor.BN;
      stellarProgram: PublicKey;
      stellarUniverse: PublicKey;
      stellarRelease: PublicKey;
      stellarVault: PublicKey;
    }): Promise<{
      avatarDataPda: PublicKey;
      stellarLinkPda: PublicKey;
      stellarReleaseLinkPda: PublicKey;
      avatarIndex: number;
      signature: string;
    }> {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(REGISTRY_PDA_SEED)],
        program.programId
      );

      let nextIndex = 0;
      try {
        const registry = await program.account.avatarRegistry.fetch(
          registryPda
        );
        nextIndex = registry.nextIndex.toNumber();
      } catch {
        /* registry not yet created */
      }

      const [avatarDataPda] = getAvatarDataPda(nextIndex);
      const [escrowPda] = getEscrowPda(nextIndex);
      const [stellarLinkPda] = getStellarLinkPda(avatarDataPda);
      const [stellarReleaseLinkPda] = getStellarReleaseLinkPda(
        args.stellarRelease
      );

      const signature = await program.methods
        .initializeAvatarFromStellar(
          args.ipfsHash,
          args.maxSupply,
          args.mintingFeePerMint
        )
        .accountsStrict({
          registry: registryPda,
          avatarData: avatarDataPda,
          payer,
          escrow: escrowPda,
          stellarLink: stellarLinkPda,
          stellarProgram: args.stellarProgram,
          stellarUniverse: args.stellarUniverse,
          stellarRelease: args.stellarRelease,
          stellarVault: args.stellarVault,
          stellarReleaseLink: stellarReleaseLinkPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return {
        avatarDataPda,
        stellarLinkPda,
        stellarReleaseLinkPda,
        avatarIndex: nextIndex,
        signature,
      };
    }

    async function publishFromStellarRelease(args: {
      ipfsHash: string;
      maxSupply: anchor.BN;
      mintingFeePerMint: anchor.BN;
      stellarProgram: PublicKey;
      stellarUniverse: PublicKey;
      stellarRelease: PublicKey;
      stellarVault: PublicKey;
    }): Promise<{
      avatarDataPda: PublicKey;
      stellarLinkPda: PublicKey;
      stellarReleaseLinkPda: PublicKey;
      avatarIndex: number;
      avatarData: Awaited<ReturnType<typeof getAvatarData>>;
      signature: string;
    }> {
      const result = await initializeAvatarFromStellar(args);
      const avatarData = await getAvatarData(result.avatarDataPda);

      return {
        ...result,
        avatarData,
        avatarIndex:
          (avatarData as any)?.index?.toNumber?.() ?? result.avatarIndex,
      };
    }

    async function mintNft(args: {
      index: number;
      name: string;
      symbol: string;
      uri: string;
      mintKeypair?: Keypair;
      stellar?: {
        stellarLink: PublicKey;
        stellarProgram: PublicKey;
        stellarRelease: PublicKey;
        stellarVault: PublicKey;
      };
    }): Promise<{
      signature: string;
      mintPk: PublicKey;
      tokenAccountPk: PublicKey;
      metadataPk: PublicKey;
    }> {
      const [avatarDataPda] = getAvatarDataPda(args.index);
      const [escrowPda] = getEscrowPda(args.index);
      const mint = args.mintKeypair ?? Keypair.generate();
      const tokenAccount = getAssociatedTokenAddressSync(mint.publicKey, payer);
      const [metadataPda] = getMetadataPda(mint.publicKey);

      let builder = program.methods
        .mintNft(args.name, args.symbol, args.uri)
        .accountsStrict({
          avatarData: avatarDataPda,
          mint: mint.publicKey,
          tokenAccount,
          metadataAccount: metadataPda,
          payer,
          escrow: escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        });

      if (args.stellar) {
        builder = builder.remainingAccounts([
          {
            pubkey: args.stellar.stellarLink,
            isWritable: false,
            isSigner: false,
          },
          {
            pubkey: args.stellar.stellarProgram,
            isWritable: false,
            isSigner: false,
          },
          {
            pubkey: args.stellar.stellarRelease,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: args.stellar.stellarVault,
            isWritable: true,
            isSigner: false,
          },
        ]);
      }

      const signature = await builder.signers([mint]).rpc();

      return {
        signature,
        mintPk: mint.publicKey,
        tokenAccountPk: tokenAccount,
        metadataPk: metadataPda,
      };
    }

    async function claimFee(args: {
      index: number;
    }): Promise<{ signature: string }> {
      const [avatarDataPda] = getAvatarDataPda(args.index);
      const [escrowPda] = getEscrowPda(args.index);

      const signature = await program.methods
        .claimFee()
        .accounts({
          avatarData: avatarDataPda,
          creator: payer,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { signature };
    }

    // ---- Fetch helpers ----
    async function getAvatarRegistry() {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(REGISTRY_PDA_SEED)],
        program.programId
      );

      try {
        const registry = await program.account.avatarRegistry.fetch(
          registryPda
        );
        return { registryPda, registry };
      } catch {
        return { registryPda, registry: null };
      }
    }

    async function getAvatarData(pda: PublicKey) {
      try {
        return await program.account.avatarData.fetch(pda);
      } catch {
        return null;
      }
    }

    /**
     * Fetches avatar‑data PDAs in a paginated way.
     * @param start ‑ zero‑based index to begin from
     * @param limit ‑ how many entries to return; if omitted fetches until `nextIndex`
     */
    async function getAvatarDataRange(args: { start: number; limit?: number }) {
      const { registry } = await getAvatarRegistry();
      const max = registry ? registry.nextIndex.toNumber() : 0;
      const start = Math.max(0, args.start);
      const end = args.limit ? Math.min(max, start + args.limit) : max;
      const out: { index: number; data: any }[] = [];
      for (let i = start; i < end; i++) {
        const [pda] = getAvatarDataPda(i);
        const data = await getAvatarData(pda);
        if (data) out.push({ index: i, data });
      }
      return out;
    }

    async function getAllAvatarData() {
      return getAvatarDataRange({ start: 0 });
    }

    async function getAvatarDataByIndex(index: number) {
      const [pda] = getAvatarDataPda(index);
      return getAvatarData(pda);
    }

    async function getStellarLink(avatarData: PublicKey) {
      const [stellarLinkPda] = getStellarLinkPda(avatarData);
      try {
        return {
          pda: stellarLinkPda,
          account: await program.account.stellarAvatarLink.fetch(
            stellarLinkPda
          ),
        };
      } catch {
        return null;
      }
    }

    async function getStellarLinkByIndex(index: number) {
      const [avatarDataPda] = getAvatarDataPda(index);
      return getStellarLink(avatarDataPda);
    }

    async function getStellarReleaseLink(stellarRelease: PublicKey) {
      const [stellarReleaseLinkPda] = getStellarReleaseLinkPda(stellarRelease);
      try {
        return {
          pda: stellarReleaseLinkPda,
          account: await program.account.stellarReleaseLink.fetch(
            stellarReleaseLinkPda
          ),
        };
      } catch {
        return null;
      }
    }

    // ---- Returned API ----
    return {
      // PDAs
      getAvatarDataPda,
      getEscrowPda,
      getMetadataPda,
      getStellarLinkPda,
      getStellarReleaseLinkPda,
      // Transactions
      initializeAvatar,
      initializeAvatarFromStellar,
      publishFromStellarRelease,
      mintNft,
      claimFee,
      // Queries
      getAvatarData,
      getAvatarRegistry,
      getAllAvatarData,
      getAvatarDataRange,
      getAvatarDataByIndex,
      getStellarLink,
      getStellarLinkByIndex,
      getStellarReleaseLink,
    };
  },
};

export type { AvatarNftMinterIDL };
