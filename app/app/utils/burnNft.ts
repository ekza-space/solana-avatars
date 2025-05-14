import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";

export const handleBurnInvalidNFTs = async (publicKey: any, connected: any, mints_to_delete: any, sendTransaction: any) => {
    if (!publicKey || !connected) {
        window.alert("Connect your wallet first.");
        return;
    }
    const connection = new Connection(clusterApiUrl("devnet"));
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
        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "processed");
        console.log("Burn transaction confirmed", signature);
        window.alert("Burn transaction complete. Check console for details.");
    } catch (err) {
        console.error("Failed to burn invalid NFTs", err);
        window.alert("Error burning NFTs. Check console.");
    }
};