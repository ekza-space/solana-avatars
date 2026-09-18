import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router-dom/server.js";
import ts from "typescript";

// Execute the real routing helpers, loaders and public React shell without a
// build/dev server, wallet provider, browser or generated files.
const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL("../app/", import.meta.url));
const modules = new Map();
async function sourceModule(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const source = await readFile(filename, "utf8");
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  for (const match of [...compiled.matchAll(/from "([^"]+)"/g)]) {
    const specifier = match[1];
    let resolved;
    if (specifier.startsWith(".") || specifier.startsWith("~/")) {
      const base = specifier.startsWith("~/")
        ? path.join(app, specifier.slice(2))
        : path.resolve(path.dirname(filename), specifier);
      for (const extension of [".tsx", ".ts"]) {
        try {
          resolved = await sourceModule(base + extension);
          break;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      assert.ok(resolved, specifier);
    } else resolved = pathToFileURL(require.resolve(specifier)).href;
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${resolved}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString(
    "base64"
  )}`;
  modules.set(filename, url);
  return url;
}
const load = async (relative) =>
  import(await sourceModule(path.join(app, relative)));
const routes = await load("lib/routes.ts");
const index = await load("routes/_index.tsx");
const root = await load("root.tsx");
const hub = await load("routes/web3.tsx");
const about = await load("routes/about.tsx");

test("all six Studio views share one safe route contract", () => {
  for (const view of [
    "catalog",
    "library",
    "uploads",
    "review",
    "new",
    "account",
  ]) {
    assert.equal(routes.parseStudioView(`?view=${view}`), view);
    assert.equal(routes.studioHref(view), `/studio?view=${view}`);
  }
  assert.equal(routes.parseStudioView("?view=https://evil.test"), "catalog");
  assert.equal(
    routes.studioRedirectTarget(
      "?view=account&auth=signup&returnTo=review&token=secret&redirect=https://evil.test"
    ),
    "/studio?view=account&auth=signup&returnTo=review"
  );
  assert.equal(
    routes.studioRedirectTarget(
      "?view=bad&returnTo=https://evil.test&auth=bad"
    ),
    "/studio"
  );
});

test("old home and Studio links return to the Solana store by default", async () => {
  const home = index.loader({
    request: new Request("https://avatar.test/?view=library&wallet=secret"),
  });
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("Location"), "/passport");
  const canonical = root.loader({
    request: new Request("https://avatar.test/studio/?view=new&auth=signup"),
  });
  assert.equal(canonical.status, 302);
  assert.equal(
    canonical.headers.get("Location"),
    "/passport"
  );
  for (const route of ["/studio", "/studio?view=account", "/demo", "/demo/?enabled=1"]) {
    assert.equal(root.loader({ request: new Request(`https://avatar.test${route}`) }).headers.get("Location"), "/passport");
  }
});

test("Studio routes can be restored only by an explicit server setting", () => {
  const previous = process.env.EKZA_STUDIO_UI_ENABLED;
  process.env.EKZA_STUDIO_UI_ENABLED = "1";
  try {
    assert.equal(index.loader({ request: new Request("https://avatar.test/?view=library") }).headers.get("Location"), "/studio?view=library");
    assert.equal(root.loader({ request: new Request("https://avatar.test/studio/?view=new") }).headers.get("Location"), "/studio?view=new");
  } finally {
    if (previous === undefined) delete process.env.EKZA_STUDIO_UI_ENABLED;
    else process.env.EKZA_STUDIO_UI_ENABLED = previous;
  }
});

test("only explicit legacy tool paths can mount the optional wallet shell", () => {
  for (const pathname of ["/minter", "/deployer/", "/users", "/web3/profile/"])
    assert.equal(routes.isLegacyToolPath(pathname), true);
  for (const pathname of [
    "/",
    "/studio",
    "/studio/",
    "/about",
    "/web3",
    "/demo",
    "/missing",
    "/web3/missing",
    "/minter/missing",
  ])
    assert.equal(routes.isLegacyToolPath(pathname), false, pathname);
});

test("Remix discovers the moved profile as a standalone legacy route", () => {
  const { flatRoutes } = require("@remix-run/dev/dist/config/flat-routes.js");
  const manifest = flatRoutes(app.replace(/\/$/, ""));
  assert.equal(manifest["routes/web3_.profile"].path, "web3/profile");
  assert.equal(manifest["routes/web3_.profile"].parentId, "root");
  for (const route of ["minter", "deployer", "users"])
    assert.equal(manifest[`routes/${route}`].path, route);
});

async function renderPage(url, { demoEnabled = false, missing = false, initialClient = false } = {}) {
  const definitions = [
    {
      id: "root",
      path: "/",
      element: React.createElement(root.default),
      errorElement: React.createElement(root.ErrorBoundary),
      loader: () => ({ demoEnabled }),
      children: missing
        ? []
        : [
            {
              path: "*",
              element: React.createElement(
                url.startsWith("/web3")
                  ? hub.default
                  : url.startsWith("/about")
                  ? about.default
                  : "div",
                null,
                url.startsWith("/web3") || url.startsWith("/about")
                  ? undefined
                  : "Studio body"
              ),
            },
          ],
    },
  ];
  const handler = createStaticHandler(definitions);
  const context = await handler.query(new Request(`https://avatar.test${url}`));
  assert.ok(!(context instanceof Response));
  if (initialClient) {
    // Use the browser router's initial component render with the same loader
    // payload. Effects intentionally do not run before hydration's first pass.
    const router = createMemoryRouter(definitions, {
      initialEntries: [url],
      hydrationData: { loaderData: context.loaderData, actionData: context.actionData, errors: context.errors },
    });
    try {
      return renderToStaticMarkup(React.createElement(RouterProvider, { router }));
    } finally {
      router.dispose();
    }
  }
  const router = createStaticRouter(definitions, context);
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, {
      router,
      context,
      hydrate: false,
    })
  );
}

test("purchase and publication initial browser markup matches SSR despite saved browser preferences", async () => {
  const previousWindow = globalThis.window;
  const originalError = console.error;
  // React warns that layout effects cannot run in a string render. That is
  // intentional here: this tests the first client render, before any effects.
  console.error = (message, ...args) => {
    if (String(message).startsWith("Warning: useLayoutEffect does nothing on the server")) return;
    originalError(message, ...args);
  };
  try {
    for (const url of [
      "/minter?avatarData=3bfPehBVoBKXUUzmGGVT3tgQTYkpispqUKfPW1UktASL&network=devnet",
      "/deployer?network=devnet",
      "/minter",
      "/deployer",
    ]) {
      delete globalThis.window;
      const serverHtml = await renderPage(url);
      assert.match(serverHtml, /Loading optional Web3 tools/);
      assert.doesNotMatch(serverHtml, /Avatar (purchase|publication)|Solana network/);
      for (const savedCluster of ["localnet", "mainnet-beta"]) {
        globalThis.window = {
          location: new URL(`https://avatar.test${url}`),
          localStorage: { getItem: (key) => key === "solana-avatars-theme" ? "light" : savedCluster },
          matchMedia: () => ({ matches: false }),
        };
        const clientHtml = await renderPage(url, { initialClient: true });
        assert.equal(clientHtml, serverHtml, `${url} with saved ${savedCluster}`);
      }
    }
  } finally {
    console.error = originalError;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("Studio keeps its own account navigation without wallet chrome", async () => {
  for (const url of [
    "/studio",
    "/studio/",
    "/studio?view=library",
  ]) {
    const html = await renderPage(url);
    for (const view of ["catalog", "library", "uploads", "account"])
      assert.ok(html.includes(`href="/studio?view=${view}"`), url);
    assert.match(html, /href="\/web3"/);
    assert.doesNotMatch(
      html,
      /wallet-adapter|Connect a wallet|Solana network|href="\/minter"|https:\/\/space\.ekza\.io/
    );
    assert.doesNotMatch(html, /href="\/demo"/);
  }
  assert.match(
    await renderPage("/studio", { demoEnabled: true }),
    /href="\/demo"/
  );
});

test("wallet store navigation keeps buyers in the same library and publication flow", async () => {
  for (const url of ["/passport", "/passport#my-avatars", "/connect", "/minter?network=devnet", "/deployer?network=devnet"]) {
    const html = await renderPage(url);
    for (const href of ["/passport", "/passport#my-avatars", "/deployer?network=devnet", "/connect"]) {
      assert.ok(html.includes(`href="${href}"`), `${url} must link to ${href}`);
    }
    assert.doesNotMatch(html, /href="\/studio|href="\/web3|My library|My uploads/);
  }
});

test("Solana identity confirmation and its error boundary never show commerce navigation", async () => {
  const { flatRoutes } = require("@remix-run/dev/dist/config/flat-routes.js");
  assert.equal(flatRoutes(app.replace(/\/$/, ""))["routes/auth.solana"].path, "auth/solana");
  for (const url of ["/auth/solana?userCode=ABCDEF123456", "/auth/solana/?redirect=https://store.test"]) {
    for (const missing of [false, true]) {
      const html = await renderPage(url, { missing });
      assert.doesNotMatch(html, /href=|Avatar Store|Avatar Studio|NFT|Buy|Marketplace|Discover|wallet-adapter|Loading optional Web3/);
      if (missing) assert.match(html, /Return to your app/);
    }
  }
});

test("public Web3 hub preserves the original tools behind an explicit experiment", async () => {
  const html = await renderPage("/web3");
  assert.match(html, /Web3 experiments/);
  assert.match(html, /Additional Solana tools/);
  assert.doesNotMatch(html, /href="\/studio|email account/);
  for (const pathname of ["/web3/profile", "/minter", "/deployer", "/users"])
    assert.ok(html.includes(`href="${pathname}"`));
  assert.doesNotMatch(html, /wallet-adapter|Solana network/);
  const profile = await readFile(
    path.join(app, "routes/web3_.profile.tsx"),
    "utf8"
  );
  assert.match(profile, /avatars\.initializeProfile/);
  assert.match(profile, /avatars\.updateProfile/);
  assert.match(
    await readFile(path.join(app, "routes/users.tsx"), "utf8"),
    /href="\/web3\/profile"/
  );
});

test("404 recovery returns to the avatar store without loading wallet providers", async () => {
  const html = await renderPage("/not-a-route", { missing: true });
  assert.match(html, /Back to avatars/);
  assert.match(html, /href="\/passport"/);
  assert.doesNotMatch(html, /href="\/studio/);
  assert.doesNotMatch(html, /wallet-adapter|Connect a wallet|href="\/"/);
});

test("About explains the Solana alpha without sending visitors to email registration or Studio", async () => {
  const html = await renderPage("/about");
  assert.match(html, /Solana Devnet|test SOL/);
  assert.match(html, /href="\/deployer\?network=devnet"/);
  assert.doesNotMatch(html, /href="\/studio|email and password|No crypto wallet|ordinary account/);
});

test("public shell has no eager Solana imports or remote font dependency", async () => {
  for (const name of [
    "root.tsx",
    "components/header.tsx",
    "components/footer.tsx",
    "routes/about.tsx",
  ]) {
    const source = await readFile(path.join(app, name), "utf8");
    assert.doesNotMatch(
      source,
      /from ["'][^"']*(?:@solana|lib\/network)|fonts\.googleapis|fonts\.gstatic/
    );
  }
  const source = await readFile(path.join(app, "root.tsx"), "utf8");
  assert.match(
    source,
    /lazy\(\(\) => import\("\.\/components\/legacy-shell"\)\)/
  );
});
