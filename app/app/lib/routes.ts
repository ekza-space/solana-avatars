export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** A Passport purchase is tied to Devnet regardless of old tool preferences. */
export function isPassportPurchaseRoute(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search);
  return normalizePathname(pathname) === "/minter" && params.get("network") === "devnet"
    && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(params.get("avatarData") || "");
}

export function isPassportPublicationRoute(pathname: string, search: string): boolean {
  return normalizePathname(pathname) === "/deployer" && new URLSearchParams(search).get("network") === "devnet";
}

export function isPublicAvatarToolPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === "/minter" || path === "/deployer";
}

export const LEGACY_TOOLS = [
  { to: "/web3/profile", label: "On-chain profile" },
  { to: "/minter", label: "NFT market" },
  { to: "/deployer", label: "Deploy collection" },
  { to: "/users", label: "On-chain users" },
] as const;

// A whitelist is deliberate: unknown pages and 404s must never become wallet gates.
export function isLegacyToolPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return LEGACY_TOOLS.some((route) => route.to === normalized);
}

export const AVATAR_STORE_NAV = [
  { to: "/passport", label: "Avatars" },
  { to: "/passport#my-avatars", label: "My avatars" },
  { to: "/deployer?network=devnet", label: "Publish" },
  { to: "/connect", label: "Connect app" },
] as const;
