import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { UserProfile } from "../idl/user_profile";

export interface CreateUserProfileArgs {
    username: number[];
    description: number[];
    avatarMint: PublicKey;
}

export interface UpdateUserProfileArgs {
    username?: number[] | null;
    description?: number[] | null;
    avatarMint?: PublicKey | null;
}

export function createSolanaAvatarsSdk(
    provider: anchor.Provider,
    program: Program<UserProfile>
) {
    const systemProgram = anchor.web3.SystemProgram.programId;
    const payer = provider.publicKey!;

    function getProfilePda(): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("profile"), payer.toBuffer()],
            program.programId
        );
    }

    async function initializeProfile(args: CreateUserProfileArgs): Promise<PublicKey> {
        const [profile, bump] = getProfilePda();
        await program.methods
            .initializeProfile(args.username, args.description, args.avatarMint)
            .accountsStrict({ profile, owner: payer, systemProgram })
            .rpc();
        return profile;
    }

    async function updateProfile(args: UpdateUserProfileArgs): Promise<void> {
        const [profile] = getProfilePda();
        await program.methods
            .updateProfile(args.username ?? null, args.description ?? null, args.avatarMint ?? null)
            .accountsStrict({ profile, owner: payer })
            .rpc();
    }

    async function deleteProfile(): Promise<void> {
        const [profile] = getProfilePda();
        await program.methods
            .deleteProfile()
            .accountsStrict({ profile, owner: payer })
            .rpc();
    }

    return {
        getProfilePda,
        initializeProfile,
        updateProfile,
        deleteProfile,
    };
}