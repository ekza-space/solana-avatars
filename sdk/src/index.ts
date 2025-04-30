import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { UserAvatar } from "../idl/user_avatar";

export interface CreateUserAvatarArgs {
    username: number[];
    description: number[];
    avatar2d: number[];
    avatar3d: number[];
}

export interface UpdateUserAvatarArgs {
    username?: number[] | null;
    description?: number[] | null;
    avatar2d?: number[] | null;
    avatar3d?: number[] | null;
}

export function createSolanaAvatarsSdk(
    provider: anchor.Provider,
    program: Program<UserAvatar>
) {
    const systemProgram = anchor.web3.SystemProgram.programId;
    const payer = provider.publicKey;

    async function getCounterPda(): Promise<[PublicKey, number]> {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("avatar_counter")],
            program.programId
        );
    }

    async function initializeCounter(): Promise<PublicKey> {
        const [counter, bump] = await getCounterPda();
        await program.methods
            .initialize()
            .accountsStrict({ counter, payer, systemProgram })
            .rpc();
        return counter;
    }

    async function createUserAvatar(args: CreateUserAvatarArgs): Promise<PublicKey> {
        const [counter] = await getCounterPda();
        const counterAccount = await program.account.avatarCounter.fetch(counter);
        const id = counterAccount.nextId;

        const [avatar] = await PublicKey.findProgramAddressSync(
            [Buffer.from("user_id"), new anchor.BN(id).toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        await program.methods
            .createUserAvatar(args.username, args.description, args.avatar2d, args.avatar3d)
            .accountsStrict({
                counter,
                avatar,
                owner: payer,
                systemProgram,
            })
            .rpc();

        return avatar;
    }

    async function updateUserAvatar(
        avatar: PublicKey,
        updates: UpdateUserAvatarArgs
    ): Promise<void> {
        await program.methods
            .updateUserAvatar(
                updates.username ?? null,
                updates.description ?? null,
                updates.avatar2d ?? null,
                updates.avatar3d ?? null
            )
            .accountsStrict({ avatar, owner: payer })
            .rpc();
    }

    async function deleteUserAvatar(avatar: PublicKey): Promise<void> {
        await program.methods
            .deleteUserAvatar()
            .accountsStrict({ avatar, owner: payer })
            .rpc();
    }

    return {
        initializeCounter,
        createUserAvatar,
        updateUserAvatar,
        deleteUserAvatar,
    };
}