import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  createSolanaAvatarsSdk,
  CreateUserProfileArgs,
  UpdateUserProfileArgs,
} from "../sdk/src";
import { UserProfile } from "../target/types/user_profile";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("user_profile", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.userProfile as Program<UserProfile>;
  const sdk = createSolanaAvatarsSdk(provider, program);

  const username = new Array(32).fill(0);
  const description = new Array(128).fill(1);
  const avatarMint = Keypair.generate().publicKey;

  let profilePda: PublicKey;

  it("Initializes profile", async () => {
    const args: CreateUserProfileArgs = { username, description, avatarMint };
    profilePda = await sdk.initializeProfile(args);
    const profile = await program.account.userProfile.fetch(profilePda);
    assert.deepEqual(profile.username, username);
    assert.deepEqual(profile.description, description);
    assert.equal(
      profile.avatarMint.toBase58(),
      avatarMint.toBase58()
    );
  });

  it("Updates profile description", async () => {
    const updatedDescription = new Array(128).fill(9);
    const updateArgs: UpdateUserProfileArgs = { description: updatedDescription };
    await sdk.updateProfile(updateArgs);
    const profile = await program.account.userProfile.fetch(profilePda);
    assert.deepEqual(profile.description, updatedDescription);
    assert.deepEqual(profile.username, username);
  });

  it("Deletes profile", async () => {
    await sdk.deleteProfile();
    try {
      await program.account.userProfile.fetch(profilePda);
      assert.fail("Profile should be deleted");
    } catch {
      // expected: account no longer exists
    }
  });
});