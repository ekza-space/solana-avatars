# Avatar Studio

Avatar Studio is the default product: `/` redirects to `/studio`, and a trailing
slash is canonicalized without switching authentication systems. Public pages,
error recovery and the Studio shell never mount Solana connection providers.
The catalog is browsable without an account. Sign-in and registration have their
own account view, using ordinary email/password authentication.

The former wallet profile is preserved at `/web3/profile`. `/web3` is a public,
explicitly experimental hub for it and the existing `/deployer`, `/minter`,
`/users` tools. Wallet providers are lazy-loaded only on those tool pages, with
auto-connect disabled. They are not an alternative login for the Studio account.

| URL | Purpose |
| --- | --- |
| `/studio?view=catalog` | Public approved catalog (default) |
| `/studio?view=library` | Saved library; asks for sign-in when needed |
| `/studio?view=uploads` | Own submissions; all submissions for a curator |
| `/studio?view=new` | New avatar upload |
| `/studio?view=review` | Curator-only review queue |
| `/studio?view=account` | Sign-in, registration, account details and sign-out |

Direct links, browser back and reload retain the selected view. Protected views
retain the visitor's intent through sign-in. Unsaved form/file changes trigger a
navigation warning; in-flight actions must finish before internal navigation.

The backend contract lives at the Ekza umbrella root in
`ITEC-DEMO-CONTRACT.md`. Email/password registration and login use the backend's
Supabase Auth integration. Public signup always creates a creator; moderator
privileges are assigned by the operator, never by the browser. Signup either
signs the visitor in immediately or asks them to confirm their email and return
to sign in, according to the Supabase project's email-confirmation setting.
Password recovery is not yet exposed in this portal.

## Local configuration

Set these in the launching process. No credentials belong in browser-facing
Vite variables or committed files.

| Variable                     | Default                           | Purpose                                                |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ |
| `EKZA_STUDIO_API_URL`        | `http://127.0.0.1:8000/v1/studio` | Server-to-server backend address                       |
| `EKZA_STUDIO_PUBLIC_API_URL` | Same as backend address           | Public address passed to Space, including `/v1/studio` |
| `EKZA_STUDIO_SPACE_URL`      | `https://space.ekza.io`           | Space launch destination                               |

Run the existing `npm run dev` command and open `/studio`. The public API
address must be reachable by the browser or iPhone, not only by the web server.
For an HTTPS web deployment it must also use HTTPS. For a LAN demo, use the
computer's LAN address as the public API address.

For a presentation, use the Mirror repository's `tools/studio_demo.py` launcher:
it builds Studio and Space and serves compiled assets without HMR. `--web-dev`
and `--space-dev` explicitly opt back into development servers. To run Studio
alone after a build, `npm run build && npm start` resolves either the standard
Remix server bundle or the Vercel preset's named bundle; it refuses missing or
ambiguous outputs instead of silently starting another mode.

The local launcher also enables `/demo`, a rehearsal guide with downloadable
prepared Robert VRM/PNG. Its source must match the rehearsed hash. These helper
routes return 404 unless the server-only `EKZA_STUDIO_DEMO=1` flag is set. No
passwords or local file paths are sent to the page. The sample demonstrates real
publication/moderation but uses a prepared conversion with fresh validation;
arbitrary-model conversion on this Mac is a separate acceptance check.

The local backend must enable Studio, connect to local Supabase and run its model
worker. If the backend is disabled or unreachable, the portal displays the
problem and provides Reconnect; it does not pretend a model was processed.

## Flow

1. Creator registers with email/password (or signs in), uploads a humanoid VRM (maximum 50 MiB), optionally adds a
   PNG cover (maximum 5 MiB), describes its usage permission and submits.
2. Draft, queued, processing and review status remain private. Pending status
   refreshes automatically, including an initially empty curator queue. Failed or returned versions can be replaced by a
   new draft with the same avatar identity.
3. A curator signs in, opens Review queue, checks the exact VRM and prepared
   USDZ, then approves or returns it with a note. Files, version IDs and hashes
   remain inspectable. Approved versions can be unpublished separately.
4. Published avatars appear in Discover. Users can save them to My library,
   sign in with the same account in Mirror, or open the published VRM in Space.
5. Solana collection tools remain available as an optional separate workflow;
   Studio does not claim to mint tokens or prove wallet ownership.

Use separate browser profiles for creator and curator during a presentation;
tabs of the same browser profile share the same session cookie.

## Proxy and hosting

`/api/studio/*` accepts only fixed API paths, UUIDs, hashes and verbs. It keeps
the Supabase access and refresh tokens in separate HttpOnly, SameSite cookies, validates same-origin
mutations, drops browser-supplied authorization and does not follow backend
redirects. Private file URLs become same-origin preview URLs; their responses
are not cached. Optional SHA-256 cache tags on private previews prevent a
replaced draft model from reusing the renderer's earlier cached source.

Tokens never enter loader data, browser JSON or local storage. JWTs are split
into fixed-size cookie chunks to stay under the browser's per-cookie limit;
every rotation also clears stale chunks. Cookies have a 30-day upper lifetime,
but actual access is always authorized by the backend/Supabase session. Cookies
are Secure on HTTPS and are scoped to `/api/studio`.

The BFF refreshes sessions before expiry and retries a rejected GET once. Before
any authenticated write it checks the session, refreshing if necessary, **before
reading the request body**. Uploads and other writes are never automatically
replayed. Concurrent refreshes within the same server process are coalesced.
An auth-service outage preserves cookies for retry; invalid sessions and logout
clear both tokens. Logout also calls the backend to revoke that session.

Uploads stream with a byte limit and timeout. Serverless ingress/body/time
limits can be lower than the application's 50 MiB limit. Before enabling this
on the existing hosting, verify that the hosting accepts representative models
through this proxy; otherwise use an appropriate server ingress or implement
signed direct uploads. No hosting settings are changed by this feature.

## Verification

- `npm run typecheck`
- `npm run test:studio` (Node's test runner + the existing TypeScript compiler)
- `npm run build`

On the running compiled local demo:

```sh
STUDIO_PRODUCTION_ORIGIN=http://127.0.0.1:5188 STUDIO_EXPECT_DEMO=1 npm run test:studio
```

This verifies direct routes, redirects, public navigation, 404 recovery and real
production module availability. Offline tests cover URL intent, unsaved-form
guards, serialized reads/writes, local sample restrictions and build resolution.
These are HTTP/component/helper checks, **not browser hydration or WebGL tests**.

Proxy tests cover the allowlist, CSRF, signup/confirmation, session isolation,
both-token stripping, chunked JWTs, refresh and non-replayed writes,
logout/expiry, private URL rewriting, upload limits, exact upload bytes, safe
file headers and rejection of redirects/arbitrary proxy destinations.

With the local ITEC launcher running, an opt-in integration check is also
available:

```sh
node tests/studio-integration.mjs /absolute/path/to/local/demo.json
```

It accepts loopback servers only, registers a new creator through Supabase,
exercises real refresh-token rotation, creates a rehearsal avatar, uploads the
provided Robert sample, waits for processing, verifies private VRM/USDZ hashes,
approves the exact revision, saves it, verifies Mirror's library feed and checks logout. It exercises the real
Remix proxy and backend; it does not replace a browser, visual model or physical
iPhone rehearsal. It does not print or persist passwords or session tokens.
