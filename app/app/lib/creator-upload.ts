import { forgetPassportSession, PassportApiError, readPassportSession, savePassportSession, signPassportSession, type PassportSession } from "./passport-client";

export async function creatorUploadSession(options: {
  wallet: string; network: string; isCurrent: () => boolean;
  signMessage?: (message: Uint8Array) => Promise<string>;
}): Promise<PassportSession> {
  if (options.network !== "devnet") throw new Error("Avatar Store uploads currently use Solana Devnet. Open the Devnet publication page to continue.");
  if (!options.isCurrent()) throw new Error("The wallet or network changed. Review the avatar and retry.");
  const saved = readPassportSession(options.wallet);
  if (saved) return saved;
  if (!options.signMessage) throw new Error("Use a wallet that can sign the Avatar Store verification message.");
  const session = await signPassportSession({ wallet: options.wallet, signMessage: options.signMessage, isCurrent: options.isCurrent });
  if (!session || !options.isCurrent()) throw new Error("The wallet or network changed. The avatar was not uploaded.");
  savePassportSession(session);
  return session;
}

export async function uploadCreatorContent<T>(body: FormData | object, session: PassportSession, isCurrent: () => boolean): Promise<T> {
  if (!isCurrent()) throw new Error("The wallet or network changed. The avatar was not uploaded.");
  const multipart = body instanceof FormData;
  const response = await fetch("/api/upload-metadata", {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(multipart ? {} : { "Content-Type": "application/json" }) },
    body: multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(70_000),
  });
  if (!isCurrent()) throw new Error("The wallet or network changed. Review the avatar and retry.");
  let value: any;
  try { value = await response.json(); } catch { throw new Error("Avatar storage returned an unreadable response. Please retry."); }
  if (!isCurrent()) throw new Error("The wallet or network changed. Review the avatar and retry.");
  if (!response.ok) {
    if (response.status === 401) forgetPassportSession(session);
    throw new PassportApiError(response.status, typeof value?.error === "string" ? value.error : "Avatar upload failed. Please retry.");
  }
  return value as T;
}
