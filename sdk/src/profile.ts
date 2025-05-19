import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// IDL and its type
import idl from "../idl/user_profile.json";
import type { UserProfile } from "../idl/user_profile";

export default {
    idlJson: idl,
    idlType: null as unknown as UserProfile, // Type reference, not runtime

    create(provider: anchor.Provider, program: Program<UserProfile>) {
        const systemProgram = anchor.web3.SystemProgram.programId;
        const payer = provider.publicKey!;

        function getProfilePda(): [PublicKey, number] {
            return PublicKey.findProgramAddressSync(
                [Buffer.from("profile"), payer.toBuffer()],
                program.programId
            );
        }

        async function initializeProfile(args: {
            username: number[];
            description: number[];
            avatarMint: PublicKey;
        }): Promise<PublicKey> {
            const [profile, bump] = getProfilePda();
            await program.methods
                .initializeProfile(args.username, args.description, args.avatarMint)
                .accountsStrict({ profile, owner: payer, systemProgram })
                .rpc();
            return profile;
        }

        async function updateProfile(args: {
            username?: number[] | null;
            description?: number[] | null;
            avatarMint?: PublicKey | null;
        }): Promise<void> {
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

        async function getAllProfiles(): Promise<
            {
                publicKey: PublicKey;
                account: anchor.IdlAccounts<UserProfile>["userProfile"];
            }[]
        > {
            return await program.account.userProfile.all();
        }

        return {
            getProfilePda,
            initializeProfile,
            updateProfile,
            deleteProfile,
            getAllProfiles,
        };
    }
};

export type { UserProfile };