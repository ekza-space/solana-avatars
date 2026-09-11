#!/usr/bin/env node
"use strict";
// Live HTTP acceptance against a configured local passport, the actual devnet
// fixture NFT, and published model bytes. Test wallet material stays on disk.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bs58 = require("bs58");
const args = process.argv.slice(2);
function option(key, fallback) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; }
const stateDir = option("--state-dir", "");
const base = option("--base", "http://127.0.0.1:5190/api/passport").replace(/\/$/, "");
const approveCode = option("--approve-code", "");
const output = option("--output", "");
const apiUrl = new URL(base);
if (apiUrl.protocol !== "https:" && !(apiUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname))) throw new Error("Unsafe passport origin.");
if (!stateDir) throw new Error("Provide --state-dir from the explicit devnet fixture.");
const fixture = JSON.parse(fs.readFileSync(path.join(stateDir, "fixture.public.json"), "utf8"));
const privateFile = path.join(stateDir, "test-wallets.private.json");
const stat = fs.lstatSync(privateFile);
if (stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("Unsafe private fixture file.");
const privateKeys = JSON.parse(fs.readFileSync(privateFile, "utf8"));
const report = { schema: "ekza.passport.live-proof.v1", startedAt: new Date().toISOString(), network: "solana-devnet", avatarId: fixture.avatarId, mint: fixture.mint, purchaseSignature: fixture.purchaseSignature, checks: [] };
async function request(endpoint, body, token, expected = 200) {
  const response = await fetch(`${base}/${endpoint}`, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(90_000) });
  const payload = await response.json();
  if (response.status !== expected) throw new Error(`${endpoint}: expected ${expected}, got ${response.status}: ${payload.error || "Unexpected response"}`);
  return payload;
}
async function signIn(role, userCode) {
  const wallet = fixture[role], challenge = await request("challenge", { wallet, ...(userCode ? { userCode } : {}) });
  if (!challenge.message.includes(`URI: ${apiUrl.origin}`) || !challenge.message.includes("Network: solana-devnet") || !challenge.message.includes(wallet)) throw new Error("Challenge has wrong issuer/network/wallet.");
  const seed = Buffer.from(privateKeys[role]).subarray(0, 32);
  const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  const signature = bs58.encode(crypto.sign(null, Buffer.from(challenge.message), key));
  const session = await request("session", { challengeId: challenge.challengeId, signature });
  if (session.wallet !== wallet) throw new Error("Authenticated wrong wallet.");
  return session;
}
async function main() {
  if (approveCode) {
    const device = await request(`device?userCode=${encodeURIComponent(approveCode)}`);
    await signIn("buyer", device.userCode);
    console.log(JSON.stringify({ status: "approved", projectId: device.projectId, wallet: fixture.buyer })); return;
  }
  if (fixture.status !== "verified-on-chain" || fixture.creatorPaymentLamports !== "1000000") throw new Error("A real verified positive-price purchase is required before HTTP acceptance.");
  const catalog = await request("catalog");
  if (!catalog.items.some((item) => item.avatarId === fixture.avatarId)) throw new Error("Publish the paid fixture's catalogue first.");
  const buyer = await signIn("buyer"), outsider = await signIn("nonOwner");
  // Run this against a freshly started server to prove on-demand provenance
  // reconstruction before the explicit receipt fast path populates any cache.
  const discovered = await request("library", undefined, buyer.accessToken);
  if (!discovered.items.some((item) => item.avatarId === fixture.avatarId && item.mint === fixture.mint && item.priceLamports === "1000000")) throw new Error("Purchase discovery failed before explicit receipt submission.");
  report.checks.push({ check: "library-before-explicit-receipt", result: "pass" });
  const receipt = await request("receipt", { signature: fixture.purchaseSignature }, buyer.accessToken);
  if (!receipt.receipts.some((entry) => entry.mint === fixture.mint && entry.priceLamports === "1000000")) throw new Error("Receipt did not prove the actual positive-price purchase.");
  report.checks.push({ check: "real-paid-receipt", result: "pass", priceLamports: "1000000" });
  const library = await request("library", undefined, buyer.accessToken);
  const avatar = library.items.find((item) => item.avatarId === fixture.avatarId && item.mint === fixture.mint);
  if (!avatar) throw new Error("Buyer cannot find actual purchase in library.");
  report.checks.push({ check: "buyer-library", result: "pass" });
  const outsiderLibrary = await request("library", undefined, outsider.accessToken);
  if (outsiderLibrary.items.some((item) => item.mint === fixture.mint)) throw new Error("Non-owner received bought avatar.");
  await request("receipt", { signature: fixture.purchaseSignature }, outsider.accessToken, 403);
  report.checks.push({ check: "non-owner-library-and-receipt-denied", result: "pass" });
  for (const projectId of ["ekza-space", "ekza-mirror", "omoba"]) {
    const support = avatar.support.find((item) => item.projectId === projectId);
    if (!support) { report.checks.push({ check: projectId, result: "pending", reason: "No approved project rendition published yet" }); continue; }
    const sessionId = crypto.randomUUID();
    const choice = { projectId, avatarId: fixture.avatarId, mint: fixture.mint, sessionId };
    await request("ticket", choice, outsider.accessToken, 403);
    const grant = await request("ticket", choice, buyer.accessToken);
    await request("ticket/consume", { ticket: grant.ticket, projectId, sessionId: "wrong-session" }, undefined, 403);
    const allowed = await request("ticket/consume", { ticket: grant.ticket, projectId, sessionId });
    if (allowed.avatarId !== fixture.avatarId || allowed.mint !== fixture.mint || allowed.wallet !== fixture.buyer) throw new Error("Wrong avatar or owner at consumption.");
    await request("ticket/consume", { ticket: grant.ticket, projectId, sessionId }, undefined, 401);
    const response = await fetch(allowed.support.rendition.url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${projectId} asset unavailable`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== allowed.support.rendition.sizeBytes || crypto.createHash("sha256").update(bytes).digest("hex") !== allowed.support.rendition.sha256) throw new Error(`${projectId} asset bytes do not match approval`);
    const device = await request("device", { projectId });
    const pending = await request("device/poll", { deviceCode: device.deviceCode });
    if (pending.status !== "pending") throw new Error("New device was already approved.");
    await signIn("buyer", device.userCode);
    const paired = await request("device/poll", { deviceCode: device.deviceCode });
    if (paired.status !== "approved" || paired.wallet !== fixture.buyer) throw new Error("Device did not receive buyer session.");
    const otherProject = projectId === "omoba" ? "ekza-mirror" : "omoba";
    await request("ticket", { ...choice, projectId: otherProject }, paired.accessToken, 403);
    report.checks.push({ check: projectId, result: "pass", profile: support.profile, format: support.rendition.format, sha256: support.rendition.sha256, sizeBytes: bytes.length, proves: "Live entitlement, one-use ticket, owner denial, paired session scope and exact model bytes; visual rendering is checked separately." });
  }
  report.completedAt = new Date().toISOString();
  report.result = report.checks.every((check) => check.result === "pass") ? "pass" : "partial";
  if (report.result !== "pass") process.exitCode = 1;
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
