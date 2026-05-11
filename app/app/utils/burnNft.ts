import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export const handleBurnInvalidNFTs = async (
  publicKey: any,
  connected: any,
  mints_to_delete: string[],
  sendTransaction: any,
  connection?: Connection
) => {
    if (!publicKey || !connected) {
        window.alert("Connect your wallet first.");
        return;
    }
    const rpcConnection = connection || new Connection("http://127.0.0.1:8899");
    const transaction = new Transaction();
    try {
        for (const mintStr of mints_to_delete) {
            const mint = new PublicKey(mintStr);
            // derive the associated token account address
            const ata = await getAssociatedTokenAddress(mint, publicKey);
            // add burn instruction to transaction
            transaction.add(
                createBurnInstruction(
                    ata,
                    mint,
                    publicKey,
                    1,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );
        }
    // send and confirm transaction with a single signature prompt
    const signature = await sendTransaction(transaction, rpcConnection);
    await rpcConnection.confirmTransaction(signature, "processed");
        console.log("Burn transaction confirmed", signature);
        window.alert("Burn transaction complete. Check console for details.");
    } catch (err) {
        console.error("Failed to burn invalid NFTs", err);
        window.alert("Error burning NFTs. Check console.");
    }
};
