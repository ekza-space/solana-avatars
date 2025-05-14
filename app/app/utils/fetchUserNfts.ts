import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Metaplex Token Metadata program id for on-chain metadata
const METADATA_PROGRAM_ID = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export async function fetchUserNFTs(
    connection: Connection,
    ownerPk: PublicKey
): Promise<Array<{ mint: string; uri: string; metadata?: any }>> {
    const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, {
        programId: TOKEN_PROGRAM_ID,
    });
    const decoder = new TextDecoder();
    const results: Array<{ mint: string; uri: string; metadata?: any }> = [];

    for (const { account } of resp.value) {
        const data = account.data as ParsedAccountData;
        const info = data.parsed.info;
        // Only NFTs: amount == "1" && decimals == 0
        if (info.tokenAmount.amount === "1" && info.tokenAmount.decimals === 0) {
            const mintPubkey = new PublicKey(info.mint);

            // Derive the metadata PDA
            const [metadataPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    METADATA_PROGRAM_ID.toBuffer(),
                    mintPubkey.toBuffer(),
                ],
                METADATA_PROGRAM_ID
            );

            // Fetch on-chain metadata account
            const metaAcc = await connection.getAccountInfo(metadataPda);
            if (metaAcc?.data) {
                const accountData = metaAcc.data;
                // URI field is 200 bytes starting at offset 107 (1+32+32+32+10)
                const uriBytes = accountData.slice(107, 307);
                const uri = decoder.decode(uriBytes).replace(/\0/g, "").trim();
                // Fetch metadata JSON from local IPFS gateway
                let metadata = undefined;
                try {
                    const res = await fetch(`http://localhost:8080/ipfs/${uri.replace(/^.*\/ipfs\//, "")}`);
                    if (res.ok) {
                        metadata = await res.json();
                    }
                } catch (e) {
                    console.warn("Failed to fetch metadata for", uri, e);
                }
                results.push({ mint: mintPubkey.toString(), uri, metadata });
            }
        }
    }
    return results;
}