/** Browser-only state: wallet signatures and bearer sessions never enter links. */
export type PassportSession = { accessToken: string; wallet: string; expiresAt: string };
export type ProjectSupport = {
  projectId: "ekza-space" | "ekza-mirror" | "omoba";
  platform: string;
  profile: string;
  status: "approved";
  rendition: { id: string; url: string; sha256: string; sizeBytes: number; format: string };
};
export type CatalogAvatar = { avatarId: string; name: string; thumbnailUrl: string; support: ProjectSupport[] };
export type PurchasedAvatar = CatalogAvatar & { mint: string; priceLamports?: string };
export const PROJECT_NAMES = { "ekza-space": "Ekza Space", "ekza-mirror": "Ekza Mirror", omoba: "Omoba" };
const SESSION_KEY = "ekza.passport.session.v1";

export class PassportApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "PassportApiError"; }
}

export async function passportRequest<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`/api/passport/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "omit", cache: "no-store", redirect: "error",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  let value;
  try { value = await response.json(); }
  catch { throw new PassportApiError(response.status, "The avatar service is unavailable. Please retry."); }
  if (!response.ok) throw new PassportApiError(response.status, typeof value?.error === "string" ? value.error : "The avatar service is unavailable. Please retry.");
  return value as T;
}

export function readPassportSession(wallet: string): PassportSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return value && value.wallet === wallet && typeof value.accessToken === "string" && Date.parse(value.expiresAt) > Date.now() ? value : null;
  } catch { return null; }
}

export function savePassportSession(value: PassportSession | null) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* Signing in still works for this mounted page in private mode. */ }
}

/** A delayed failure from an old request must not remove a newer login. */
export function forgetPassportSession(expected: PassportSession) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (saved?.accessToken === expected.accessToken && saved?.wallet === expected.wallet) sessionStorage.removeItem(SESSION_KEY);
  } catch { /* Storage may be unavailable in private mode. */ }
}

/** The caller invalidates isCurrent on wallet, code, navigation or attempt changes. */
export async function signPassportSession(options: {
  wallet: string;
  device?: { userCode: string; projectId: keyof typeof PROJECT_NAMES };
  signMessage: (message: Uint8Array) => Promise<string>;
  isCurrent: () => boolean;
}): Promise<PassportSession | null> {
  const { wallet, device, isCurrent } = options;
  const challenge = await passportRequest<{ challengeId: string; message: string; projectId?: string }>("challenge", { wallet, ...(device ? { userCode: device.userCode } : {}) });
  if (!isCurrent()) return null;
  if (device && challenge.projectId !== device.projectId) throw new Error("The application changed. Start pairing again.");
  const signature = await options.signMessage(new TextEncoder().encode(challenge.message));
  if (!isCurrent()) return null;
  const session = await passportRequest<PassportSession>("session", { challengeId: challenge.challengeId, signature });
  if (!isCurrent()) return null;
  if (session.wallet !== wallet) throw new Error("The wallet changed. Sign in again.");
  return session;
}

export function avatarTemplateAddress(avatarId: string): string | null {
  return /^solana:devnet:avatar-data:([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(avatarId)?.[1] || null;
}

export function passportPurchaseHref(avatarId: string): string | null {
  const address = avatarTemplateAddress(avatarId);
  return address ? `/minter?avatarData=${address}&network=devnet` : null;
}
