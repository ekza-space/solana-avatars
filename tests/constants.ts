import path from "path";

export const KEYPAIR_1 = path.join(
    process.env.HOME!,
    ".config",
    "solana",
    "devnet-owner.json"
);
export const KEYPAIR_2 = path.join(
    process.env.HOME!,
    ".config",
    "solana",
    "devnet-buyer.json"
);