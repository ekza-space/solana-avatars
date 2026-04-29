import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import sdk from "../sdk/src/profile";
import { UserProfile } from "../target/types/user_profile";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe("user_profile", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet as anchor.Wallet & { payer: Keypair };
  const profileIdl = JSON.parse(JSON.stringify(sdk.idlJson)) as anchor.Idl;
  const program = new anchor.Program(
    profileIdl,
    provider
  ) as Program<UserProfile>;
  const avatarsSdk = sdk.create(provider, program);

  const username = new Array(32).fill(0);
  const description = new Array(128).fill(1);
  let avatarMint: PublicKey;
  let secondAvatarMint: PublicKey;
  let zeroBalanceAvatarMint: PublicKey;

  let profilePda: PublicKey;

  before(async () => {
    avatarMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0
    );
    const avatarAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      avatarMint,
      wallet.publicKey
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      avatarMint,
      avatarAta.address,
      wallet.payer,
      1
    );

    secondAvatarMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0
    );
    const secondAvatarAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      secondAvatarMint,
      wallet.publicKey
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      secondAvatarMint,
      secondAvatarAta.address,
      wallet.payer,
      1
    );

    zeroBalanceAvatarMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0
    );
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      zeroBalanceAvatarMint,
      wallet.publicKey
    );
  });

  it("Initializes profile", async () => {
    const args = { username, description, avatarMint };
    profilePda = await avatarsSdk.initializeProfile(args);
    const profile = await program.account.userProfile.fetch(profilePda);
    assert.deepEqual(profile.username, username);
    assert.deepEqual(profile.description, description);
    assert.equal(profile.avatarMint.toBase58(), avatarMint.toBase58());
  });

  it("Updates profile description", async () => {
    const updatedDescription = new Array(128).fill(9);
    const updateArgs = { description: updatedDescription };
    await avatarsSdk.updateProfile(updateArgs);
    const profile = await program.account.userProfile.fetch(profilePda);
    assert.deepEqual(profile.description, updatedDescription);
    assert.deepEqual(profile.username, username);
  });

  it("Updates avatar mint when ownership proof is valid", async () => {
    await avatarsSdk.updateProfile({ avatarMint: secondAvatarMint });
    const profile = await program.account.userProfile.fetch(profilePda);
    assert.equal(profile.avatarMint.toBase58(), secondAvatarMint.toBase58());
  });

  it("Fails avatar update if wallet has zero token balance", async () => {
    try {
      await avatarsSdk.updateProfile({ avatarMint: zeroBalanceAvatarMint });
      assert.fail("Avatar update should fail due to zero balance");
    } catch (e: any) {
      assert.include(e.message, "AvatarTokenBalanceZero");
    }
  });

  it("Deletes profile", async () => {
    await avatarsSdk.deleteProfile();
    try {
      await program.account.userProfile.fetch(profilePda);
      assert.fail("Profile should be deleted");
    } catch {
      // expected: account no longer exists
    }
  });
});
