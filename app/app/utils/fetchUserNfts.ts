import type { NftMetadata } from "~/types/nft";
import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Metaplex Token Metadata program id for on-chain metadata
const METADATA_PROGRAM_ID = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const DEFAULT_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "http://localhost:8080/ipfs/";

// todo: move to SDK
export async function fetchUserNFTs(
    connection: Connection,
    ownerPk: PublicKey
): Promise<Array<{ mint: string; uri: string; metadata?: NftMetadata }>> {
    const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, {
        programId: TOKEN_PROGRAM_ID,
    });
    const decoder = new TextDecoder();
    const results: Array<{ mint: string; uri: string; metadata?: NftMetadata }> = [];

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
                // ---------------- Decode metadata URI (Borsh layout) ----------------
                // Metaplex Metadata uses variable‑length strings prefixed with a
                // little‑endian u32 length. The layout is:
                // key (1) | updateAuthority (32) | mint (32) | name (str) | symbol (str) | uri (str) | ...
                const dataView = new DataView(accountData.buffer, accountData.byteOffset, accountData.length);
                let offset = 1 + 32 + 32; // Skip key, updateAuthority, mint

                const readBorshString = (): string => {
                    const strLen = dataView.getUint32(offset, true); // little‑endian u32
                    offset += 4;
                    const strBytes = accountData.slice(offset, offset + strLen);
                    offset += strLen;
                    return decoder.decode(strBytes).replace(/\0/g, "").trim();
                };

                // Skip name and symbol; we only need the URI
                readBorshString(); // name
                readBorshString(); // symbol
                const uri = readBorshString();

                // Resolve metadata URL.
                // Possible cases:
                //  - raw CID          => DEFAULT_GATEWAY + cid
                //  - ipfs://<cid>     => DEFAULT_GATEWAY + cid
                //  - http(s)://...    => use as‑is
                let metadataUrl: string;
                if (uri.startsWith("http://") || uri.startsWith("https://")) {
                    metadataUrl = uri;
                } else if (uri.startsWith("ipfs://")) {
                    metadataUrl = uri.replace("ipfs://", DEFAULT_GATEWAY);
                } else {
                    metadataUrl = `${DEFAULT_GATEWAY}${uri}`;
                }

                // Fetch metadata JSON from local IPFS gateway
                let metadata: NftMetadata | undefined = undefined;
                try {
                    const res = await fetch(metadataUrl);
                    if (res.ok) {
                        metadata = await res.json() as NftMetadata;
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