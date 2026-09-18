export const STUDIO_VIEWS = [
  "catalog",
  "library",
  "uploads",
  "review",
  "new",
  "account",
] as const;
export type StudioView = (typeof STUDIO_VIEWS)[number];

export function isStudioView(value: string | null): value is StudioView {
  return value !== null && (STUDIO_VIEWS as readonly string[]).includes(value);
}

export function parseStudioView(search: string | URLSearchParams): StudioView {
  const value = new URLSearchParams(search).get("view");
  return isStudioView(value) ? value : "catalog";
}

export function studioHref(view: StudioView): string {
  return `/studio?view=${view}`;
}

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

// Authentication and redirects never accept arbitrary destinations or tokens.
export function studioRedirectTarget(search: string | URLSearchParams): string {
  const source = new URLSearchParams(search);
  const safe = new URLSearchParams();
  const view = source.get("view");
  if (isStudioView(view)) safe.set("view", view);
  const auth = source.get("auth");
  if (auth === "signin" || auth === "signup") safe.set("auth", auth);
  const returnTo = source.get("returnTo");
  if (isStudioView(returnTo) && returnTo !== "account")
    safe.set("returnTo", returnTo);
  const query = safe.toString();
  return query ? `/studio?${query}` : "/studio";
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

export const STUDIO_NAV = [
  { view: "catalog", label: "Discover" },
  { view: "library", label: "My library" },
  { view: "uploads", label: "My uploads" },
  { view: "account", label: "Account" },
] as const;

export const AVATAR_STORE_NAV = [
  { to: "/passport", label: "Avatars" },
  { to: "/passport#my-avatars", label: "My avatars" },
  { to: "/deployer?network=devnet", label: "Publish" },
  { to: "/connect", label: "Connect app" },
] as const;
