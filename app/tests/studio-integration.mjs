// Opt-in LOCAL rehearsal only:
// node tests/studio-integration.mjs /absolute/path/to/launcher/demo.json
// Add --preflight for bounded read-only URL/sample/SSR/Space readiness checks.
// Creates ONE retained test avatar/account; never deletes or unpublishes data.
// This verifies real HTTP/Auth/Storage/processing contracts, NOT browser clicks,
// WebGL rendering, content rights, or physical-device AR behavior.
/* global globalThis */
import { createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import {
  decodeViaTurboStream,
  singleFetchUrl,
} from "@remix-run/react/dist/single-fetch.js";

const ROBERT_SOURCE =
  "5e3edaf330577ee4c3f6440b8989af3722e7c800bb90eb037f1c05cdfe61fd7c";
const ROBERT_IOS =
  "044df769160a581e95706c3a0ed395a13ef5757ed4ac66c692b1809fcc203434";
const ROBERT_IOS_SIZE = 853959;
const JSON_LIMIT = 4 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const contexts = {
  creator: { cookies: new Map() },
  moderator: { cookies: new Map() },
  other: { cookies: new Map() },
};
let origin;
let fixtureId;
let revisionId;
let completed = false;
let stage = "local preflight";

function check(condition, message) {
  // Static messages only: assertion libraries may echo actual tokens/passwords.
  if (!condition) throw new Error(message);
}
function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function compiledShell(markup, mode, description) {
  if (mode !== "compiled") return;
  check(
    !/@vite\/client|@react-refresh|node_modules\/\.vite\/deps|__vite_plugin_react_preamble_installed__/.test(
      markup
    ),
    description + " must not depend on a development/HMR server"
  );
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Native JSON.parse errors may echo a payload fragment containing a secret.
    throw new Error(
      "A bounded configuration or server response is not valid JSON"
    );
  }
}
function loopback(value, description) {
  const url = new URL(value);
  check(
    ["127.0.0.1", "localhost"].includes(url.hostname),
    description + " must use loopback"
  );
  check(
    ["http:", "https:"].includes(url.protocol),
    description + " must use HTTP(S)"
  );
  check(
    !url.username && !url.password && !url.hash,
    description + " must not contain credentials/fragments"
  );
  return url;
}
async function localFile(path, limit) {
  const metadata = await lstat(path);
  check(
    metadata.isFile() && !metadata.isSymbolicLink(),
    "Local fixture files must be regular files"
  );
  check(
    metadata.size > 0 && metadata.size <= limit,
    "Local fixture file exceeds its size bound"
  );
  return new Uint8Array(await readFile(path));
}
function cookieHeader(context) {
  return [...context.cookies]
    .map(([name, value]) => name + "=" + value)
    .join("; ");
}
function responseCookies(response) {
  return response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") || "")
        .split(/, (?=ekza_studio_)/)
        .filter(Boolean);
}
function rememberCookies(context, response) {
  if (!context) return;
  for (const cookie of responseCookies(response)) {
    const pair = cookie.split(";")[0];
    const equals = pair.indexOf("=");
    check(equals > 0, "Malformed session cookie");
    const name = pair.slice(0, equals);
    check(
      /^ekza_studio_[a-z]+(?:\.[0-2])?$/.test(name),
      "Unexpected cookie from Studio BFF"
    );
    check(
      /;\s*HttpOnly\b/i.test(cookie),
      "Studio auth cookies must be HttpOnly"
    );
    check(
      /;\s*SameSite=Lax\b/i.test(cookie),
      "Studio auth cookies must use SameSite=Lax"
    );
    check(
      /;\s*Path=\/api\/studio(?:;|$)/i.test(cookie),
      "Auth cookies must be scoped to the BFF"
    );
    if (/;\s*Max-Age=0(?:;|$)/i.test(cookie)) context.cookies.delete(name);
    else context.cookies.set(name, pair.slice(equals + 1));
  }
}
async function request(url, options = {}, expected = 200) {
  const safe = loopback(url, "HTTP request");
  const response = await fetch(safe, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(30000),
    ...options,
  });
  check(
    response.status === expected,
    "Unexpected HTTP status for " +
      safe.pathname +
      ": expected " +
      expected +
      ", got " +
      response.status
  );
  return response;
}
async function bytes(response, limit) {
  check(response.body, "Response body is missing");
  const length = response.headers.get("content-length");
  if (length !== null)
    check(
      /^\d+$/.test(length) && Number(length) <= limit,
      "Response exceeds declared size bound"
    );
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      check(size <= limit, "Streamed response exceeds size bound");
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
async function json(response) {
  check(
    /^application\/json\b/i.test(response.headers.get("content-type") || ""),
    "Expected JSON response"
  );
  const value = parseJson(
    new TextDecoder().decode(await bytes(response, JSON_LIMIT))
  );
  function noSecrets(item) {
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      check(
        ![
          "token",
          "refreshToken",
          "access_token",
          "refresh_token",
          "password",
        ].includes(key),
        "Credentials must never appear in browser JSON"
      );
      noSecrets(child);
    }
  }
  noSecrets(value);
  return value;
}
async function call(
  path,
  method = "GET",
  body,
  context,
  expected = 200,
  headers = {}
) {
  check(
    !path.startsWith("/") && !path.includes("..") && !path.includes("\\"),
    "Invalid BFF test path"
  );
  const target = new URL("/api/studio/" + path, origin);
  const response = await request(
    target,
    {
      method,
      headers: {
        Origin: origin,
        ...(context ? { Cookie: cookieHeader(context) } : {}),
        ...(body !== undefined
          ? {
              "Content-Type":
                body instanceof Uint8Array
                  ? "application/octet-stream"
                  : "application/json",
            }
          : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
    },
    expected
  );
  check(
    response.headers.get("cache-control") === "no-store",
    "Studio responses must not cache account data"
  );
  rememberCookies(context, response);
  return response;
}
async function signIn(account, context, expectedRole) {
  check(
    account &&
      typeof account.email === "string" &&
      typeof account.password === "string",
    "Required local rehearsal account is missing"
  );
  const result = await json(
    await call(
      "sessions",
      "POST",
      { email: account.email, password: account.password },
      context
    )
  );
  check(
    result.user.role === expectedRole,
    "Supabase role differs from the expected account role"
  );
  check(
    context.cookies.has("ekza_studio_session.0") &&
      context.cookies.has("ekza_studio_refresh.0"),
    "Access and refresh cookies are both required"
  );
  return result.user;
}
function remixContext(markup) {
  const start = markup.search(/window\.__remixContext\s*=/);
  check(start >= 0, "SSR Remix loader context is missing");
  const begin = markup.indexOf("{", start);
  let depth = 0,
    inString = false,
    escaped = false;
  for (let index = begin; index < markup.length; index++) {
    const char = markup[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if ((char === "}" || char === "]") && --depth === 0)
      return parseJson(markup.slice(begin, index + 1));
  }
  throw new Error("SSR loader context is incomplete");
}
async function publishedBinary(url, expectedHash, expectedSize, kind, backend) {
  const target = loopback(url, "Published asset");
  check(
    target.origin === backend.origin,
    "Published asset must use the configured backend origin"
  );
  check(
    target.pathname === "/v1/studio/assets/" + expectedHash + "/" + kind &&
      !target.search,
    "Published asset must use the exact content-addressed route"
  );
  const response = await request(target);
  check(
    response.headers.get("cache-control") === "no-store",
    "Publication must remain revocable"
  );
  check(
    response.headers.get("access-control-allow-origin") === "*",
    "Public Space assets need anonymous CORS"
  );
  const payload = await bytes(response, expectedSize);
  check(
    payload.length === expectedSize && hash(payload) === expectedHash,
    "Published file checksum or length differs"
  );
  return payload;
}

try {
  const configurationFile = process.argv[2];
  check(
    configurationFile,
    "Pass the private local demo.json written by the ITEC launcher"
  );
  const filename = resolve(configurationFile);
  check(
    (await lstat(filename)).size <= 65536,
    "Demo configuration is unexpectedly large"
  );
  const demo = parseJson(
    new TextDecoder().decode(await localFile(filename, 65536))
  );
  const marker = parseJson(
    new TextDecoder().decode(
      await localFile(join(dirname(filename), "launch.json"), 4096)
    )
  );
  check(
    marker.schema === "ekza.local-studio-demo.v2.supabase" &&
      marker.supabaseProject === "ekza-avatar-studio" &&
      demo.supabaseProject === marker.supabaseProject,
    "Only the isolated Supabase launcher rehearsal is allowed"
  );
  check(
    demo.database === "Supabase PostgreSQL",
    "SQLite/unknown rehearsals are not supported"
  );
  const studio = loopback(demo.studioUrl, "Studio URL");
  const backend = loopback(demo.mirrorBackendUrl, "Backend URL");
  const space = loopback(demo.spaceUrl, "Space URL");
  check(
    studio.pathname === "/studio" && !studio.search,
    "Use the launcher Studio URL"
  );
  check(
    backend.pathname === "/" && !backend.search && !space.search,
    "Use unmodified launcher service URLs"
  );
  check(Array.isArray(demo.accounts), "Local demo accounts are missing");
  origin = studio.origin;
  const state = await realpath(dirname(filename));
  const sample = await realpath(demo.sampleSource);
  check(
    dirname(sample) === join(state, "demo-inputs"),
    "Prepared fixture must be inside this rehearsal's demo-inputs"
  );
  const source = await localFile(sample, 50 * 1024 * 1024);
  check(
    hash(source) === ROBERT_SOURCE,
    "This rehearsal test accepts ONLY the exact prepared Robert VRM"
  );
  let thumbnail = null;
  try {
    thumbnail = await localFile(
      sample.replace(/\.vrm$/i, ".png"),
      5 * 1024 * 1024
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const page = await request(studio);
  const markup = new TextDecoder().decode(await bytes(page, JSON_LIMIT));
  compiledShell(markup, demo.studioMode, "Compiled Studio");
  const visible = markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  check(
    /Avatar Studio|One character\./i.test(visible),
    "Public Studio SSR content is missing"
  );
  check(
    !/wallet-adapter-button|aria-label="Solana network"|Connect a wallet\s*<br/i.test(
      visible
    ),
    "Public Studio must not present wallet/network controls"
  );
  const status = await json(await call("status"));
  check(
    status.enabled &&
      status.database === "postgresql" &&
      status.auth === "supabase" &&
      status.storage === "supabase",
    "Studio must report the real Supabase stack"
  );
  const context = remixContext(markup);
  let loader = context.state?.loaderData?.["routes/studio"];
  if (context.future?.v3_singleFetch) {
    const wire = await bytes(
      await request(singleFetchUrl(new URL(studio))),
      65536
    );
    const decoded = await decodeViaTurboStream(
      new Response(wire).body,
      globalThis
    );
    await decoded.done;
    check(
      !decoded.value["routes/studio"]?.error,
      "Studio single-fetch loader returned an error"
    );
    loader = decoded.value["routes/studio"]?.data;
  }
  check(loader, "Actual Studio loader data is missing");
  check(
    loader.publicApi === backend.origin + "/v1/studio" &&
      loader.space === space.href,
    "SSR loader must point at this rehearsal's API and Space"
  );
  const spaceShell = new TextDecoder().decode(
    await bytes(await request(space), JSON_LIMIT)
  );
  compiledShell(spaceShell, demo.spaceMode, "Compiled Space");
  check(
    /id=["']app["']/.test(spaceShell) &&
      /<script\b[^>]*type=["']module["']/.test(spaceShell),
    "Space must serve its actual application shell before this test creates any data"
  );
  console.log(
    "PASS public SSR and configured PostgreSQL/Auth/Storage are reachable without a wallet"
  );
  if (process.argv.includes("--preflight")) {
    console.log(
      "PASS read-only preflight; no account, session or avatar was created"
    );
    process.exit(0);
  }

  stage = "ordinary registration and login";
  const stamp = Date.now().toString(36) + "-" + randomBytes(4).toString("hex");
  const newAccount = {
    email: "studio-rehearsal-" + stamp + "@example.test",
    password: randomBytes(24).toString("base64url"),
    username: "rehearsal-" + stamp,
  };
  const registered = await json(
    await call("registrations", "POST", newAccount, contexts.creator, 201)
  );
  check(
    !registered.requiresEmailConfirmation &&
      registered.user?.role === "creator",
    "The isolated rehearsal must allow immediate creator signup; hosted email confirmation is separate"
  );
  const creatorId = registered.user.id;
  await call("session", "DELETE", undefined, contexts.creator, 204);
  check(
    (await signIn(newAccount, contexts.creator, "creator")).id === creatorId,
    "A registered user must be able to sign in again with email/password"
  );
  await signIn(
    demo.accounts.find((account) => account.role === "moderator"),
    contexts.moderator,
    "moderator"
  );
  await signIn(
    demo.accounts.find((account) => account.role === "creator"),
    contexts.other,
    "creator"
  );
  const refreshBefore = contexts.creator.cookies.get("ekza_studio_refresh.0");
  contexts.creator.cookies.set("ekza_studio_expiry", "1");
  const renewed = await json(
    await call("session", "GET", undefined, contexts.creator)
  );
  check(
    renewed.user.id === creatorId,
    "Refresh must preserve account identity"
  );
  check(
    Number(contexts.creator.cookies.get("ekza_studio_expiry")) > Date.now() &&
      contexts.creator.cookies.get("ekza_studio_refresh.0") !== refreshBefore,
    "Expired-cookie hint must rotate the actual Supabase refresh session"
  );
  console.log(
    "PASS signup, email login, server-owned roles, HttpOnly cookies and real session refresh"
  );

  stage = "one unique prepared-fixture upload";
  const fields = {
    name: "Robert · HTTP rehearsal " + stamp,
    description:
      "Retained local integration fixture: author → curator → Mirror + Space. Exact prepared Robert source only.",
    license:
      "Local ITEC technical rehearsal only; original avatar license remains applicable. Not for redistribution.",
    attribution: "Robert demo input supplied by the local ITEC launcher.",
  };
  // A deliberately rejected CSRF request creates no record.
  await call("avatars", "POST", fields, contexts.creator, 403, {
    Origin: "https://wrong-origin.invalid",
  });
  let avatar = await json(
    await call("avatars", "POST", fields, contexts.creator, 201)
  );
  fixtureId = avatar.avatarId;
  revisionId = avatar.revision.revisionId;
  check(
    UUID.test(fixtureId) &&
      UUID.test(revisionId) &&
      avatar.creator.id === creatorId,
    "Created fixture must have server-generated identity and the signed-in owner"
  );
  check(
    avatar.revision.status === "draft" && avatar.currentRevisionId === null,
    "New avatars start private"
  );
  const privateSource = "revisions/" + revisionId + "/files/source";
  await call("catalog/" + fixtureId, "GET", undefined, undefined, 404);
  await call(
    "revisions/" + revisionId + "/source",
    "PUT",
    source,
    contexts.creator
  );
  if (thumbnail)
    await call(
      "revisions/" + revisionId + "/thumbnail",
      "PUT",
      thumbnail,
      contexts.creator
    );
  await call(privateSource, "GET", undefined, undefined, 401);
  await call(privateSource, "GET", undefined, contexts.other, 404);
  await call("library/" + fixtureId, "POST", {}, contexts.other, 404);
  await call(
    "revisions/" + revisionId + "/submit",
    "POST",
    {},
    contexts.creator
  );
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const items = (
      await json(await call("avatars", "GET", undefined, contexts.creator))
    ).items;
    avatar = items.find((item) => item.avatarId === fixtureId);
    check(avatar, "Owned fixture disappeared during processing");
    if (["review", "failed", "rejected"].includes(avatar.revision.status))
      break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check(
    avatar.revision.status === "review",
    "Prepared Robert conversion did not reach review within 180 seconds"
  );
  check(
    avatar.revision.sourceSha256 === ROBERT_SOURCE &&
      avatar.revision.sourceSizeBytes === source.length &&
      avatar.revision.iosSha256 === ROBERT_IOS &&
      avatar.revision.iosSizeBytes === ROBERT_IOS_SIZE,
    "Worker result differs from the explicitly bound prepared Robert fixture"
  );
  for (const kind of ["source", "thumbnail", "ios"])
    check(
      avatar.revision[
        kind === "source"
          ? "sourceUrl"
          : kind === "ios"
          ? "iosUrl"
          : "thumbnailUrl"
      ] ===
        "/api/studio/revisions/" + revisionId + "/files/" + kind,
      "Private file URLs must remain behind the same-origin BFF"
    );
  await call("catalog/" + fixtureId, "GET", undefined, undefined, 404);
  await call(
    "revisions/" + revisionId + "/review",
    "POST",
    { decision: "approve" },
    contexts.creator,
    403
  );
  console.log(
    "PASS exact Robert upload/processing, draft privacy, cross-account boundaries and creator review denial"
  );

  stage = "moderator review and publication";
  const preview = await bytes(
    await call(
      privateSource + "?v=" + ROBERT_SOURCE,
      "GET",
      undefined,
      contexts.moderator
    ),
    source.length
  );
  check(
    hash(preview) === ROBERT_SOURCE && preview.length === source.length,
    "Moderator VRM download differs"
  );
  const ios = await call(
    "revisions/" + revisionId + "/files/ios",
    "GET",
    undefined,
    contexts.moderator
  );
  check(
    /^model\/vnd\.usdz\+zip\b/i.test(ios.headers.get("content-type") || ""),
    "Moderator USDZ MIME type differs"
  );
  check(
    hash(await bytes(ios, ROBERT_IOS_SIZE)) === ROBERT_IOS,
    "Moderator USDZ download differs"
  );
  await call(
    "revisions/" + revisionId + "/review",
    "POST",
    {
      decision: "approve",
      note: "Local HTTP rehearsal only: prepared-source/ARKit rendition hashes verified. Browser and physical-iPhone visual review are NOT claimed by this automated test.",
    },
    contexts.moderator
  );
  const published = await json(await call("catalog/" + fixtureId));
  check(
    published.currentRevisionId === revisionId &&
      published.revision.revisionId === revisionId &&
      published.revision.status === "published",
    "Catalog must publish the exact reviewed revision"
  );
  check(
    published.revision.reviewNote === null && published.revision.error === null,
    "Public catalog must not expose private moderation notes/errors"
  );
  check(
    (await json(await call("catalog"))).items.some(
      (item) => item.avatarId === fixtureId
    ),
    "Published fixture must be discoverable"
  );
  await publishedBinary(
    published.revision.sourceUrl,
    ROBERT_SOURCE,
    source.length,
    "source",
    backend
  );
  const publicIOS = await publishedBinary(
    published.revision.iosUrl,
    ROBERT_IOS,
    ROBERT_IOS_SIZE,
    "ios",
    backend
  );
  check(
    publicIOS[0] === 0x50 && publicIOS[1] === 0x4b,
    "Prepared USDZ must be a ZIP package"
  );
  const thumbUrl = loopback(
    published.revision.thumbnailUrl,
    "Published thumbnail"
  );
  check(
    thumbUrl.origin === backend.origin &&
      /^\/v1\/studio\/assets\/[a-f0-9]{64}\/thumbnail$/.test(thumbUrl.pathname),
    "Published thumbnail must use the immutable backend asset route"
  );
  const thumbnailHash = thumbUrl.pathname.split("/")[4];
  const png = await bytes(await request(thumbUrl), 5 * 1024 * 1024);
  check(
    hash(png) === thumbnailHash && png[0] === 137 && png[1] === 80,
    "Published PNG hash differs"
  );
  console.log(
    "PASS moderator private downloads, exact version approval and anonymous VRM/USDZ/PNG checksums"
  );

  stage = "saved library, native feed and Space contract";
  await call("library/" + fixtureId, "POST", {}, contexts.creator);
  await call("library/" + fixtureId, "POST", {}, contexts.creator);
  const saved = (
    await json(await call("library", "GET", undefined, contexts.creator))
  ).items;
  check(
    saved.filter((item) => item.avatarId === fixtureId).length === 1,
    "Saving twice must be idempotent"
  );
  check(
    saved.find((item) => item.avatarId === fixtureId).revision.revisionId ===
      revisionId,
    "Saved library must use the approved revision"
  );
  const otherSaved = (
    await json(await call("library", "GET", undefined, contexts.other))
  ).items;
  check(
    !otherSaved.some((item) => item.avatarId === fixtureId),
    "Libraries must stay account-scoped"
  );
  const native = await json(
    await call("library/ios", "GET", undefined, contexts.creator)
  );
  const nativeAvatar = native.items.find((item) => item.id === fixtureId);
  check(
    nativeAvatar &&
      nativeAvatar.usdzSha256 === ROBERT_IOS &&
      nativeAvatar.usdzSizeBytes === ROBERT_IOS_SIZE &&
      nativeAvatar.usdzUrl === published.revision.iosUrl &&
      nativeAvatar.usdzAssetPath ===
        new URL(published.revision.iosUrl).pathname &&
      nativeAvatar.modelUrl === published.revision.sourceUrl,
    "Mirror native feed differs from the saved publication"
  );
  const publicFeed = await json(
    await request(
      new URL("/library/avatars?collection=studio&limit=100", backend)
    )
  );
  check(
    publicFeed.items.some(
      (item) => item.id === fixtureId && item.usdzSha256 === ROBERT_IOS
    ),
    "Published fixture must also appear in Mirror's public discovery feed"
  );

  const helperSource = await readFile(
    new URL("../app/lib/studio.ts", import.meta.url),
    "utf8"
  );
  const compiled = ts.transpileModule(helperSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const { spaceLaunchUrl } = await import(
    "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
  );
  const launch = loopback(
    spaceLaunchUrl(loader.space, loader.publicApi, fixtureId),
    "Space launch URL"
  );
  check(
    launch.origin === space.origin &&
      launch.pathname === space.pathname &&
      launch.searchParams.get("studioAvatar") === fixtureId &&
      launch.searchParams.get("studioApi") === backend.origin + "/v1/studio",
    "Actual Space URL helper must preserve the publication contract"
  );
  const spacePage = new TextDecoder().decode(
    await bytes(await request(launch), JSON_LIMIT)
  );
  compiledShell(spacePage, demo.spaceMode, "Compiled Space launch");
  check(
    /id=["']app["']/.test(spacePage) &&
      /<script\b[^>]*type=["']module["']/.test(spacePage),
    "Space launch route must serve its actual application shell"
  );
  const directManifest = await json(
    await request(new URL("/v1/studio/catalog/" + fixtureId, backend))
  );
  check(
    directManifest.revision.sourceSha256 === ROBERT_SOURCE &&
      directManifest.revision.revisionId === revisionId,
    "Space's anonymous manifest must resolve the same reviewed version"
  );
  console.log(
    "PASS idempotent personal library, Mirror native/public feeds and live Space URL/manifest contract"
  );

  stage = "logout and replay denial";
  const revoked = { cookies: new Map(contexts.creator.cookies) };
  await call("session", "DELETE", undefined, contexts.creator, 204);
  await call("session", "GET", undefined, contexts.creator, 401);
  await call("session", "GET", undefined, revoked, 401);
  completed = true;
  console.log(
    "PASS logout rejects both cleared-cookie access and the previous session"
  );
  console.log(
    JSON.stringify(
      {
        fixtureId,
        revisionId,
        sourceSha256: ROBERT_SOURCE,
        iosSha256: ROBERT_IOS,
        catalogUrl: backend.origin + "/v1/studio/catalog/" + fixtureId,
        spaceUrl: launch.href,
        retained: true,
        preparedFixture: "Robert, exact-source verified conversion cache",
        verificationScope:
          "HTTP/API + bundle/SSR only; browser clicks, WebGL and physical iPhone remain manual",
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    "FAIL local Studio rehearsal at " +
      stage +
      ": " +
      (error instanceof Error ? error.message : "unexpected failure")
  );
  if (fixtureId)
    console.error(
      "Retained fixture ID: " +
        fixtureId +
        "; no deletion/unpublish was attempted."
    );
  process.exitCode = 1;
} finally {
  // Revoke only sessions established by this harness. The created fixture and
  // account are retained for inspection; existing data is never removed.
  if (origin) {
    for (const [role, context] of Object.entries(contexts)) {
      if (
        !context.cookies.has("ekza_studio_session.0") &&
        !context.cookies.has("ekza_studio_refresh.0")
      )
        continue;
      try {
        await call("session", "DELETE", undefined, context, 204);
      } catch {
        console.error(
          "WARN could not revoke this harness's " +
            role +
            " session; no credentials were logged"
        );
        if (completed) process.exitCode = 1;
      }
      context.cookies.clear();
    }
  }
}
