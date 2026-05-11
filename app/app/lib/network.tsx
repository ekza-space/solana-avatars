import { clusterApiUrl } from "@solana/web3.js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const SOLANA_CLUSTER_OPTIONS = ["localnet", "devnet", "mainnet-beta"] as const;
export type SolanaCluster = (typeof SOLANA_CLUSTER_OPTIONS)[number];

type SolanaNetworkContextValue = {
  cluster: SolanaCluster;
  clusterLabel: string;
  endpoint: string;
  setCluster: (cluster: SolanaCluster) => void;
  buildExplorerTxUrl: (signature: string) => string;
};

const SOLANA_NETWORK_STORAGE_KEY = "solana-avatars-cluster";
const CLUSTER_LABELS: Record<SolanaCluster, string> = {
  localnet: "Localnet",
  devnet: "Devnet",
  "mainnet-beta": "Mainnet",
};

const LOCAL_CLUSTER_FALLBACK = "http://127.0.0.1:8899";

function getPresetOverride(cluster: SolanaCluster): string | null {
  switch (cluster) {
    case "localnet":
      return import.meta.env.VITE_SOLANA_LOCALNET_RPC?.trim() || null;
    case "devnet":
      return import.meta.env.VITE_SOLANA_DEVNET_RPC?.trim() || null;
    case "mainnet-beta":
      return import.meta.env.VITE_SOLANA_MAINNET_RPC?.trim() || null;
    default:
      return null;
  }
}

function getDefaultClusterFromEnv(): SolanaCluster {
  const raw = import.meta.env.VITE_SOLANA_NETWORK?.trim().toLowerCase();
  if (raw === "mainnet" || raw === "mainnet-beta") {
    return "mainnet-beta";
  }
  if (raw === "devnet" || raw === "localnet") {
    return raw as SolanaCluster;
  }
  return "devnet";
}

function resolveEndpoint(cluster: SolanaCluster): string {
  const override = getPresetOverride(cluster);
  if (override) {
    return override;
  }

  if (cluster === "localnet") {
    return LOCAL_CLUSTER_FALLBACK;
  }

  if (cluster === "mainnet-beta") {
    return clusterApiUrl("mainnet-beta");
  }

  return clusterApiUrl(cluster);
}

function getStoredCluster(): SolanaCluster | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SOLANA_NETWORK_STORAGE_KEY)?.toLowerCase();
  if (raw === "mainnet" || raw === "mainnet-beta") {
    return "mainnet-beta";
  }

  if (raw === "devnet" || raw === "localnet") {
    return raw as SolanaCluster;
  }

  return null;
}

function buildExplorerTxUrl(cluster: SolanaCluster, endpoint: string, signature: string): string {
  const baseUrl = `https://explorer.solana.com/tx/${signature}`;
  const clusterParam = cluster === "localnet" ? "custom" : cluster;
  if (cluster === "localnet") {
    return `${baseUrl}?cluster=${clusterParam}&customUrl=${encodeURIComponent(endpoint)}`;
  }
  return `${baseUrl}?cluster=${clusterParam}`;
}

const SolanaNetworkContext = createContext<SolanaNetworkContextValue | null>(null);

export function SolanaNetworkProvider({ children }: { children: ReactNode }) {
  const [cluster, setClusterState] = useState<SolanaCluster>(getDefaultClusterFromEnv);

  useEffect(() => {
    const stored = getStoredCluster();
    if (stored && stored !== cluster) {
      setClusterState(stored);
    }
  }, [cluster]);

  const endpoint = useMemo(() => resolveEndpoint(cluster), [cluster]);
  const clusterLabel = CLUSTER_LABELS[cluster];

  const setCluster = (next: SolanaCluster) => {
    setClusterState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOLANA_NETWORK_STORAGE_KEY, next);
    }
  };

  const buildExplorerTxUrlForCluster = (signature: string) =>
    buildExplorerTxUrl(cluster, endpoint, signature);

  return (
    <SolanaNetworkContext.Provider
      value={{
        cluster,
        clusterLabel,
        endpoint,
        setCluster,
        buildExplorerTxUrl: buildExplorerTxUrlForCluster,
      }}
    >
      {children}
    </SolanaNetworkContext.Provider>
  );
}

export function useSolanaNetwork() {
  const context = useContext(SolanaNetworkContext);
  if (!context) {
    throw new Error("useSolanaNetwork must be used inside SolanaNetworkProvider");
  }
  return context;
}
