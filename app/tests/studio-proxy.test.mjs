import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { installGlobals } from "@remix-run/node";

// Use the existing TypeScript compiler, without a new runner dependency or
// generated files. The proxy has no runtime imports and runs on native Fetch.
const source = await readFile(
  new URL("../app/lib/studio-proxy.server.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { allowedStudioPath, proxyStudioRequest, rewriteStudioFiles } =
  await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
const id = "12345678-1234-1234-1234-123456789abc";
const hash = "f".repeat(64);
const token = "a-very-secret-opaque-session-token";
const refreshToken = "abcdef123456";
const user = {
  id,
  username: "creator",
  email: "creator@example.test",
  role: "creator",
};
const session = () => ({
  token,
  refreshToken,
  user,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
const sessionRequestCookies = (expiry = Date.now() + 3600_000) =>
  `ekza_studio_session.0=${token}; ekza_studio_refresh.0=${refreshToken}; ekza_studio_expiry=${expiry}`;
const responseCookies = (response) =>
  response.headers.get("Set-Cookie").split(/, (?=ekza_studio_)/);
const config = {
  api: "http://backend.test/v1/studio",
  publicApi: "https://api.example/v1/studio",
};
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const request = (path, method = "GET", options = {}) =>
  new Request(`https://avatar.example/api/studio/${path}`, {
    method,
    ...(method !== "GET" && method !== "DELETE" ? { body: "{}" } : {}),
    ...options,
    headers: {
      Origin: "https://avatar.example",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

test("service failures never expose worker instructions or infrastructure details to visitors", async () => {
  for (const status of [500, 502, 503]) {
    const response = await proxyStudioRequest(request("catalog"), "catalog", {
      ...config,
      fetcher: async () => json({ error: { code: "studio_disabled", message: "Enable EKZA_STUDIO_ENABLED and start the studio worker.", details: ["internal-host:8000"] } }, status),
    });
    assert.equal(response.status, status);
    const body = await response.text();
    assert.match(body, /temporarily unavailable/);
    assert.doesNotMatch(body, /EKZA_STUDIO|worker|internal-host/);
  }
});

test("failed writes explain uncertain saved status without forwarding service diagnostics", async () => {
  const response = await proxyStudioRequest(request("avatars", "POST", {
    headers: { Cookie: sessionRequestCookies() },
  }), "avatars", {
    ...config,
    fetcher: async (url) => url.endsWith("/session")
      ? json({ user })
      : json({ error: { message: "worker database traceback" } }, 503),
  });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /could not confirm.*saved/);
  assert.doesNotMatch(body, /worker|database|traceback/);
});

test("only fixed verbs, UUID paths, hashes and file kinds can reach the backend", () => {
  assert.equal(allowedStudioPath("PUT", `revisions/${id}/source`), true);
  assert.equal(allowedStudioPath("GET", `assets/${hash}/ios`), true);
  assert.equal(allowedStudioPath("POST", `revisions/${id}/review`), true);
  assert.equal(allowedStudioPath("POST", "registrations"), true);
  assert.equal(
    allowedStudioPath("POST", "sessions/refresh"),
    false,
    "refresh is server-internal only"
  );
  for (const path of [
    "../admin",
    "https://evil.test",
    "/catalog",
    "catalog/../session",
    "catalog%2f..%2fsession",
    `revisions/${id}/files/password`,
    `revisions/${id}/source/`,
    `assets/${hash.slice(1)}/ios`,
  ]) {
    assert.equal(allowedStudioPath("GET", path), false, path);
  }
  assert.equal(allowedStudioPath("DELETE", `revisions/${id}/source`), false);
});

test("mutations require a matching browser Origin, including sign-in", async () => {
  for (const origin of ["https://evil.test", "null", ""]) {
    const response = await proxyStudioRequest(
      request("sessions", "POST", { headers: { Origin: origin } }),
      "sessions",
      {
        ...config,
        fetcher: () => {
          throw new Error("must not call upstream");
        },
      }
    );
    assert.equal(response.status, 403);
  }
});

test("the proxy forwards its session cookie as bearer and drops all browser credentials", async () => {
  let called = false;
  const response = await proxyStudioRequest(
    request("avatars", "GET", {
      headers: {
        Cookie: `other=secret; ekza_studio_session=${token}`,
        Authorization: "Bearer attacker",
        "X-Api-Key": "untrusted",
      },
    }),
    "avatars",
    {
      ...config,
      fetcher: async (url, init) => {
        called = true;
        assert.equal(url, `${config.api}/avatars`);
        assert.equal(init.headers.get("Authorization"), `Bearer ${token}`);
        assert.equal(init.headers.get("Cookie"), null);
        assert.equal(init.headers.get("X-Api-Key"), null);
        assert.equal(init.redirect, "manual");
        return json({ items: [] }, 200, {
          "Set-Cookie": "backend=secret",
          "Access-Control-Allow-Origin": "*",
        });
      },
    }
  );
  assert.ok(called);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("login strips both tokens and installs chunked HttpOnly secure cookies", async () => {
  const user = {
    id,
    username: "creator",
    email: "creator@example.test",
    role: "creator",
  };
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  const response = await proxyStudioRequest(
    request("sessions", "POST"),
    "sessions",
    {
      ...config,
      fetcher: async (_url, init) => {
        assert.equal(init.headers.get("Authorization"), null);
        return json({ token, refreshToken, user, expiresAt });
      },
    }
  );
  assert.deepEqual(await response.json(), { user, expiresAt });
  const cookie = response.headers.get("Set-Cookie");
  for (const flag of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/api/studio"])
    assert.ok(cookie.includes(flag));
  assert.match(cookie, /ekza_studio_session\.0=/);
  assert.match(cookie, /ekza_studio_refresh\.0=/);
  assert.match(cookie, /Max-Age=2592000/);
});

test("signup supports an immediate session or email confirmation without leaking auth fields", async () => {
  for (const immediate of [true, false]) {
    const backend = immediate
      ? session()
      : { requiresEmailConfirmation: true, token, refreshToken };
    const response = await proxyStudioRequest(
      request("registrations", "POST"),
      "registrations",
      {
        ...config,
        fetcher: async (_url, init) => {
          assert.equal(init.headers.get("Authorization"), null);
          return json(backend, 201);
        },
      }
    );
    const result = await response.json();
    assert.equal(result.token, undefined);
    assert.equal(result.refreshToken, undefined);
    if (immediate) {
      assert.equal(result.user.email, user.email);
      assert.ok(response.headers.has("Set-Cookie"));
    } else {
      assert.deepEqual(result, { requiresEmailConfirmation: true });
      assert.equal(response.headers.has("Set-Cookie"), false);
    }
  }
});

test("long JWTs fit individual cookies and shortened rotations clear all stale chunks", async () => {
  for (const access of ["a".repeat(8100), token]) {
    const response = await proxyStudioRequest(
      request("sessions", "POST"),
      "sessions",
      {
        ...config,
        fetcher: async () => json({ ...session(), token: access }),
      }
    );
    const cookies = responseCookies(response);
    assert.equal(cookies.length, 9);
    assert.ok(cookies.every((value) => value.length < 4096));
    const context = cookies
      .filter((value) => !value.includes("Max-Age=0"))
      .map((value) => value.split(";")[0])
      .join("; ");
    const restored = await proxyStudioRequest(
      request("avatars", "GET", { headers: { Cookie: context } }),
      "avatars",
      {
        ...config,
        fetcher: async (_url, init) => {
          assert.equal(init.headers.get("Authorization"), `Bearer ${access}`);
          return json({ items: [] });
        },
      }
    );
    assert.equal(restored.status, 200);
    if (access === token)
      assert.ok(
        cookies
          .find((value) => value.startsWith("ekza_studio_session.2=;"))
          .includes("Max-Age=0")
      );
  }
});

test("expired GET refreshes and retries exactly once, using only the HttpOnly refresh cookie", async () => {
  const calls = [];
  const refreshedToken = "new-access-token-after-rotation";
  const response = await proxyStudioRequest(
    request("avatars", "GET", { headers: { Cookie: sessionRequestCookies() } }),
    "avatars",
    {
      ...config,
      fetcher: async (url, init) => {
        calls.push(url);
        if (url.endsWith("sessions/refresh")) {
          assert.deepEqual(JSON.parse(init.body), { refreshToken });
          assert.equal(new Headers(init.headers).get("Authorization"), null);
          return json({ ...session(), token: refreshedToken });
        }
        if (calls.length === 1)
          return json({ error: { message: "Expired" } }, 401);
        assert.equal(
          init.headers.get("Authorization"),
          `Bearer ${refreshedToken}`
        );
        return json({ items: [] });
      },
    }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    `${config.api}/avatars`,
    `${config.api}/sessions/refresh`,
    `${config.api}/avatars`,
  ]);
  assert.deepEqual(await response.json(), { items: [] });
  assert.ok(response.headers.get("Set-Cookie").includes(refreshedToken));
});

test("expired streaming upload authenticates and refreshes before sending its body exactly once", async () => {
  const path = `revisions/${id}/source`;
  const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
  const calls = [];
  const response = await proxyStudioRequest(
    request(path, "PUT", {
      body: bytes,
      headers: { Cookie: sessionRequestCookies() },
    }),
    path,
    {
      ...config,
      fetcher: async (url, init) => {
        calls.push(url);
        if (url.endsWith("/session"))
          return json({ error: { message: "Expired" } }, 401);
        if (url.endsWith("/sessions/refresh")) return json(session());
        assert.deepEqual(
          new Uint8Array(await new Response(init.body).arrayBuffer()),
          bytes
        );
        return json({ saved: true });
      },
    }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    `${config.api}/session`,
    `${config.api}/sessions/refresh`,
    `${config.api}/${path}`,
  ]);
});

test("upstream 401 after a validated write never replays that write", async () => {
  let writes = 0;
  let checks = 0;
  const response = await proxyStudioRequest(
    request("avatars", "POST", {
      headers: { Cookie: sessionRequestCookies() },
    }),
    "avatars",
    {
      ...config,
      fetcher: async (url, init) => {
        if (url.endsWith("/session")) {
          checks++;
          return json({ user });
        }
        assert.ok(url.endsWith("/avatars"));
        writes++;
        await new Response(init.body).arrayBuffer();
        return json({ error: { message: "Expired" } }, 401);
      },
    }
  );
  assert.equal(response.status, 401);
  assert.equal(writes, 1);
  assert.equal(checks, 1);
  assert.ok(
    responseCookies(response).every((value) => value.includes("Max-Age=0"))
  );
});

test("invalid refresh clears both tokens but an auth outage preserves the session for retry", async () => {
  for (const status of [401, 503]) {
    let calls = 0;
    const response = await proxyStudioRequest(
      request("avatars", "GET", {
        headers: { Cookie: sessionRequestCookies(1) },
      }),
      "avatars",
      {
        ...config,
        fetcher: async (url) => {
          calls++;
          assert.ok(url.endsWith("sessions/refresh"));
          return json(
            { error: { message: "Internal secret must not be exposed" } },
            status
          );
        },
      }
    );
    assert.equal(response.status, status);
    assert.equal(calls, 1);
    assert.equal(response.headers.has("Set-Cookie"), status === 401);
    assert.equal((await response.text()).includes("Internal secret"), false);
  }
});

test("concurrent expired reads coalesce refresh-token rotation within the BFF", async () => {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let rotations = 0;
  const fetcher = async (url) => {
    if (url.endsWith("/sessions/refresh")) {
      rotations++;
      await barrier;
      return json(session());
    }
    return json({ items: [] });
  };
  const pending = ["avatars", "library"].map((path) =>
    proxyStudioRequest(
      request(path, "GET", { headers: { Cookie: sessionRequestCookies(1) } }),
      path,
      { ...config, fetcher }
    )
  );
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const responses = await Promise.all(pending);
  assert.equal(rotations, 1);
  assert.ok(responses.every((response) => response.status === 200));
  assert.ok(responses.every((response) => response.headers.has("Set-Cookie")));
});

test("logout clears all cookies even if the upstream revocation service is unavailable", async () => {
  let writes = 0;
  const response = await proxyStudioRequest(
    request("session", "DELETE", {
      headers: { Cookie: sessionRequestCookies() },
    }),
    "session",
    {
      ...config,
      fetcher: async (_url, init) => {
        if (init.method !== "DELETE") return json({ user });
        writes++;
        throw new Error("private revocation outage");
      },
    }
  );
  assert.equal(writes, 1);
  assert.equal(response.status, 502);
  assert.ok(
    responseCookies(response).every((value) => value.includes("Max-Age=0"))
  );
  assert.equal((await response.text()).includes("private revocation"), false);
});

test("401 and successful logout clear the browser session", async () => {
  for (const [method, status] of [
    ["GET", 401],
    ["DELETE", 204],
  ]) {
    const response = await proxyStudioRequest(
      request("session", method),
      "session",
      {
        ...config,
        fetcher: async () =>
          status === 204
            ? new Response(null, { status })
            : json({ error: { message: "Expired" } }, status),
      }
    );
    assert.equal(response.status, status);
    assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
  }
});

test("bodyless DELETE works when the Node adapter provides an empty stream", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  const response = await proxyStudioRequest(
    request("session", "DELETE", {
      body,
      duplex: "half",
      headers: { "Content-Type": "" },
    }),
    "session",
    {
      ...config,
      fetcher: async (_url, init) => {
        assert.equal(init.body, undefined);
        return new Response(null, { status: 204 });
      },
    }
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("private files are same-origin; public immutable files and foreign origins remain unchanged", () => {
  const privateSource = `${config.api}/revisions/${id}/files/source`;
  const asset = `${config.publicApi}/assets/${hash}/source`;
  assert.deepEqual(
    rewriteStudioFiles(
      {
        items: [
          {
            revision: {
              sourceUrl: privateSource,
              iosUrl: `${config.publicApi}/revisions/${id}/files/ios`,
              thumbnailUrl:
                "https://other.test/v1/studio/revisions/123/files/thumbnail",
            },
          },
          { revision: { sourceUrl: asset } },
        ],
      },
      [config.api, config.publicApi]
    ),
    {
      items: [
        {
          revision: {
            sourceUrl: `/api/studio/revisions/${id}/files/source`,
            iosUrl: `/api/studio/revisions/${id}/files/ios`,
            thumbnailUrl:
              "https://other.test/v1/studio/revisions/123/files/thumbnail",
          },
        },
        { revision: { sourceUrl: asset } },
      ],
    }
  );
});

test("large declared uploads are rejected before upstream receives any bytes", async () => {
  const path = `revisions/${id}/source`;
  const response = await proxyStudioRequest(
    request(path, "PUT", {
      headers: { "Content-Length": String(50 * 1024 * 1024 + 1) },
    }),
    path,
    {
      ...config,
      fetcher: () => {
        throw new Error("must not fetch");
      },
    }
  );
  assert.equal(response.status, 413);
});

test("chunked JSON bodies cannot bypass the streaming size limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(33 * 1024));
      controller.close();
    },
  });
  const response = await proxyStudioRequest(
    request("avatars", "POST", { body: stream, duplex: "half" }),
    "avatars",
    {
      ...config,
      fetcher: async (_url, init) => {
        await new Response(init.body).arrayBuffer();
        return json({});
      },
    }
  );
  assert.equal(response.status, 413);
});

test("raw uploads preserve their bytes with a fixed content type", async () => {
  const path = `revisions/${id}/source`;
  const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
  const response = await proxyStudioRequest(
    request(path, "PUT", {
      body: bytes,
      headers: { "Content-Type": "text/html" },
    }),
    path,
    {
      ...config,
      fetcher: async (_url, init) => {
        assert.equal(
          init.headers.get("Content-Type"),
          "application/octet-stream"
        );
        assert.deepEqual(
          new Uint8Array(await new Response(init.body).arrayBuffer()),
          bytes
        );
        return json({ ok: true });
      },
    }
  );
  assert.equal(response.status, 200);
});

test("private previews have safe media headers and cache tags never reach upstream", async () => {
  const path = `revisions/${id}/files/ios`;
  const response = await proxyStudioRequest(
    request(`${path}?v=${hash}`),
    path,
    {
      ...config,
      fetcher: async (url) => {
        assert.equal(url, `${config.api}/${path}`);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "text/html", "Set-Cookie": "upstream=no" },
        });
      },
    }
  );
  assert.equal(response.headers.get("Content-Type"), "model/vnd.usdz+zip");
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([1, 2, 3])
  );
});

test("arbitrary queries, redirects and error details cannot turn the BFF into an open proxy", async () => {
  const query = await proxyStudioRequest(
    request("catalog?url=https://evil.test"),
    "catalog",
    {
      ...config,
      fetcher: () => {
        throw new Error("must not fetch");
      },
    }
  );
  assert.equal(query.status, 404);
  const redirect = await proxyStudioRequest(request("catalog"), "catalog", {
    ...config,
    fetcher: async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.test" },
      }),
  });
  assert.equal(redirect.status, 502);
  const failed = await proxyStudioRequest(request("catalog"), "catalog", {
    ...config,
    fetcher: async () => {
      throw new Error(`private backend trace ${token}`);
    },
  });
  assert.equal(failed.status, 502);
  assert.equal((await failed.text()).includes(token), false);
});

test("uploads also work with the Remix Fetch/stream polyfill used by vite.config", async () => {
  const globals = Object.fromEntries(
    ["File", "Headers", "Request", "Response", "fetch", "FormData"].map(
      (name) => [name, globalThis[name]]
    )
  );
  try {
    installGlobals();
    const path = `revisions/${id}/source`;
    const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
    const response = await proxyStudioRequest(
      request(path, "PUT", { body: bytes }),
      path,
      {
        ...config,
        fetcher: async (_url, init) => {
          assert.deepEqual(
            new Uint8Array(await new Response(init.body).arrayBuffer()),
            bytes
          );
          return json({ received: true });
        },
      }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
  } finally {
    Object.assign(globalThis, globals);
  }
});
