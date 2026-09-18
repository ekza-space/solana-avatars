#!/usr/bin/env node
/** Local rehearsal supervisor. No deployments, wallet reads, mints or installs. */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const umbrella = path.dirname(repo);
const fixture = path.join(repo, "demo/avatar-roundtrip");
const core = path.join(umbrella, "core");
const mirror = path.join(umbrella, "ekza-mirror");
const omoba = path.resolve(process.env.OMOBA_CHECKOUT || path.join(umbrella, "omoba-bevy-avatar-roundtrip"));
const action = process.argv[2] || "--help";
const storeOrigin = "http://127.0.0.1:5190";
const spaceOrigin = "http://127.0.0.1:7110";
const registryOrigin = "http://127.0.0.1:8019";
const state = path.join(repo, ".avatar-roundtrip-local");
const cache = path.join(omoba, ".agent/tasks/AVATAR-ROUNDTRIP-20260911/build-cache");
const target = process.env.CARGO_TARGET_DIR ? path.resolve(omoba, process.env.CARGO_TARGET_DIR) : (existsSync(cache) ? cache : path.join(omoba, "target"));
const binary = (name) => path.join(target, "debug", name);
const roster = path.join(fixture, "omoba-roster.json");
const model = "546ddea729486de56289aef537a16bc716c7085dd93f31c66fd9ab3d740783c2.glb";
const slug = "ekza-dbd08c9e5440ce0e45556e44468cdbe037e61c8d9a712d1d4ad4167db75d4868";

function check() {
  const catalog = JSON.parse(readFileSync(path.join(fixture, "catalog.json"), "utf8"));
  const purchase = JSON.parse(readFileSync(path.join(fixture, "purchase.public.json"), "utf8"));
  if (catalog.items.length !== 1 || catalog.items[0].id !== purchase.avatarId || purchase.creatorPaymentLamports !== "1000000") throw new Error("The public fixture does not identify the verified paid purchase.");
  const item = catalog.items[0];
  if (item.renditions.length !== 3 || item.projectSupport.length !== 3) throw new Error("The rehearsal requires exactly three approved project renditions.");
  for (const [projectId, platform, profile, format] of [["ekza-space", "universal", "vrm-humanoid-v0", "vrm0"], ["ekza-mirror", "ios", "arkit-body-v1", "usdz"], ["omoba", "desktop", "humanoid-glb-v1", "glb"]]) {
    if (item.projectSupport.filter((entry) => entry.projectId === projectId && entry.platform === platform && entry.profile === profile && entry.status === "approved").length !== 1 || item.renditions.filter((entry) => entry.platform === platform && entry.profile === profile && entry.format === format && entry.status === "ready").length !== 1) throw new Error(`The fixture is missing the approved ${projectId} rendition.`);
  }
  for (const rendition of catalog.items[0].renditions) {
    const filename = path.posix.basename(rendition.assetPath || "");
    if (!filename || rendition.assetPath !== `/v1/assets/${filename}`) throw new Error("Fixture must use its allowlisted local assets.");
    const bytes = readFileSync(path.join(fixture, "assets", filename));
    if (bytes.length !== rendition.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== rendition.sha256) throw new Error(`Fixture checksum mismatch: ${filename}`);
  }
  for (const dir of [core, mirror, omoba, path.join(umbrella, "ekza-stellar-sdk"), path.join(umbrella, "ekza-bevy-sdk")]) if (!existsSync(dir)) throw new Error(`Required checkout missing: ${dir}`);
  console.log("Public devnet fixture: canonical purchase + 3 exact model files verified.");
}

function rpcUrl() {
  if (process.env.EKZA_PASSPORT_RPC_URL) return process.env.EKZA_PASSPORT_RPC_URL;
  // Reuse the explicitly devnet-scoped local setting without displaying it.
  const source = path.join(core, ".env.devnet.local");
  if (existsSync(source)) {
    const require = createRequire(path.join(core, "package.json"));
    const parsed = require("dotenv").parse(readFileSync(source));
    if (parsed.VITE_SOLANA_RPC_URL_DEVNET) return parsed.VITE_SOLANA_RPC_URL_DEVNET;
  }
  return "https://api.devnet.solana.com";
}

function creatorUploadEnv() {
  if (process.env.PINATA_JWT) return { PINATA_JWT: process.env.PINATA_JWT };
  // The compiled server does not load Vite's development .env files. Pass only
  // this already configured upload credential; never import wallet/deploy keys.
  const source = path.join(repo, "app/.env");
  if (existsSync(source)) {
    const require = createRequire(path.join(core, "package.json"));
    const parsed = require("dotenv").parse(readFileSync(source));
    if (parsed.PINATA_JWT?.trim()) return { PINATA_JWT: parsed.PINATA_JWT.trim() };
  }
  console.warn("Creator uploads need an existing PINATA_JWT setting. Catalogue and purchased avatars remain available.");
  return {};
}

const children = [];
let stopping = false;
function launch(command, args, cwd, env = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit", detached: true });
  children.push(child);
  child.on("error", () => { console.error(`Could not start ${path.basename(command)}. Check installed tools and builds.`); stop(1); });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.pid && child.exitCode === null) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ } }
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
async function run(command, args, cwd, env = {}) {
  const child = launch(command, args, cwd, env);
  const code = await new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", () => reject(new Error(`Could not start ${path.basename(command)}.`)));
  });
  if (code !== 0) throw new Error(`${path.basename(command)} failed (${code}).`);
}
async function portFree(port) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
}
const gameEnv = { OMOBA_PASSPORT_URL: `${storeOrigin}/api/passport`, OMOBA_AVATAR_MANIFEST: roster, OMOBA_CLIENT_CONFIG_DIR: path.join(state, "omoba-client"), CARGO_TARGET_DIR: target };

async function main() {
  if (action === "--help") {
    console.log("Usage: node scripts/avatar-roundtrip.mjs --check | --build | --serve | --omoba\n--check validates only public fixture files.\n--build builds installed sibling SDK, web clients and native game.\n--serve runs local registry8019 + store5190 + Space7110 + Omoba server4018 until Ctrl+C.\n--omoba opens the native game and prints a wallet pairing code.\nNo command reads a wallet, sends a transaction, installs dependencies, or deploys a service."); return;
  }
  check();
  if (action === "--check") return;
  if (action === "--build") {
    await run("npm", ["run", "build"], path.join(umbrella, "ekza-stellar-sdk"));
    await run("npm", ["run", "build"], core, { VITE_PASSPORT_ORIGIN: storeOrigin });
    await run("npm", ["run", "build"], path.join(repo, "app"), { VITE_EKZA_SPACE_URL: spaceOrigin });
    await run("cargo", ["build", "-p", "client", "-p", "server", "-p", "omoba-passport"], omoba, { CARGO_TARGET_DIR: target });
    return;
  }
  if (!["--serve", "--omoba"].includes(action)) throw new Error("Unknown action. Use --help.");
  mkdirSync(state, { recursive: true });
  const modelTarget = path.join(omoba, "client/assets/avatars", `${slug}.glb`);
  if (existsSync(modelTarget) && createHash("sha256").update(readFileSync(modelTarget)).digest("hex") !== model.slice(0, 64)) throw new Error("Installed paid model differs from the approved fixture; inspect before replacing it.");
  if (!existsSync(modelTarget)) copyFileSync(path.join(fixture, "assets", model), modelTarget);
  if (action === "--omoba") {
    await run(binary("client"), [], omoba, { ...gameEnv, OMOBA_PASSPORT_CONNECT: "1", GAME_SERVER_ADDR: "127.0.0.1:4018" }); return;
  }
  for (const port of [5190, 7110, 8019]) if (!await portFree(port)) throw new Error(`Local port ${port} is in use. Stop the earlier rehearsal first; this script never kills unrelated processes.`);
  if (!existsSync(binary("server"))) throw new Error("Build the native server with --build first.");
  const registry = launch(path.join(mirror, "backend/.venv/bin/python"), ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8019"], path.join(mirror, "backend"), {
    EKZA_CATALOG_PATH: path.join(fixture, "catalog.json"), EKZA_ASSET_DIR: path.join(fixture, "assets"), EKZA_PUBLISHED_DIR: path.join(state, "published"), EKZA_QUARANTINE_DIR: path.join(state, "quarantine"), EKZA_PUBLIC_BASE_URL: registryOrigin,
  });
  const store = launch("npm", ["start"], path.join(repo, "app"), {
    ...creatorUploadEnv(),
    PORT: "5190", HOST: "127.0.0.1", EKZA_PASSPORT_ORIGIN: storeOrigin, EKZA_PASSPORT_ALLOW_LOCALHOST: "1", EKZA_PASSPORT_RPC_URL: rpcUrl(), EKZA_PASSPORT_REGISTRY_URL: `${registryOrigin}/v1/avatars`, EKZA_PASSPORT_ALLOWED_ORIGINS: spaceOrigin,
    EKZA_STUDIO_API_URL: `${registryOrigin}/v1/studio`, EKZA_STUDIO_PUBLIC_API_URL: `${registryOrigin}/v1/studio`, EKZA_STUDIO_SPACE_URL: spaceOrigin,
  });
  const space = launch("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "7110"], core, { VITE_PASSPORT_ORIGIN: storeOrigin });
  const game = launch(binary("server"), [], omoba, { ...gameEnv, SERVER_ADDR: "127.0.0.1:4018", OMOBA_MATCH_MODE: "dev" });
  for (const child of [registry, store, space, game]) child.once("exit", (code) => stop(code ?? 1));
  console.log(`Open ${storeOrigin}/passport · Space ${spaceOrigin}/space/1 · launch Omoba separately with --omoba.`);
}
main().catch((error) => { console.error(error.message); stop(1); });
