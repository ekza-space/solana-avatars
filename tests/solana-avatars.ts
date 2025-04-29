import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UserAvatar } from "../target/types/user_avatar";
import { assert } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("solana-avatars", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.userAvatar as Program<UserAvatar>;

  const owner = Keypair.generate();

  const username = new Array(32).fill(0);
  const description = new Array(128).fill(1);
  const avatar2d = new Array(32).fill(2);
  const avatar3d = new Array(32).fill(3);

  let counterPda: PublicKey;
  let counterBump: number;
  let avatarPda: PublicKey;
  let avatarBump: number;

  it("Initializes counter", async () => {
    [counterPda, counterBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("avatar_counter")],
      program.programId
    );

    const tx = await program.methods
      .initialize()
      .accountsStrict({
        counter: counterPda,
        payer: provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Initialized counter:", tx);
  });

  it("Creates user avatar", async () => {
    const counterAccount = await program.account.avatarCounter.fetch(counterPda);
    const id = counterAccount.nextId;

    [avatarPda, avatarBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("user_id"), new anchor.BN(id).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const tx = await program.methods
      .createUserAvatar(username, description, avatar2d, avatar3d)
      .accountsStrict({
        counter: counterPda,
        avatar: avatarPda,
        owner: provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Created avatar:", tx);
  });

  it("Updates user avatar", async () => {
    const updatedDescription = new Array(128).fill(9);

    const tx = await program.methods
      .updateUserAvatar(null, updatedDescription, null, null)
      .accountsStrict({
        avatar: avatarPda,
        owner: provider.publicKey,
      })
      .rpc();
    console.log("Updated avatar:", tx);

    const updated = await program.account.userAvatar.fetch(avatarPda);
    assert.deepEqual(updated.description, updatedDescription);
  });

  it("Deletes user avatar", async () => {
    const tx = await program.methods
      .deleteUserAvatar()
      .accountsStrict({
        avatar: avatarPda,
        owner: provider.publicKey,
      })
      .rpc();
    console.log("Deleted avatar:", tx);
  });
});
