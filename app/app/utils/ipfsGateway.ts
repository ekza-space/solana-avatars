/**
 * Base URL for resolving IPFS CIDs in the browser (must end with `/`).
 *
 * - If `VITE_IPFS_GATEWAY` is set at build time, it wins (local .env or Vercel env).
 * - If localnet selected (via local storage) and `VITE_IPFS_GATEWAY_LOCALNET` is set, it wins.
 * - Otherwise: localnet defaults to `http://127.0.0.1:8787/_/uploads/`, dev server defaults to
 *   `http://localhost:8080/ipfs/`, production build defaults to ipfs.io.
 *
 * On Vercel, `.env` is not deployed unless you add variables in the dashboard;
 * without them, production must not fall back to localhost.
 */
export function getIpfsGatewayBase(): string {
    const envOverride = import.meta.env.VITE_IPFS_GATEWAY?.trim();
    if (envOverride) {
        return normalizeGatewayBase(envOverride);
    }

    const localCluster = getPersistedCluster();
    if (localCluster === "localnet") {
        const localOverride = import.meta.env.VITE_IPFS_GATEWAY_LOCALNET?.trim();
        if (localOverride) {
            return normalizeGatewayBase(localOverride);
        }
        return "http://127.0.0.1:8787/_/uploads/";
    }

    if (import.meta.env.DEV) {
        return "http://localhost:8080/ipfs/";
    }

    return "https://ipfs.io/ipfs/";
}

function normalizeGatewayBase(raw: string): string {
    const base = raw.trim();
    if (!base) return base;
    return base.endsWith("/") ? base : `${base}/`;
}

function getPersistedCluster():
  | "localnet"
  | "devnet"
  | "mainnet-beta"
  | null {
    if (typeof window === "undefined") return null;

    const raw = window.localStorage
        .getItem("solana-avatars-cluster")
        ?.toLowerCase()
        .trim();

    if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
    if (raw === "devnet" || raw === "localnet") return raw as
      | "devnet"
      | "localnet";

    return null;
}
