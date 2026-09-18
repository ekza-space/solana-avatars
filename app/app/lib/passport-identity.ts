import { passportRequest, PROJECT_NAMES } from "./passport-client";

export type IdentityDevice = {
  userCode: string; projectId: keyof typeof PROJECT_NAMES; purpose: "identity"; expiresAt: string;
};
export function validateIdentityDevice(value: IdentityDevice, code: string): IdentityDevice {
  if (value.purpose !== "identity" || !Object.hasOwn(PROJECT_NAMES, value.projectId) || value.userCode !== code
    || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
    throw new Error("This code is not an active identity verification. Start again in your app.");
  }
  return value;
}

/** No browser credential is persisted and no avatar or ownership API is called. */
export async function approveIdentity(options: {
  wallet: string; device: IdentityDevice; signMessage: (message: Uint8Array) => Promise<string>;
  isCurrent: () => boolean; request?: typeof passportRequest;
}): Promise<boolean> {
  const { wallet, device, isCurrent } = options;
  const request = options.request ?? passportRequest;
  validateIdentityDevice(device, device.userCode);
  const challenge = await request<{ challengeId: string; message: string; projectId: string; purpose: string }>("challenge", { wallet, userCode: device.userCode });
  if (!isCurrent()) return false;
  if (challenge.projectId !== device.projectId || challenge.purpose !== "identity"
    || !challenge.message.split("\n").includes(`Purpose: approve-device:${device.projectId}:${device.userCode}:identity-only`)) {
    throw new Error("The verification purpose changed. Start again in your app.");
  }
  const signature = await options.signMessage(new TextEncoder().encode(challenge.message));
  if (!isCurrent()) return false;
  const session = await request<{ wallet: string }>("session", { challengeId: challenge.challengeId, signature });
  if (!isCurrent()) return false;
  if (session.wallet !== wallet) throw new Error("The wallet changed. Start again in your app.");
  return true;
}
