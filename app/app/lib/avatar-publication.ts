import type { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";

const MAX_U64 = 18_446_744_073_709_551_615n;

/** Parse decimal inputs exactly before uploading files or opening a wallet. */
export function publicationTerms(input: { name: string; symbol: string; supply: string; price: string }) {
  const name = input.name.trim() || "3D Avatar";
  const symbol = input.symbol.trim() || "AVA3D";
  if (new TextEncoder().encode(name).length > 32) throw new Error("Avatar name must fit in 32 UTF-8 bytes.");
  if (new TextEncoder().encode(symbol).length > 10) throw new Error("Avatar symbol must fit in 10 UTF-8 bytes.");
  const supplyText = input.supply.trim() || "1";
  if (!/^\d+$/.test(supplyText)) throw new Error("Supply must be a positive whole number.");
  const supply = BigInt(supplyText);
  if (supply < 1n || supply > MAX_U64) throw new Error("Supply is outside the supported range.");
  const price = input.price.trim() || "0";
  if (!/^\d+(?:\.\d{1,9})?$/.test(price)) throw new Error("Enter a nonnegative SOL price with at most 9 decimal places.");
  const [whole, fraction = ""] = price.split(".");
  const lamports = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (lamports > MAX_U64) throw new Error("Price is outside the supported range.");
  return { name, symbol, maxSupply: supply.toString(), priceLamports: lamports.toString() };
}

export function requireCurrentPreview<T>(file: T | null, preview: { file: T; blob: Blob } | null): Blob {
  if (!file || !preview || preview.file !== file || preview.blob.size === 0 || preview.blob.type !== "image/png") {
    throw new Error("Wait for this model's preview image before publishing.");
  }
  return preview.blob;
}

/** Anchor may await account/blockhash reads before invoking the wallet. */
export async function signPublicationTransaction<T>(sign: () => Promise<T>, assertCurrent: () => void): Promise<T> {
  assertCurrent();
  const signed = await sign();
  assertCurrent();
  return signed;
}

/** Derive recovery identity from the transaction that is actually being signed,
 * never a fresh registry read whose next index may already have advanced. */
export function publicationAddressFromTransaction(
  transaction: Transaction | VersionedTransaction,
  programId: string,
  discriminator: readonly number[],
): string {
  if (discriminator.length !== 8) throw new Error("The publication instruction is unavailable.");
  const instructions = "instructions" in transaction
    ? transaction.instructions.map((instruction) => ({
      program: instruction.programId.toBase58(), data: instruction.data,
      address: instruction.keys[1]?.pubkey.toBase58(),
    }))
    : transaction.message.compiledInstructions.map((instruction) => ({
      program: transaction.message.staticAccountKeys[instruction.programIdIndex]?.toBase58(),
      data: instruction.data,
      address: transaction.message.staticAccountKeys[instruction.accountKeyIndexes[1]]?.toBase58(),
    }));
  const matches = instructions.filter((instruction) => instruction.program === programId
    && discriminator.every((byte, index) => instruction.data[index] === byte));
  if (matches.length !== 1 || !matches[0].address) {
    throw new Error("The publication transaction does not identify exactly one collection.");
  }
  return matches[0].address;
}

export type PublicationConfirmation = "confirmed" | "failed" | "pending";

export type PendingPublicationReceipt = { signature: string; address: string; network: string; wallet: string };
type PublicationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const pendingPublicationKey = (wallet: string, network: string) => `ekza.pending-publication.v1:${network}:${wallet}`;
const publicKeyPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateReceipt(value: unknown, wallet: string, network: string): PendingPublicationReceipt {
  const receipt = value as Partial<PendingPublicationReceipt> | null;
  if (!receipt || receipt.wallet !== wallet || receipt.network !== network
    || !publicKeyPattern.test(wallet) || !["devnet", "localnet", "mainnet-beta"].includes(network)
    || typeof receipt.address !== "string" || !publicKeyPattern.test(receipt.address)
    || typeof receipt.signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(receipt.signature)) {
    throw new Error("Saved publication recovery data is invalid. Inspect the original transaction before publishing again.");
  }
  return { signature: receipt.signature, address: receipt.address, network, wallet };
}

export function readPendingPublication(storage: PublicationStorage, wallet: string, network: string): PendingPublicationReceipt | null {
  const raw = storage.getItem(pendingPublicationKey(wallet, network));
  return raw === null ? null : validateReceipt(JSON.parse(raw), wallet, network);
}

/** Check storage before uploads or wallet approval. Never silently discard an
 * unresolved receipt when the browser refuses session storage. */
export function requirePublicationStorage(storage: PublicationStorage, wallet: string, network: string): void {
  const key = pendingPublicationKey(wallet, network);
  const original = storage.getItem(key);
  if (original !== null) {
    readPendingPublication(storage, wallet, network);
    storage.setItem(key, original);
  } else {
    storage.setItem(key, "null");
    if (storage.getItem(key) !== "null") throw new Error("Publication recovery storage is unavailable.");
    storage.removeItem(key);
  }
}

export function rememberPendingPublication(storage: PublicationStorage, value: PendingPublicationReceipt): void {
  const receipt = validateReceipt(value, value.wallet, value.network);
  const previous = readPendingPublication(storage, receipt.wallet, receipt.network);
  if (previous && previous.signature !== receipt.signature) throw new Error("Check the earlier publication before signing another one.");
  storage.setItem(pendingPublicationKey(receipt.wallet, receipt.network), JSON.stringify(receipt));
  if (readPendingPublication(storage, receipt.wallet, receipt.network)?.signature !== receipt.signature) throw new Error("Publication recovery could not be saved. The transaction was not submitted.");
}

export function clearPendingPublication(storage: PublicationStorage, receipt: PendingPublicationReceipt): void {
  if (readPendingPublication(storage, receipt.wallet, receipt.network)?.signature === receipt.signature) {
    storage.removeItem(pendingPublicationKey(receipt.wallet, receipt.network));
    if (readPendingPublication(storage, receipt.wallet, receipt.network)) throw new Error("Publication recovery could not be cleared.");
  }
}

/** The public transaction signature is recorded before returning signed bytes
 * to Anchor, so a refresh during submission or confirmation is recoverable. */
export function publicationSignatureBytes(transaction: Transaction | VersionedTransaction): Uint8Array {
  const signature = "signature" in transaction ? transaction.signature : transaction.signatures[0];
  if (!signature || signature.length !== 64 || !signature.some((byte) => byte !== 0)) throw new Error("The wallet did not return a signed publication.");
  return signature;
}

/** A read-only recovery check. Unknown/processed/transient states never allow
 * another publication, even after a wallet or network selection changes. */
export async function checkPublicationConfirmation(
  originalConnection: Pick<Connection, "getSignatureStatuses">,
  signature: string,
): Promise<PublicationConfirmation> {
  try {
    const response = await originalConnection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = response.value[0];
    if (!status || (status.confirmationStatus !== "confirmed" && status.confirmationStatus !== "finalized")) return "pending";
    return status.err ? "failed" : "confirmed";
  } catch {
    return "pending";
  }
}
