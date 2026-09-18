// This is a deliberately narrow BFF, not a general URL proxy. Only the server
// chooses the destination; browser-supplied authorization is never forwarded.
const SESSION_COOKIE = "ekza_studio_session";
const REFRESH_COOKIE = "ekza_studio_refresh";
const EXPIRY_COOKIE = "ekza_studio_expiry";
const COOKIE_AGE = 30 * 86400;
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{16,8192}$/;
const REFRESH_PATTERN = /^[A-Za-z0-9._~-]{8,8192}$/;
const COOKIE_CHUNK = 2800;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const HASH = "[0-9a-f]{64}";
const SOURCE_LIMIT = 50 * 1024 * 1024;
const THUMBNAIL_LIMIT = 5 * 1024 * 1024;
const JSON_LIMIT = 32 * 1024;
const RESPONSE_LIMIT = 4 * 1024 * 1024;

const routes: Array<[string, RegExp]> = [
  ["GET", /^(status|session|avatars|catalog|library|library\/ios)$/],
  ["POST", /^(sessions|registrations|avatars)$/],
  ["DELETE", /^session$/],
  ["POST", new RegExp(`^avatars/${UUID}/(revisions|unpublish)$`)],
  ["PUT", new RegExp(`^revisions/${UUID}/(source|thumbnail)$`)],
  ["POST", new RegExp(`^revisions/${UUID}/(submit|review)$`)],
  ["GET", new RegExp(`^revisions/${UUID}/files/(source|thumbnail|ios)$`)],
  ["GET", new RegExp(`^catalog/${UUID}$`)],
  ["GET", new RegExp(`^assets/${HASH}/(source|thumbnail|ios)$`)],
  ["POST", new RegExp(`^library/${UUID}$`)],
  ["DELETE", new RegExp(`^library/${UUID}$`)],
];

function httpUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid Studio URL configuration");
  }
  return url;
}

export function studioConfiguration() {
  const api = httpUrl(
    process.env.EKZA_STUDIO_API_URL || "http://127.0.0.1:8000/v1/studio"
  );
  const publicApi = httpUrl(process.env.EKZA_STUDIO_PUBLIC_API_URL || api.href);
  const space = httpUrl(
    process.env.EKZA_STUDIO_SPACE_URL || "https://space.ekza.io"
  );
  return {
    api: api.href.replace(/\/$/, ""),
    publicApi: publicApi.href.replace(/\/$/, ""),
    space: space.href,
  };
}

export function allowedStudioPath(method: string, path: string) {
  return routes.some(
    ([verb, pattern]) => verb === method && pattern.test(path)
  );
}

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function tokenFromCookie(request: Request, name: string): string | undefined {
  const chunks = [0, 1, 2].map((index) =>
    cookieValue(request, `${name}.${index}`)
  );
  const value = chunks[0]
    ? chunks.map((part) => part || "").join("")
    : cookieValue(request, name);
  const pattern = name === REFRESH_COOKIE ? REFRESH_PATTERN : TOKEN_PATTERN;
  return value && pattern.test(value) ? value : undefined;
}

function cookie(request: Request, name: string, value: string) {
  return `${name}=${value}; Path=/api/studio; HttpOnly; SameSite=Lax; Max-Age=${
    value ? COOKIE_AGE : 0
  }${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

type Session = {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: "creator" | "moderator";
  };
};

function validSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Session;
  return (
    typeof session.token === "string" &&
    TOKEN_PATTERN.test(session.token) &&
    typeof session.refreshToken === "string" &&
    REFRESH_PATTERN.test(session.refreshToken) &&
    typeof session.expiresAt === "string" &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Date.parse(session.expiresAt) > Date.now() &&
    !!session.user &&
    typeof session.user.id === "string" &&
    typeof session.user.username === "string" &&
    typeof session.user.email === "string" &&
    ["creator", "moderator"].includes(session.user.role)
  );
}

function sessionCookies(request: Request, output: Headers, session?: Session) {
  // JWTs can exceed a browser's single-cookie limit. Fixed-size HttpOnly
  // chunks also clear any leftover pieces when the next token is shorter.
  for (const [name, value] of [
    [SESSION_COOKIE, session?.token || ""],
    [REFRESH_COOKIE, session?.refreshToken || ""],
  ]) {
    output.append("Set-Cookie", cookie(request, name, ""));
    for (let index = 0; index < 3; index++)
      output.append(
        "Set-Cookie",
        cookie(
          request,
          `${name}.${index}`,
          value.slice(index * COOKIE_CHUNK, (index + 1) * COOKIE_CHUNK)
        )
      );
  }
  output.append(
    "Set-Cookie",
    cookie(
      request,
      EXPIRY_COOKIE,
      session ? String(Date.parse(session.expiresAt)) : ""
    )
  );
}

// A page can request its profile and private files concurrently. Coalesce
// in-flight rotations within this server; never expose refresh tokens to JS.
const refreshing = new Map<string, Promise<Session>>();

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  const output = new Headers(headers);
  output.set("Content-Type", "application/json; charset=utf-8");
  output.set("Cache-Control", "no-store");
  output.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers: output });
}

function failure(status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message, details: [] } }, status);
}

export function rewriteStudioFiles(value: unknown, bases: string[]): unknown {
  if (Array.isArray(value))
    return value.map((item) => rewriteStudioFiles(item, bases));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (
        ["sourceUrl", "thumbnailUrl", "iosUrl"].includes(key) &&
        typeof item === "string"
      ) {
        for (const base of bases) {
          if (item.startsWith(`${base}/`)) {
            const suffix = item.slice(base.length + 1);
            if (
              new RegExp(
                `^revisions/${UUID}/files/(source|thumbnail|ios)$`
              ).test(suffix)
            )
              return [key, `/api/studio/${suffix}`];
          }
        }
      }
      return [key, rewriteStudioFiles(item, bases)];
    })
  );
}

async function boundedJson(response: Response) {
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    count += value.byteLength;
    if (count > RESPONSE_LIMIT) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(count);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function proxyStudioRequest(
  request: Request,
  path: string,
  options: {
    api: string;
    publicApi: string;
    fetcher?: typeof fetch;
  } = studioConfiguration()
): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const cacheVersion =
    method === "GET" &&
    new RegExp(`^revisions/${UUID}/files/(source|thumbnail|ios)$`).test(path) &&
    new RegExp(`^\\?v=${HASH}$`).test(url.search);
  if (!allowedStudioPath(method, path) || (url.search && !cacheVersion))
    return failure(
      404,
      "studio_route_not_found",
      "This Studio endpoint is not available."
    );
  if (
    method !== "GET" &&
    (request.headers.get("Origin") !== url.origin ||
      request.headers.get("Sec-Fetch-Site") === "cross-site")
  ) {
    return failure(
      403,
      "studio_origin_rejected",
      "Please submit this action from the Avatar Studio page."
    );
  }

  let api: string;
  try {
    api = httpUrl(options.api).href.replace(/\/$/, "");
  } catch {
    return failure(
      503,
      "studio_configuration",
      "Avatar Studio is not configured correctly."
    );
  }
  const sourceUpload = method === "PUT" && path.endsWith("/source");
  const thumbnailUpload = method === "PUT" && path.endsWith("/thumbnail");
  const limit = sourceUpload
    ? SOURCE_LIMIT
    : thumbnailUpload
    ? THUMBNAIL_LIMIT
    : JSON_LIMIT;
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    return failure(
      413,
      "studio_upload_too_large",
      `This upload exceeds the ${Math.round(limit / 1024 / 1024)} MB limit.`
    );
  }
  const headers = new Headers({ Accept: "application/json" });
  const authRequest = path === "sessions" || path === "registrations";
  const publicRequest =
    authRequest ||
    path === "status" ||
    path === "catalog" ||
    path.startsWith("catalog/") ||
    path.startsWith("assets/");
  const logout = path === "session" && method === "DELETE";
  let token = tokenFromCookie(request, SESSION_COOKIE);
  const refreshToken = tokenFromCookie(request, REFRESH_COOKIE);
  const output = new Headers();
  let rotated = false;
  const fetcher = options.fetcher || fetch;
  if (token && !publicRequest) headers.set("Authorization", `Bearer ${token}`);
  const withCookies = (response: Response) => {
    // Headers.getSetCookie is not present in Remix's Fetch polyfill.
    const cookies = output.get("Set-Cookie");
    if (cookies) {
      // Our cookies use Max-Age, never a comma-containing Expires attribute.
      for (const value of cookies.split(/, (?=ekza_studio_)/))
        response.headers.append("Set-Cookie", value);
    }
    return response;
  };
  const denied = () => {
    sessionCookies(request, output);
    return withCookies(
      failure(
        401,
        "studio_session_expired",
        "Your session has expired. Please sign in again."
      )
    );
  };
  const refreshSession = async () => {
    if (!refreshToken || rotated) return false;
    rotated = true;
    const key = `${api}\n${refreshToken}`;
    let pending = refreshing.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await fetcher(`${api}/sessions/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ refreshToken }),
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 401 || response.status === 400)
          throw new Error("studio_refresh_rejected");
        if (!response.ok) throw new Error("studio_refresh_unavailable");
        const session: unknown = await boundedJson(response);
        if (!validSession(session))
          throw new Error("studio_refresh_unavailable");
        return session;
      })();
      refreshing.set(key, pending);
    }
    let session: Session;
    try {
      session = await pending;
    } catch (error) {
      if (error instanceof Error && error.message === "studio_refresh_rejected")
        return false;
      throw error;
    } finally {
      if (refreshing.get(key) === pending) refreshing.delete(key);
    }
    token = session.token;
    headers.set("Authorization", `Bearer ${token}`);
    sessionCookies(request, output, session);
    return true;
  };

  try {
    if (!publicRequest) {
      const expiry = Number(cookieValue(request, EXPIRY_COOKIE));
      if (
        refreshToken &&
        (!token || (Number.isFinite(expiry) && expiry < Date.now() + 60_000))
      ) {
        if (!(await refreshSession())) return denied();
      }
      // Authenticate BEFORE consuming a streamed upload or sending a write.
      // A write is never replayed automatically, even when upstream says 401.
      if (method !== "GET" && token) {
        const check = await fetcher(`${api}/session`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          redirect: "manual",
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(20_000),
          ]),
        });
        if (check.status === 401) {
          await check.body?.cancel();
          if (!(await refreshSession())) return denied();
        } else {
          await check.body?.cancel();
          if (!check.ok) throw new Error("studio_session_check_failed");
        }
      }
    }
  } catch {
    if (logout) sessionCookies(request, output);
    return withCookies(
      failure(
        503,
        "studio_auth_unavailable",
        "Sign-in could not be checked. Reconnect and try again; your upload was not sent."
      )
    );
  }
  let tooLarge = false;
  let count = 0;
  let body: ReadableStream<Uint8Array> | undefined;
  // DELETE endpoints take no body. Remix's Node adapter can nevertheless
  // provide an empty readable stream for them, without a Content-Type header.
  if (method !== "GET" && method !== "DELETE" && request.body) {
    if (
      !sourceUpload &&
      !thumbnailUpload &&
      request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
    ) {
      return withCookies(
        failure(415, "studio_content_type", "Studio actions require JSON.")
      );
    }
    headers.set(
      "Content-Type",
      sourceUpload
        ? "application/octet-stream"
        : thumbnailUpload
        ? "image/png"
        : "application/json"
    );
    // Remix can supply its own stream implementation. Bridging through a
    // reader works with both its polyfill and native Fetch; pipeThrough with a
    // native TransformStream rejects the polyfill before the request is sent.
    const reader = request.body.getReader();
    body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          count += value.byteLength;
          if (count > limit) {
            tooLarge = true;
            await reader.cancel("Upload size limit exceeded");
            controller.error(new Error("Upload size limit exceeded"));
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
  }

  try {
    const send = () =>
      fetcher(`${api}/${path}`, {
        method,
        headers,
        body,
        redirect: "manual",
        duplex: "half",
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(
            method === "PUT" ||
              path.includes("/files/") ||
              path.startsWith("assets/")
              ? 120_000
              : 20_000
          ),
        ]),
      } as RequestInit & { duplex: "half" });
    let upstream = await send();
    if (
      upstream.status === 401 &&
      method === "GET" &&
      !publicRequest &&
      !rotated &&
      refreshToken
    ) {
      await upstream.body?.cancel();
      if (!(await refreshSession())) return denied();
      upstream = await send();
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      if (logout) sessionCookies(request, output);
      return withCookies(
        failure(
          502,
          "studio_redirect",
          "Avatar Studio returned an unexpected redirect."
        )
      );
    }
    if (upstream.status === 204) {
      output.set("Cache-Control", "no-store");
      if (logout) sessionCookies(request, output);
      return new Response(null, { status: 204, headers: output });
    }
    if (
      method === "GET" &&
      upstream.ok &&
      /\/(files\/|assets\/)/.test(`/${path}`)
    ) {
      const kind = path.split("/").at(-1);
      const type =
        kind === "thumbnail"
          ? "image/png"
          : kind === "ios"
          ? "model/vnd.usdz+zip"
          : "model/gltf-binary";
      return withCookies(
        new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": type,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `inline; filename="avatar.${
              kind === "thumbnail" ? "png" : kind === "ios" ? "usdz" : "vrm"
            }"`,
          },
        })
      );
    }
    if (upstream.status >= 500) {
      await upstream.body?.cancel();
      return withCookies(failure(
        upstream.status,
        "studio_unavailable",
        method === "GET"
          ? "Avatar Studio is temporarily unavailable. Please try again later."
          : "We could not confirm that your changes were saved. Check their status when Studio is available before trying again."
      ));
    }
    const result = await boundedJson(upstream);
    if (authRequest && upstream.ok) {
      if (
        path === "registrations" &&
        result.requiresEmailConfirmation === true
      ) {
        return jsonResponse(
          { requiresEmailConfirmation: true },
          upstream.status
        );
      }
      if (!validSession(result)) {
        return failure(
          502,
          "studio_invalid_session",
          "Avatar Studio returned an invalid session. Please try again."
        );
      }
      sessionCookies(request, output, result);
      return jsonResponse(
        {
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            role: result.user.role,
          },
          expiresAt: result.expiresAt,
        },
        upstream.status,
        output
      );
    }
    if (logout || (upstream.status === 401 && !publicRequest))
      sessionCookies(request, output);
    return jsonResponse(
      rewriteStudioFiles(result, [api, options.publicApi.replace(/\/$/, "")]),
      upstream.status,
      output
    );
  } catch {
    if (logout) sessionCookies(request, output);
    return withCookies(
      tooLarge
        ? failure(
            413,
            "studio_upload_too_large",
            "The file exceeds the upload limit. Choose a smaller file and retry."
          )
        : failure(
            502,
            "studio_unreachable",
            "Avatar Studio could not be reached. Reconnect and refresh to check the saved status before retrying."
          )
    );
  }
}
