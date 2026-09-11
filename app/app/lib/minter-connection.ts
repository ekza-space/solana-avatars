import { useMemo } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useSolanaNetwork } from "./network";
import { MinterConnection } from "./minter-transport";

export function useMinterConnection() {
  const { connection: walletConnection } = useConnection();
  const { cluster } = useSolanaNetwork();
  const connection = useMemo(() => cluster === "devnet" && typeof window !== "undefined"
    ? new MinterConnection(window.location.origin) : walletConnection, [cluster, walletConnection]);
  return { connection };
}
