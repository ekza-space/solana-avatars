/** Resolve an explicit AvatarData address, including templates without Stellar links. */
export async function loadSelectedAvatar<T extends { index: { toNumber(): number } }>(
  address: string,
  read: (address: string) => Promise<T>,
  deriveAddress: (index: number) => string,
): Promise<{ index: number; data: T; avatarData: string }> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error("The avatar collection address is invalid.");
  const data = await read(address);
  const index = data.index.toNumber();
  if (!Number.isSafeInteger(index) || index < 0 || deriveAddress(index) !== address) throw new Error("The collection does not match its canonical avatar address.");
  return { index, data, avatarData: address };
}

export type PendingPurchase = { wallet: string; network: string; index: number; signature: string };
const pendingKey = (wallet: string, network: string) => `ekza.pending-purchase.v1:${network}:${wallet}`;
export function readPendingPurchase(wallet: string, network: string): PendingPurchase | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey(wallet, network)) || "null");
    return value?.wallet === wallet && value?.network === network && Number.isSafeInteger(value.index) && value.index >= 0 && /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value.signature) ? value : null;
  } catch { return null; }
}
export function rememberPendingPurchase(value: PendingPurchase) {
  try { sessionStorage.setItem(pendingKey(value.wallet, value.network), JSON.stringify(value)); } catch { /* In-memory recovery remains available when storage is disabled. */ }
}
export function clearPendingPurchase(value: PendingPurchase) {
  try { if (readPendingPurchase(value.wallet, value.network)?.signature === value.signature) sessionStorage.removeItem(pendingKey(value.wallet, value.network)); } catch { /* Storage may be unavailable. */ }
}

/** Capture recovery before any signed bytes become available for broadcast. */
export async function signPurchaseForCurrentWallet<T>(transaction: T, sign: (transaction: T) => Promise<T>, isCurrent: () => boolean, capture: (signed: T) => void): Promise<T> {
  if (!isCurrent()) throw new Error("The wallet changed. Start the purchase again.");
  const signed = await sign(transaction);
  if (!isCurrent()) throw new Error("The wallet changed. The purchase was not submitted.");
  capture(signed);
  return signed;
}
