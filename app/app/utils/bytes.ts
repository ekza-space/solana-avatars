

/**
 * Byte-array helpers shared across the app.
 * These functions keep the encode / decode rules in one place so that both
 * UI components and on‑chain interaction code remain in sync.
 */

/**
 * Convert a `Vec<u8>` (returned from an on‑chain account) into a clean UTF‑8
 * string, trimming everything after the first zero‑byte (0x00) terminator.
 */
export const decodeByteArray = (input: number[] | Uint8Array): string => {
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
  const firstZero = bytes.indexOf(0);
  const view = firstZero === -1 ? bytes : bytes.subarray(0, firstZero);
  return new TextDecoder("utf-8").decode(view);
};

/**
 * Encode a regular string as a plain `number[]` so it can be stored in the
 * fixed‑size byte fields of the `userProfile` account.
 */
export const encodeString = (input: string): number[] =>
  Array.from(new TextEncoder().encode(input));