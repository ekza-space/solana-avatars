import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

/** Anchor account reads require a provider wallet interface, but never a signer.
 * This inert placeholder is not an authenticated user and cannot authorize a tx. */
export function readOnlyMinterWallet() {
  return {
    publicKey: PublicKey.default,
    async signTransaction<T extends Transaction | VersionedTransaction>(_transaction: T): Promise<T> {
      throw new Error("Connect your wallet to buy or publish an avatar.");
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(_transactions: T[]): Promise<T[]> {
      throw new Error("Connect your wallet to buy or publish an avatar.");
    },
  };
}
