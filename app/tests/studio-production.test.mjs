// Opt-in, read-only production smoke:
// STUDIO_PRODUCTION_ORIGIN=http://127.0.0.1:5188 node --test tests/studio-production.test.mjs
// Downloads SSR and parses actual module imports. Does not execute hydration,
// browser interactions, WebGL, wallet operations, or authenticated mutations.
/* global globalThis */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import test from "node:test";
import { init, parse } from "es-module-lexer";
import {
  decodeViaTurboStream,
  singleFetchUrl,
} from "@remix-run/react/dist/single-fetch.js";

const ROBERT_SOURCE =
  "5e3edaf330577ee4c3f6440b8989af3722e7c800bb90eb037f1c05cdfe61fd7c";
const VIEWS = ["catalog", "library", "uploads", "review", "new", "account"];
const VIEW_TITLES = {
  catalog: "One character.",
  library: "Your avatar library",
  uploads: "Your submissions",
  review: "Review queue",
  new: "Publish an avatar",
  account: "Your Ekza account",
};
const LEGACY = ["/web3/profile", "/minter", "/deployer", "/users"];

function visibleHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}
function noWalletChrome(html, label) {
  const visible = visibleHtml(html);
  assert.ok(
    !/wallet-adapter-button|aria-label=["']Solana network["']|Connect a wallet\s*<br/i.test(
      visible
    ),
    label + " must not contain public wallet/network controls"
  );
  assert.ok(
    !/Network\s*(?:·|&middot;|&#183;)\s*(?:Devnet|Localnet|Mainnet)/i.test(
      visible
    ),
    label + " must not show a Solana network footer"
  );
  assert.ok(
    !/sb_secret_|service_role_key|SUPABASE_SECRET_KEY/.test(html),
    label + " must not expose privileged Supabase configuration"
  );
}
function links(html) {
  return [
    ...visibleHtml(html).matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi),
  ].map((match) => match[1].replace(/&amp;/g, "&"));
}

test(
  "compiled public routes, error recovery and all lazy asset modules are available",
  { skip: !process.env.STUDIO_PRODUCTION_ORIGIN },
  async (context) => {
    const origin = new URL(process.env.STUDIO_PRODUCTION_ORIGIN);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(origin.hostname),
      "Only loopback production smoke is allowed"
    );
    assert.ok(["http:", "https:"].includes(origin.protocol));
    assert.equal(
      origin.username + origin.password + origin.search + origin.hash,
      ""
    );
    assert.equal(origin.pathname, "/");

    function localUrl(value, base = origin) {
      const url = new URL(value, base);
      assert.equal(
        url.origin,
        origin.origin,
        "Never request an external origin"
      );
      assert.equal(url.username + url.password + url.hash, "");
      return url;
    }
    async function get(path, expected = 200) {
      let url = localUrl(path);
      const redirects = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(url, {
          redirect: "manual",
          credentials: "omit",
          signal: AbortSignal.timeout(10000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const next = localUrl(response.headers.get("location"), url);
          redirects.push({
            from: url.pathname,
            to: next.pathname,
            status: response.status,
          });
          await response.body?.cancel();
          url = next;
          continue;
        }
        assert.equal(response.status, expected, url.pathname);
        return { response, url, redirects };
      }
      throw new Error("Unexpected redirect loop in a local public route");
    }
    async function body(response, maximum = 16 * 1024 * 1024) {
      assert.ok(response.body);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          assert.ok(
            size <= maximum,
            "Response exceeded the smoke test byte limit"
          );
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      return Buffer.concat(chunks, size);
    }
    async function page(path, expected = 200) {
      const result = await get(path, expected);
      assert.match(
        result.response.headers.get("content-type"),
        /^text\/html\b/i
      );
      const html = (await body(result.response, 4 * 1024 * 1024)).toString(
        "utf8"
      );
      assert.ok(
        !/\/@vite\/|\/@react-refresh|virtual:remix\/hmr|\/node_modules\/\.vite\//.test(
          html
        ),
        "Compiled routes must not require the Vite development server"
      );
      assert.match(html, /<html\b/);
      return { ...result, html };
    }

    const pages = new Map();
    await context.test(
      "root/trailing-slash and six direct views reach wallet-free public Studio",
      async () => {
        for (const path of [
          "/",
          "/studio",
          "/studio/",
          ...VIEWS.map((view) => "/studio?view=" + view),
        ]) {
          const result = await page(path);
          noWalletChrome(result.html, path);
          assert.ok(
            /Avatar Studio|One character\./i.test(visibleHtml(result.html)),
            path + " must SSR its product content"
          );
          assert.ok(
            !/Something did not load|Unknown rendering error/.test(
              visibleHtml(result.html)
            ),
            path + " must not silently return an error page with status200"
          );
          assert.equal(
            result.url.pathname,
            "/studio",
            "Studio entry URLs should converge on the canonical route"
          );
          if (path.includes("?view=")) {
            const view = new URL(path, origin).searchParams.get("view");
            assert.equal(result.url.searchParams.get("view"), view);
            assert.ok(
              visibleHtml(result.html).includes(VIEW_TITLES[view]),
              "Direct view must SSR its correct heading, not silently reset to Discover"
            );
            // Real Remix navigation uses the single-fetch route, not just the
            // document URL. Decode it with the installed framework's codec.
            const wire = await get(singleFetchUrl(new URL(result.url)).href);
            const decoded = await decodeViaTurboStream(
              new Response(await body(wire.response, 65536)).body,
              globalThis
            );
            await decoded.done;
            assert.ok(
              !decoded.value["routes/studio"]?.error,
              "The view's client-navigation loader must not return an error"
            );
            assert.ok(
              typeof decoded.value["routes/studio"]?.data?.publicApi ===
                "string" &&
                typeof decoded.value["routes/studio"]?.data?.space === "string",
              "Real client navigation must receive its API and Space configuration"
            );
          }
          const navigation = links(result.html);
          for (const expected of [
            "/studio?view=catalog",
            "/studio?view=library",
            "/studio?view=uploads",
            "/studio?view=account",
            "/about",
            "/web3",
          ])
            assert.ok(
              navigation.includes(expected),
              "Missing public navigation: " + expected
            );
          assert.ok(
            !navigation.some((href) => LEGACY.includes(href)),
            "Legacy wallet actions must stay inside the experiment hub"
          );
          pages.set(path, result.html);
        }
        const redirected = await get(
          "/?view=library&auth=signup&returnTo=library"
        );
        assert.equal(redirected.url.pathname, "/studio");
        assert.equal(redirected.url.searchParams.get("view"), "library");
        assert.equal(redirected.url.searchParams.get("auth"), "signup");
        await redirected.response.body?.cancel();
      }
    );

    await context.test(
      "About and explicit Web3 hub are public, with legacy routes preserved",
      async () => {
        const about = await page("/about");
        noWalletChrome(about.html, "/about");
        assert.match(visibleHtml(about.html), /Mirror/);
        assert.match(visibleHtml(about.html), /Space/);
        assert.ok(
          links(about.html).some(
            (href) => href === "/studio" || href.startsWith("/studio?")
          ),
          "About must offer the ordinary-account product"
        );
        pages.set("/about", about.html);
        const hub = await page("/web3");
        noWalletChrome(hub.html, "/web3");
        assert.match(visibleHtml(hub.html), /Web3 experiments/);
        assert.match(visibleHtml(hub.html), /Separate from your Ekza account/);
        for (const target of LEGACY)
          assert.ok(
            links(hub.html).includes(target),
            "Missing preserved experiment link: " + target
          );
        pages.set("/web3", hub.html);
        for (const target of LEGACY) {
          const route = await page(target);
          assert.ok(
            !/Something did not load|Unknown rendering error/.test(
              visibleHtml(route.html)
            ),
            "Legacy experiment route must remain present: " + target
          );
          pages.set(target, route.html);
        }
      }
    );

    await context.test(
      "unknown page and anonymous API errors recover without disabling public browsing",
      async () => {
        const missing = await page("/studio-rehearsal-missing-page", 404);
        noWalletChrome(missing.html, "404 recovery page");
        assert.ok(
          links(missing.html).includes("/studio"),
          "404 page must offer a return to Studio"
        );
        for (const [path, expected] of [
          ["/api/studio/session", 401],
          ["/api/studio/not-an-operation", 404],
          ["/api/studio/catalog/00000000-0000-0000-0000-000000000000", 404],
        ]) {
          const { response } = await get(path, expected);
          assert.match(
            response.headers.get("content-type"),
            /^application\/json\b/i
          );
          assert.equal(response.headers.get("cache-control"), "no-store");
          const error = JSON.parse(
            (await body(response, 65536)).toString("utf8")
          );
          assert.ok(
            typeof error.error?.code === "string" &&
              typeof error.error?.message === "string"
          );
        }
        const recovered = await page("/studio?view=catalog");
        noWalletChrome(recovered.html, "Studio after rejected requests");
        const { response } = await get("/api/studio/status");
        const status = JSON.parse(
          (await body(response, 65536)).toString("utf8")
        );
        assert.equal(status.enabled, true);
        assert.equal(status.database, "postgresql");
        assert.equal(status.auth, "supabase");
        assert.equal(status.storage, "supabase");
      }
    );

    await context.test(
      "optional local rehearsal guide exposes only the exact prepared sample",
      async () => {
        const probe = await fetch(localUrl("/demo"), {
          redirect: "manual",
          credentials: "omit",
          signal: AbortSignal.timeout(10000),
        });
        if (probe.status === 404 && process.env.STUDIO_EXPECT_DEMO !== "1") {
          await probe.body?.cancel();
          context.diagnostic(
            "Local /demo helper is disabled; no sample endpoint was requested."
          );
          return;
        }
        assert.equal(
          probe.status,
          200,
          "Local guide must be available when STUDIO_EXPECT_DEMO=1"
        );
        const html = (await body(probe, 4 * 1024 * 1024)).toString("utf8");
        noWalletChrome(html, "/demo");
        const sampleLinks = links(html);
        assert.ok(
          sampleLinks.includes("/demo/sample?kind=source"),
          "Guide must link its prepared VRM sample"
        );
        assert.ok(
          sampleLinks.includes("/demo/sample?kind=thumbnail"),
          "Guide must link its prepared PNG sample"
        );
        assert.ok(
          !sampleLinks.some((href) => /demo\.json|launch\.json/.test(href)) &&
            !/sb_secret_|ekza_studio_session|ekza_studio_refresh/.test(html),
          "Public demo guide must not expose account credentials or session material"
        );
        const source = await get("/demo/sample?kind=source");
        assert.match(
          source.response.headers.get("content-disposition"),
          /attachment;\s*filename="Robert\.vrm"/i
        );
        assert.equal(source.response.headers.get("cache-control"), "no-store");
        assert.equal(
          source.response.headers.get("x-content-type-options"),
          "nosniff"
        );
        const bytes = await body(source.response, 50 * 1024 * 1024);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          ROBERT_SOURCE,
          "Demo source must be exactly the prepared Robert fixture"
        );
        const thumbnail = await get("/demo/sample?kind=thumbnail");
        assert.match(
          thumbnail.response.headers.get("content-type"),
          /^image\/png\b/i
        );
        assert.match(
          thumbnail.response.headers.get("content-disposition"),
          /attachment;\s*filename="Robert\.png"/i
        );
        const png = await body(thumbnail.response, 5 * 1024 * 1024);
        assert.ok(
          png.length > 8 &&
            png[0] === 137 &&
            png[1] === 80 &&
            png[2] === 78 &&
            png[3] === 71
        );
        const invalid = await get("/demo/sample?kind=unknown", 404);
        await invalid.response.body?.cancel();
      }
    );

    await context.test(
      "actual production manifest and transitive lazy imports are fully served",
      async () => {
        const roots = new Set();
        function collect(value) {
          if (
            typeof value === "string" &&
            /^\/assets\/.+\.(js|css)$/.test(value)
          )
            roots.add(value);
          else if (Array.isArray(value)) value.forEach(collect);
          else if (value && typeof value === "object")
            Object.values(value).forEach(collect);
        }
        for (const [route, html] of pages) {
          const embedded = html.match(
            /window\.__remixManifest\s*=\s*(\{[\s\S]*?\});\s*window\.__remixRouteModules/
          );
          assert.ok(
            embedded,
            "Production Remix asset manifest must be present"
          );
          const manifest = JSON.parse(embedded[1]);
          if (route === "/" || route.startsWith("/studio"))
            assert.ok(
              manifest.routes["routes/studio"],
              "Studio SSR must include its own route module"
            );
          collect(manifest);
          for (const match of html.matchAll(
            /(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))(?:[^"\s]*)"/g
          ))
            roots.add(match[1]);
        }
        assert.ok(
          roots.size > 5,
          "Expected real server-selected scripts and styles"
        );
        await init;
        const visited = new Set();
        const scriptAssets = new Set();
        const styleAssets = new Set();
        let nonliteralDynamicImports = 0;
        async function walk(path) {
          const url = localUrl(path);
          assert.ok(
            url.pathname.startsWith("/assets/"),
            "Module must remain inside built local assets"
          );
          if (visited.has(url.href)) return;
          visited.add(url.href);
          assert.ok(visited.size < 220, "Unexpectedly broad module graph");
          const { response } = await get(url.href);
          const type = response.headers.get("content-type") || "";
          if (url.pathname.endsWith(".css")) {
            assert.match(type, /^text\/css\b/i);
            styleAssets.add(url.pathname);
            await body(response);
            return;
          }
          assert.ok(url.pathname.endsWith(".js"));
          assert.match(type, /^(text|application)\/(javascript|ecmascript)\b/i);
          scriptAssets.add(url.pathname);
          const javascript = (await body(response)).toString("utf8");
          assert.ok(
            !/\/@vite\/client|virtual:remix\/hmr-runtime|\/node_modules\/\.vite\/deps\//.test(
              javascript
            ),
            "Production module must not import a development dependency"
          );
          const [imports] = parse(javascript, url.pathname);
          const dependencies = [];
          for (const imported of imports) {
            if (imported.d === -2) continue;
            if (!imported.n) {
              if (imported.d >= 0) nonliteralDynamicImports++;
              continue;
            }
            assert.ok(
              imported.n.startsWith(".") || imported.n.startsWith("/"),
              "Compiled graph must not contain bare/external imports"
            );
            dependencies.push(new URL(imported.n, url).href);
          }
          await Promise.all(dependencies.map(walk));
        }
        await Promise.all([...roots].map(walk));
        assert.ok(
          [...scriptAssets].some((path) => /\/SceneWithModel[-.]/.test(path)),
          "Lazy VRM preview module must be actually downloaded"
        );
        assert.ok(styleAssets.size > 0);
        context.diagnostic(
          "Verified " +
            scriptAssets.size +
            " JavaScript chunks and " +
            styleAssets.size +
            " styles across public/experiment routes, including lazy SceneWithModel. " +
            nonliteralDynamicImports +
            " computed imports cannot be resolved statically. This is SSR/bundle completeness, NOT hydration/WebGL verification."
        );
      }
    );
  }
);
