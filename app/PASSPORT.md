# Wallet purchase passport

The existing Node storefront hosts `/api/passport/*`. This is independent of
Studio/Supabase authentication. A wallet signature authenticates a session;
neither a signature nor public NFT metadata is proof of a purchase.

## Configuration

Set these in the launching process, never in browser-facing Vite variables:

| Variable | Meaning |
| --- | --- |
| `EKZA_PASSPORT_ORIGIN` | Public storefront origin, e.g. `https://avatar.ekza.io`; signed challenges bind this origin. |
| `EKZA_PASSPORT_RPC_URL` | Operator-selected Solana devnet RPC, including any private API key. |
| `EKZA_PASSPORT_REGISTRY_URL` | Fixed approved registry catalogue URL, e.g. `https://registry.ekza.io/v1/avatars`. |
| `EKZA_PASSPORT_MINTER_PROGRAM_ID` | Optional override; defaults to the existing `29KLL…4TKz` avatar minter. |
| `EKZA_PASSPORT_ALLOWED_ORIGINS` | Comma-separated exact browser origins, e.g. `https://space.ekza.io`. The storefront origin is also allowed. |
| `EKZA_PASSPORT_ALLOW_LOCALHOST` | Set to `1` only for explicit local development; permits HTTP loopback origin/RPC/registry/assets. |

Missing configuration returns 503. RPC genesis must be Solana devnet before
chain access. Request payloads cannot choose upstream servers or minter programs.
No credentials are logged. All expiry fields are ISO-8601 UTC strings.

## API and integration

The complete wire contract is frozen in the umbrella
`.agent/tasks/AVATAR-ROUNDTRIP-20260911/spec.md`. The additional read-only
`GET /api/passport/device?userCode=…` returns only `{projectId,userCode,expiresAt}`
so the approval page can show the actual requesting application. Public catalog
returns `{schema:"ekza.passport.catalog.v1",network:"solana-devnet",items:[…]}`;
catalog entries have `avatarId,name,thumbnailUrl,support`, with no mint or claim
that the visitor owns them.

Browser/native sessions expire after 30 minutes. Challenges expire after five
minutes and every signature attempt consumes its nonce. Device pairing expires
after ten minutes; the device secret travels only in POST bodies. The public
verification URL contains only the user code. Approved native sessions can issue
tickets only for their original project. Library entries can still display all
approved compatible projects.

Tickets last 60 seconds and bind project, player session, mint and avatar ID.
Consumption removes the ticket synchronously before RPC work, then checks current
ownership and unchanged approved rendition. Wrong project/session, replay,
expiry, transfer and revoked approval fail. Games must compare the returned
identity and rendition with the requested cosmetic, then verify file size/hash.

`@ekza/stellar-sdk/passport` provides the framework-neutral `PassportClient` and
`downloadVerifiedRendition`. SDK usage does not introduce a wallet adapter or
payment requirement for game developers.

## Browser publication and purchase transport

Passport purchase links include the canonical AvatarData address and
`network=devnet`. Those links and `/deployer?network=devnet` lock the legacy
tool provider to Devnet without overwriting the user's other network preference.
IPFS resolution honors the same context, so an old Localnet preference cannot
silently redirect Devnet metadata to a local Kubo gateway.
The minter fetches the requested program-owned AvatarData directly, verifies its
index-derived PDA and displays that collection, including ordinary templates
without a Stellar link. Failed collection/metadata reads have an explicit retry;
metadata reads are bounded, and exhausted collections cannot be purchased.
Devnet collection metadata is fetched through same-origin
`GET /api/avatar-metadata?avatarData=<PDA>`. The server verifies the canonical
program-owned template and its IPFS CID, then checks registered avatars against
the registry's exact `metadataSha256`. It uses the fixed Ekza IPFS gateway; redirects,
arbitrary URLs and documents larger than 256 KiB are rejected. Only verified
immutable bytes are cached (at most 32 documents), with chain/catalog identity
rechecked on every lookup. New unapproved publications use their on-chain CID
without claiming registry approval or game support. Browser fetches allow
60 seconds for bounded upstream chain/catalog reads and content retrieval.
Visitors can browse `/minter` prices/metadata and prepare a local model on
`/deployer` before connecting a wallet. Anchor reads use an inert provider whose
signing functions reject; it never represents an authenticated owner. Purchase
and publication still require the user's connected wallet and signature.

The buyer and creator call `useMinterConnection()`. On Devnet it uses the existing
Node host at `/api/devnet-rpc` and the same private `EKZA_PASSPORT_RPC_URL` as the
passport. Provider credentials never enter a Vite variable, HTTP response or
WebSocket URL. Other legacy networks retain their existing Connection.

This is a restricted minter transport, not a general Solana proxy. It rejects
batches, foreign or missing origins, arbitrary RPC methods, oversized payloads
and custom upstream options. Read methods cover account data, latest blockhash,
signature status, block height, blockhash validity, balances/rent, genesis and
transaction inspection. Submissions must be fully signed legacy transactions
with exactly one configured-program `initialize_avatar` or direct `mint_nft`
instruction. The server verifies required signatures, arguments, canonical
AvatarData/registry/escrow/ATA/metadata accounts, and program IDs before forwarding
the original bytes once with preflight enabled. It owns no wallet. Stellar bridge
publication/mint instructions are outside this direct transport's scope.

Creator uploads use `/api/upload-metadata` with a normal Passport browser bearer
session. The author signs the existing wallet challenge before the first upload;
device sessions cannot spend the storefront's upload budget. The API authenticates
before consuming the request, validates all files before contacting Pinata, caps
multipart bodies at 25 MiB (four files, 20 MiB each) and JSON at 256 KiB, and checks
PNG/GLB/VRM headers and the metadata creator wallet. Request bodies and upstream
storage operations each have a 30-second deadline; responses are bounded and
upstream diagnostics are redacted. Limits are 12 requests per wallet per minute,
60 globally per minute, and two concurrent requests. `PINATA_JWT` is server-only.
The browser sends no upload after a wallet/network change, discards stale results,
and requires explicit retry after expiry or storage failure. This upload flow is
Devnet-only; other legacy networks show a link to the Devnet publication page.
Studio uses its separate existing authenticated upload API and is unchanged.

Confirmation uses HTTP status polling for at most 45 seconds; the client does
not open a provider WebSocket. An uncertain submission is checked using the
original signed transaction's signature without automatic retransmission.
`MinterPendingError.signature` permits explicit recovery without creating a
second transaction. The buyer captures and stores the signature immediately after
wallet signing, before broadcasting, per wallet/network,
disables another purchase, and offers a read-only confirmation check plus
receipt/library recovery. A confirmed failure permits another attempt; unknown
status alone does not prove that the transaction was dropped. Pending state is
retained across page reloads when sessionStorage is available. Definite
validation/preflight rejection uses `MinterRejectedError` and permits a corrected
attempt; ambiguous transport errors preserve the original transaction instead.

## Purchase provenance

Canonical product ID is `solana:devnet:avatar-data:<AvatarData PDA>`. Each NFT
mint is one copy. The service verifies the successful original transaction,
configured program ID, `mint_nft` discriminator, instruction account positions,
canonical program-owned template PDA/index, metadata policy, creator payment
to escrow/release vault when the template price is positive, and minted
post-token balance. It then checks
current SPL ownership and a non-inflationary mint before granting access.
Only direct top-level mints from the existing storefront are accepted. A
successful outer transaction can contain a caught, rolled-back minter CPI;
third-party CPI mint wrappers are deliberately unsupported until their exact
invocation success can be established.

The catalogue's metadata URI is only a cheap candidate filter, never proof.
Copied metadata, format compatibility and designer-supplied game names grant
nothing. Only explicit `projectSupport` approvals selecting a unique ready
rendition are returned. Authentic zero-price sample NFTs remain in the library
with `priceLamports:"0"`; clients must not label them paid purchases. Positive
`priceLamports` records the verified original template fee, independently of
network fees/rent. The paid acceptance criterion still requires a nonzero mint.

Successful receipt lookups are cached in memory. After restart, discovery reads
the owned mint's transaction history and reconstructs the authenticated mapping.
Submitting the original signature is a faster path, not an ownership grant.
Discovery is bounded to 200 owned NFT candidates and 2,000 history entries per
candidate. Missing/truncated RPC history and upstream failures are visible; an
archival-capable RPC is needed for old receipts. No database of unauthenticated
mint/URI associations is trusted.
Transient read-only HTTP 429/502/503/504 and unhealthy RPC responses use bounded
backoff. Simultaneous identical RPC requests share their in-flight read only;
completed ownership reads are never cached for a later admission decision.

## Hosting boundary

This implementation requires **one long-lived Node process** for the temporary
session/device/ticket maps. A restart intentionally signs users out; verified
purchase provenance is reconstructed from chain. This is suitable for the
compiled local rehearsal and a deliberately configured single-process host.
It is not ready for a stateless or multi-instance serverless deployment: those
hosts require a shared atomic expiring store before deploying passport. In-memory
one-use semantics cannot be claimed across multiple instances. No hosting,
production credentials or deployment settings are changed by this feature.

## Checks

```sh
node --test tests/passport-security.test.mjs tests/passport-client.test.mjs tests/minter-rpc.test.mjs tests/minter-metadata.test.mjs tests/creator-upload.test.mjs tests/avatar-publication.test.mjs
npm run typecheck
npm run build
```

The tests use generated ephemeral Ed25519 keys and mocked RPC responses. They
exercise authentication, pairing, provenance, restart reconstruction, current
ownership, project approval, ticket scope/replay and CORS. They are not a real
devnet purchase, browser wallet interaction or game visual rehearsal.
