/**
 * Base URL for resolving IPFS CIDs in the browser (must end with `/`).
 *
 * - Localnet always uses the local gateway override/default first.
 * - Otherwise `VITE_IPFS_GATEWAY` wins.
 * - Localnet/dev default to the app server proxy so browsers never talk to
 *   Kubo directly.
 *
 * On Vercel, `.env` is not deployed unless you add variables in the dashboard;
 * without them, production must not fall back to localhost.
 */
export function getIpfsGatewayBase(): string {
  const localCluster = getPersistedCluster();
  if (localCluster === "localnet") {
    const localOverride = import.meta.env.VITE_IPFS_GATEWAY_LOCALNET?.trim();
    if (localOverride) {
      return normalizeGatewayBase(localOverride);
    }
    return "/api/ipfs/";
  }

  const envOverride = import.meta.env.VITE_IPFS_GATEWAY?.trim();
  if (envOverride) {
    return normalizeGatewayBase(envOverride);
  }

  if (import.meta.env.DEV) {
    return "/api/ipfs/";
  }

  return "https://ipfs.io/ipfs/";
}

function normalizeGatewayBase(raw: string): string {
  const base = raw.trim();
  if (!base) return base;
  return base.endsWith("/") ? base : `${base}/`;
}

function getPersistedCluster(): "localnet" | "devnet" | "mainnet-beta" | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage
    .getItem("solana-avatars-cluster")
    ?.toLowerCase()
    .trim();

  if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
  if (raw === "devnet" || raw === "localnet")
    return raw as "devnet" | "localnet";

  return null;
}
