import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { UserAvatar } from "../target/types/user_avatar";
import { createSolanaAvatarsSdk, CreateUserAvatarArgs } from "../sdk/src";
// import { createSolanaAvatarsSdk, CreateUserAvatarArgs } from "solana-avatars-sdk"; // TODO: make it load as package
import { PublicKey } from "@solana/web3.js";

describe("solana-avatars", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.userAvatar as Program<UserAvatar>;
  const sdk = createSolanaAvatarsSdk(provider, program);

  const username = new Array(32).fill(0);
  const description = new Array(128).fill(1);
  const avatar2d = new Array(32).fill(2);
  const avatar3d = new Array(32).fill(3);

  let counterPda: PublicKey;
  let avatarPda: PublicKey;

  it("Initializes counter", async () => {
    counterPda = await sdk.initializeCounter();
    console.log("Counter PDA:", counterPda.toBase58());
  });

  it("Creates user avatar", async () => {
    const args: CreateUserAvatarArgs = { username, description, avatar2d, avatar3d };
    avatarPda = await sdk.createUserAvatar(args);
    console.log("Avatar PDA:", avatarPda.toBase58());
  });

  it("Updates user avatar", async () => {
    const updatedDescription = new Array(128).fill(9);
    await sdk.updateUserAvatar(avatarPda, { description: updatedDescription });

    const updated = await program.account.userAvatar.fetch(avatarPda);
    assert.deepEqual(updated.description, updatedDescription);
  });

  it("Deletes user avatar", async () => {
    await sdk.deleteUserAvatar(avatarPda);
    console.log("Deleted avatar at:", avatarPda.toBase58());
  });
});