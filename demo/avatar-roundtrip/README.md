# One avatar in three projects — local devnet rehearsal

See [verified results and limits](VERIFICATION.md) for the real purchase, upload,
client screenshots and test evidence. Related source revisions are recorded in
`source-revisions.json`.

This fixture contains Robert by Polygonal-Mind, from the open-source **100 Avatars R1** collection, under **CC0-1.0**. Original source: `ar://gwG7w4bY-A5c3R6A6GOz3xBCgbPvkFQmqPIDtvnNsYI`. The original VRM, prepared ARKit USDZ and animated Omoba GLB are separate, checksum-pinned renditions of that source. It contains no private keys, sessions or device codes.

`purchase.public.json` records a real **0.001 test SOL** purchase in **Solana Devnet**. This is separate from network fees and account rent. The creator escrow increased by exactly 1,000,000 lamports. The NFT belongs to the isolated test buyer. Other wallets must buy their own instance using the existing storefront; copying its public mint address does not grant access.

The catalogue approvals are for this controlled rehearsal. Space was observed rendering the bought avatar with `Equipped`. Omoba was admitted through its actual server and captured by its native Bevy renderer. Mirror paired with the buyer, verified the exact USDZ, displayed the purchased Robert in its iOS Simulator app, and restored the wallet library from Keychain after restart. The Simulator explicitly labels its view as a 3D preview without body tracking. Physical iPhone ARKit tracking remains a separate acceptance step.

From `solana-avatars/`, with the sibling checkouts and their existing dependencies installed:

```sh
node scripts/avatar-roundtrip.mjs --check
node scripts/avatar-roundtrip.mjs --build
node scripts/avatar-roundtrip.mjs --serve
```

The supervisor starts only local listeners: registry8019, storefront5190, Space7110 and Omoba server4018. It does not create a wallet, mint an NFT, send a payment or deploy anything. Ctrl+C stops only the processes it started. It refuses occupied web ports. Space's existing realtime backend is separate; rendering and avatar selection work while it is unavailable, but multiplayer Space requires its usual backend.

The server reads `EKZA_PASSPORT_RPC_URL` if supplied, otherwise reuses the already configured `core/.env.devnet.local` Devnet endpoint without printing it; public Devnet is the final fallback. The API verifies the Devnet genesis hash. Never place a private RPC key in a public artifact or launch URL.

For creator uploads, the compiled local store also reuses the existing `PINATA_JWT` from its process environment or `app/.env`. Only that upload field is passed; wallet/deployment keys are not loaded. Starting the supervisor does not upload anything. If the field is missing, it prints an availability notice and the purchase/library demo remains usable.

Publishing requires the creator to sign a wallet verification message before files are uploaded. The Devnet upload API accepts only a current browser session, validates and bounds the complete request before storage writes, and limits concurrent/rate-limited uploads. Native game sessions cannot publish. A real signed upload of the public Robert VRM and labelled rehearsal JSON was downloaded back and verified; this did not create another collection or purchase.

Open [the local store](http://127.0.0.1:5190/passport). Its card links to collection18 in the existing minter. After buying, use **Open purchase & supported projects**. Use **Use in Space**, or open the native app's wallet connection code in the store. Wallet approval signs a message; purchasing signs a separate on-chain transaction.

In another terminal:

```sh
node scripts/avatar-roundtrip.mjs --omoba
```

Omoba initially uses a staged, public protected roster and restarts both processes when new renditions are imported. It keeps its 15 free avatars. The token is private in memory; only a scoped one-use ticket reaches the game server. The default checkout is the isolated `omoba-bevy-avatar-roundtrip` branch `feat/avatar-passport-roundtrip`; set `OMOBA_CHECKOUT` to an integrated checkout later.

For a Debug Mirror Simulator build, retain simulator ad-hoc signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES`) so the existing app identifier can access Keychain. Launch with `-EkzaPassportOrigin http://127.0.0.1:5190`. Open **Аватары → Купленные аватары · кошелёк**. Selecting a verified wallet avatar returns to the preview. Physical devices require a reachable operator-configured HTTPS origin. Public deployment and any networking change still require explicit approval.

## Live proof tools

`scripts/prove-avatar-roundtrip-devnet.cjs` defaults to a no-write dry run. Its explicit execution mode uses private ephemeral fixture wallets and verifies the network before any mutation. `--fund-from` must only be used with an explicitly authorized donor; it is not needed to replay an already completed fixture. The ordinary supervisor never invokes it.

`scripts/prove-avatar-passport-http.cjs` signs the private fixture wallet locally and tests actual chain-backed HTTP ownership and exact model bytes. The public fixture itself cannot impersonate the buyer. Keep the original private state directory outside the repository. HTTP proof is separate from visual rendering evidence.

## Publishing another designer's avatar

Use `/deployer` for its source/template publication, then prepare the project's required rendition. Follow `ekza-mirror/docs/passport-roundtrip.md` and the `app.passport_cli` operator-review command to attach source/rendition/review hashes. Space accepts the matching universal VRM0/VRM1 humanoid profile; Mirror requires `ios/arkit-body-v1` USDZ; Omoba requires `desktop/humanoid-glb-v1` with the required skeleton and idle/walk/attack/cast/death clips. A filename or supported-format declaration is insufficient. After approval, all current owners receive that support through the canonical template ID, without a second purchase.

## Deployment prerequisite

The current Passport API requires one long-lived Node process. Existing stateless/multi-instance Vercel hosting must not receive this API unchanged: pairing and one-use tickets require shared atomic state there. A public launch needs a reviewed host choice or a shared state adapter, configured RPC/registry origins, and a physical-device rehearsal if camera body tracking is demonstrated. No production configuration was changed in this task.
