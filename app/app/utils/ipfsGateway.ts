import { isPassportPublicationRoute, isPassportPurchaseRoute } from "~/lib/routes";

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
/** CORS-enabled gateway used when no override is configured (e.g. on Vercel). */
export const DEFAULT_PUBLIC_IPFS_GATEWAY = "https://ekza.mypinata.cloud/ipfs/";

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

  // Public ipfs.io answers 403 without CORS headers, so the browser drops every
  // metadata/image request and the gallery renders empty. Fall back to the
  // project's own pinning gateway, which serves CORS-enabled responses.
  return DEFAULT_PUBLIC_IPFS_GATEWAY;
}

function normalizeGatewayBase(raw: string): string {
  const base = raw.trim();
  if (!base) return base;
  return base.endsWith("/") ? base : `${base}/`;
}

function getPersistedCluster(): "localnet" | "devnet" | "mainnet-beta" | null {
  if (typeof window === "undefined") return null;

  if (isPassportPurchaseRoute(window.location.pathname, window.location.search) || isPassportPublicationRoute(window.location.pathname, window.location.search)) return "devnet";

  const raw = window.localStorage
    .getItem("solana-avatars-cluster")
    ?.toLowerCase()
    .trim();

  if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
  if (raw === "devnet" || raw === "localnet")
    return raw as "devnet" | "localnet";

  return null;
}
