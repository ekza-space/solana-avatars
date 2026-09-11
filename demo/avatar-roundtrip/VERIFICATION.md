# Paid avatar rehearsal — 11 September 2026

The local Solana Devnet rehearsal used one actual 0.001-test-SOL purchase of
Robert, a CC0 avatar by Polygonal-Mind. The canonical template, NFT instance,
transaction, creator payment and three checksum-pinned renditions are recorded in
`purchase.public.json` and `catalog.json`. No mainnet payment or production
deployment was performed.

## Observed results

| Step | Evidence |
| --- | --- |
| Template publication and paid mint | Successful Devnet transactions in `purchase.public.json`; creator escrow increased by exactly 1,000,000 lamports, excluding rent/network fees. |
| Creator upload | Actual signed browser-session authentication, real Pinata VRM upload and exact 1,656,464-byte readback; labelled rehearsal JSON also verified. Anonymous upload returned 401. See [creator upload proof](evidence/creator-upload-proof.json). This later upload did not create another collection or purchase. |
| Storefront | Real guest browser displayed collection18, Robert's original metadata, price0.001 SOL, supply1/5, all three approved project badges and the loaded 3D model. Creator preview remained current through file replacement and field edits. |
| Cold ownership discovery | Seven real HTTP checks passed after a fresh compiled-server restart, before explicit receipt registration: buyer ownership, non-owner rejection, all three project scopes, one-use ticket replay refusal and exact model bytes. See [integrated proof](evidence/live-http-proof.json). |
| Ekza Space | Actual browser paired with the buyer, displayed Robert in the purchased library, rendered the model and reported `Equipped`. |
| Ekza Mirror | Actual signed iOS Simulator app paired, selected the approved USDZ and displayed Robert. Relaunch restored its wallet library from Keychain while the Passport server remained running. See [Mirror screenshot](evidence/mirror-purchased-avatar.png). |
| Omoba | Actual native client admitted through the game server using the paid avatar, with rendered scenes and animation probes. Separate adversarial UDP fixtures tested protected-cosmetic rejection and replication. See [Omoba screenshot](evidence/omoba-purchased-avatar.png). |

## Verification completed

- Storefront: TypeScript and production build pass; 133 tests pass, three optional
  environment-dependent tests skipped, no failures.
- TypeScript SDK: 49 tests, typecheck and build pass.
- Space: 51 tests, typecheck and production build pass.
- Mirror backend: 209 tests pass; 18 optional Supabase checks skipped.
- Mirror Swift: 89 tests, one existing bundle/UTType skip, no failures;
  Debug/Release checks and signed full Simulator build pass.
- Rust/Omoba: 315 SDK/client/server/passport/shared tests and nine adversarial
  UDP checks pass. Independent review accepted the isolated implementation.

The commit/push handoff additionally verified a clean Core `npm ci`, typecheck,
51 tests and production build with the Git-pinned SDK and no sibling SDK checkout.
Omoba's locked client/server/importer build and focused SDK/importer/shared/admission
checks passed with its Git-pinned Rust SDK and no local Cargo patch. The exact
published sibling revisions are in `source-revisions.json`.

These are distinct evidence layers. Mocked regression tests are not presented as
chain purchases; API checks are not presented as visual rendering.

## Limits before public release

Native Phantom signing/purchase interaction was not manually executed in this
rehearsal. Actual chain publication/purchase and the signed-transaction validation
path were verified separately. Include the native wallet UI in public acceptance.

Mirror's Simulator screen explicitly says it is a 3D preview without body tracking.
Physical ARKit tracking requires a supported iPhone and reachable HTTPS service.
Omoba's initial import/pairing is an opt-in native terminal flow with a staged
roster; new renditions require validated import and process restart. Cross-machine
rendering and every combat animation were not manually exercised. Space multiplayer
presence/chat require its separate realtime backend, which was not started for
this avatar rehearsal.

The Passport API currently needs one long-lived Node process. Public rollout must
review HTTPS proxy handling, persistent registry assets and deployment packaging;
the existing Dockerfile and stateless/multiple-instance hosting are not suitable
unchanged. No credentials, private wallets, bearer sessions, device secrets or
build caches are included in this fixture.
