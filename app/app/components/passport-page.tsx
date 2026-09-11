import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "@remix-run/react";
import { ConnectionProvider, useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Page, PageHeader, Section } from "./ui";
import { forgetPassportSession, PassportApiError, passportPurchaseHref, passportRequest, PROJECT_NAMES, readPassportSession, savePassportSession, signPassportSession, type CatalogAvatar, type PassportSession, type PurchasedAvatar } from "~/lib/passport-client";

function Compatibility({ avatar }: { avatar: CatalogAvatar }) {
  return <ul className="mt-4 flex flex-wrap gap-2" aria-label="Supported projects">
    {(Object.keys(PROJECT_NAMES) as Array<keyof typeof PROJECT_NAMES>).map((projectId) => {
      const support = avatar.support.find((item) => item.projectId === projectId && item.status === "approved");
      return <li key={projectId}><Badge tone={support ? "success" : "default"}>{PROJECT_NAMES[projectId]} · {support ? "Supported" : "Not available"}</Badge></li>;
    })}
  </ul>;
}

function AvatarCard({ avatar, owned }: { avatar: CatalogAvatar; owned: boolean }) {
  const purchaseHref = passportPurchaseHref(avatar.avatarId);
  const space = avatar.support.some((item) => item.projectId === "ekza-space" && item.status === "approved");
  const spaceOrigin = import.meta.env.VITE_EKZA_SPACE_URL || "https://space.ekza.io";
  return <Card className="overflow-hidden">
    <div className="aspect-[4/3] bg-[rgb(var(--surface-2))]">
      <img src={avatar.thumbnailUrl} alt={avatar.name} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
    </div>
    <div className="p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="ui-h3">{avatar.name}</h3>{owned && <Badge tone="success">In your wallet</Badge>}</div>
      <Compatibility avatar={avatar} />
      {owned && "priceLamports" in avatar && <p className="mt-3 text-xs opacity-70">{(avatar as PurchasedAvatar).priceLamports === "0" ? "Acquired free on Devnet" : "Purchase verified on Devnet"}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {owned && space ? <a className="ui-button" href={`${spaceOrigin.replace(/\/$/, "")}/space/1?passportAvatar=${encodeURIComponent(avatar.avatarId)}`}>Use in Space</a> : null}
        {!owned && purchaseHref ? <Link className="ui-button" to={purchaseHref}>View price & buy</Link> : null}
        {owned ? <a className="ui-button ui-button-secondary" href="#native-apps">Use in Mirror or Omoba</a> : null}
      </div>
      <details className="mt-4 text-xs opacity-75"><summary className="cursor-pointer">Avatar identity & versions</summary><p className="mt-2 break-all font-mono">{avatar.avatarId}</p>
        {avatar.support.map((item) => <p key={`${item.projectId}:${item.profile}`} className="mt-2 break-all">{PROJECT_NAMES[item.projectId]} · {item.profile}<br /><span className="font-mono">{item.rendition.sha256}</span></p>)}
      </details>
    </div>
  </Card>;
}

function PassportContent({ pairing = false }: { pairing?: boolean }) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() || "";
  const [params] = useSearchParams();
  const codeFromUrl = params.get("userCode") || "";
  const receipt = params.get("receipt");
  const [userCode, setUserCode] = useState(codeFromUrl.toUpperCase());
  const contextKey = `${wallet}:${pairing ? `${userCode.trim().toUpperCase()}:${codeFromUrl.toUpperCase()}` : "library"}`;
  const lifecycle = useRef({ key: contextKey, revision: 0 });
  // Invalidate immediately on render, before a previous request can settle.
  if (lifecycle.current.key !== contextKey) lifecycle.current = { key: contextKey, revision: lifecycle.current.revision + 1 };
  const authenticationAttempt = useRef(0);
  const libraryAttempt = useRef(0);
  const [device, setDevice] = useState<{ projectId: keyof typeof PROJECT_NAMES; expiresAt: string; userCode: string } | null>(null);
  const [session, setSession] = useState<PassportSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [catalog, setCatalog] = useState<CatalogAvatar[]>([]);
  const [owned, setOwned] = useState<PurchasedAvatar[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(!pairing);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approved, setApproved] = useState(false);

  useEffect(() => () => { lifecycle.current.revision++; }, []);
  useEffect(() => { setUserCode(codeFromUrl.toUpperCase()); }, [codeFromUrl]);

  useEffect(() => {
    setSession(wallet ? readPassportSession(wallet) : null);
    setOwned([]); setApproved(false); setError(""); setNotice(""); setBusy(false);
  }, [wallet]);

  useEffect(() => {
    if (pairing) return;
    let active = true;
    void passportRequest<{ items: CatalogAvatar[] }>("catalog").then((value) => { if (active) setCatalog(value.items); })
      .catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [pairing]);

  useEffect(() => {
    setDevice(null); setApproved(false); setNotice(""); setError(""); setBusy(false);
    if (!pairing || !userCode.trim()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void passportRequest<{ projectId: keyof typeof PROJECT_NAMES; expiresAt: string; userCode: string }>(`device?userCode=${encodeURIComponent(userCode.trim())}`)
        .then((value) => { if (active) { setDevice(value); setError(""); } }).catch((reason) => { if (active) setError(reason.message); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pairing, userCode]);

  const refresh = useCallback(async (current: PassportSession, purchaseReceipt?: string | null) => {
    const revision = lifecycle.current.revision;
    const attempt = ++libraryAttempt.current;
    const isCurrent = () => lifecycle.current.revision === revision && libraryAttempt.current === attempt && sessionRef.current?.accessToken === current.accessToken;
    if (!isCurrent()) return;
    setBusy(true); setError("");
    try {
      if (purchaseReceipt && /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(purchaseReceipt)) {
        await passportRequest("receipt", { signature: purchaseReceipt }, current.accessToken);
        if (!isCurrent()) return;
      }
      const value = await passportRequest<{ wallet: string; items: PurchasedAvatar[] }>("library", undefined, current.accessToken);
      if (!isCurrent()) return;
      if (value.wallet !== current.wallet) throw new Error("The wallet changed. Sign in again.");
      setOwned(value.items);
    } catch (reason) {
      if (!isCurrent()) return;
      if (reason instanceof PassportApiError && reason.status === 401) {
        forgetPassportSession(current); setSession(null); setOwned([]);
      }
      setError(reason instanceof Error ? reason.message : "Your library could not be loaded. Please retry.");
    } finally { if (isCurrent()) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!session || pairing) return;
    void refresh(session, receipt);
    const expiry = window.setTimeout(() => {
      if (sessionRef.current?.accessToken !== session.accessToken) return;
      libraryAttempt.current++; setSession(null); setOwned([]); setBusy(false); forgetPassportSession(session);
    }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => { libraryAttempt.current++; window.clearTimeout(expiry); };
  }, [session, pairing, receipt, refresh]);

  const authenticate = async () => {
    if (!wallet || !signMessage || (pairing && (!device || device.userCode !== userCode.trim().toUpperCase()))) return;
    const signingDevice = pairing ? device! : undefined;
    const revision = lifecycle.current.revision;
    const attempt = ++authenticationAttempt.current;
    const isCurrent = () => lifecycle.current.revision === revision && authenticationAttempt.current === attempt;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await signPassportSession({ wallet, device: signingDevice, isCurrent, signMessage: async (message) => bs58.encode(await signMessage(message)) });
      if (!value || !isCurrent()) return;
      if (signingDevice) { setApproved(true); setNotice(`${PROJECT_NAMES[signingDevice.projectId]} is connected. Return to the app to choose your avatar.`); }
      else { setSession(value); savePassportSession(value); }
    } catch (reason) { if (isCurrent()) setError(reason instanceof Error ? reason.message : "The wallet could not be verified. Please retry."); }
    finally { if (isCurrent()) setBusy(false); }
  };

  return <Page>
    <PageHeader eyebrow="Ekza Avatars · Solana Devnet" title={pairing ? "Connect your avatar library." : "One avatar. Your worlds."}
      lede={pairing ? "Confirm the code shown in your app, then approve access with the wallet that owns your avatars." : "Buy an avatar once and use it in the projects listed on its card. Creators add game support to the same avatar over time."}
      actions={<WalletMultiButton />} />
    <div className="mt-5"><Notice>Devnet demonstration. Purchases use test SOL. Check the supported projects on each avatar before buying.</Notice></div>
    {error && <Notice tone="error" className="mt-4">{error}</Notice>}
    {notice && <Notice tone="success" className="mt-4">{notice}</Notice>}
    {pairing ? <Card className="mt-8 max-w-xl space-y-5 p-6">
      <Field label="Code from your app" htmlFor="pair-code"><Input id="pair-code" value={userCode} disabled={busy} autoComplete="off" maxLength={16} onChange={(event) => setUserCode(event.target.value.toUpperCase())} /></Field>
      {device ? <p>Allow <strong>{PROJECT_NAMES[device.projectId]}</strong> to read your purchased avatar library? The code expires at {new Date(device.expiresAt).toLocaleTimeString()}.</p> : <p className="ui-copy-sm">Open Purchased avatars in Mirror or Omoba to get a code.</p>}
      {!wallet ? <p>Connect your Solana wallet to continue.</p> : !signMessage ? <Notice tone="error">This wallet cannot sign messages. Choose a wallet that supports message signing.</Notice> :
        <Button disabled={!device || busy || approved} onClick={() => void authenticate()}>{approved ? "Connected" : busy ? "Confirm in your wallet…" : `Connect ${device ? PROJECT_NAMES[device.projectId] : "app"}`}</Button>}
      <Link to="/passport" className="ui-link">Back to avatars</Link>
    </Card> : <>
      <Section title="Your purchased avatars" description="Sign a message to verify your wallet. No transaction or payment is requested for signing in.">
        {!wallet ? <EmptyState title="Connect your wallet to see your avatars." description="You can browse the supported avatars below before connecting." /> : !session ?
          <Button disabled={busy || !signMessage} onClick={() => void authenticate()}>{busy ? "Confirm in your wallet…" : "Verify wallet & open library"}</Button> : <>
            <div className="mb-5 flex flex-wrap items-center gap-4"><span className="ui-copy-sm">{wallet.slice(0, 5)}…{wallet.slice(-5)}</span><Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh(session)}>{busy ? "Checking ownership…" : "Refresh library"}</Button></div>
            {owned.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{owned.map((avatar) => <AvatarCard key={avatar.mint} avatar={avatar} owned />)}</div> : !busy ? <EmptyState title="No supported purchases in this wallet yet." description="Buy an avatar below, then refresh. A transferred avatar appears in its new owner's library." /> : <p role="status">Checking your purchases…</p>}
          </>}
      </Section>
      <Section title="Discover supported avatars" description="A support badge refers to an approved model version for that project.">
        {loadingCatalog ? <p role="status">Loading avatars…</p> : catalog.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{catalog.map((avatar) => <AvatarCard key={avatar.avatarId} avatar={avatar} owned={false} />)}</div> : <EmptyState title="The catalogue is not available yet." description="Try again when the registry is connected and approved avatars are published." />}
      </Section>
      <section id="native-apps" className="mt-12 grid gap-5 md:grid-cols-2">
        <Card className="space-y-4 p-6"><h2 className="ui-h3">Use your purchase in another project</h2><ol className="list-inside list-decimal space-y-3"><li>Open Purchased avatars in Ekza Mirror or Omoba.</li><li>Open the connection link and check the app's code.</li><li>Approve with the same wallet, then choose your avatar.</li></ol><Link to="/connect" className="ui-link">Enter an app code</Link></Card>
        <Card className="space-y-4 p-6"><h2 className="ui-h3">Create once. Add more worlds.</h2><p className="ui-copy-sm">Publish your avatar, then prepare a rendition for each project's requirements. Approved support is added to the avatar's card and becomes available to existing owners.</p><div className="flex flex-wrap gap-3"><Link to="/deployer?network=devnet" className="ui-button">Publish an avatar</Link><Link to="/studio?view=new" className="ui-button ui-button-secondary">Creator Studio</Link></div></Card>
      </section>
    </>}
  </Page>;
}

export default function PassportPage({ pairing = false }: { pairing?: boolean }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return <ConnectionProvider endpoint={import.meta.env.VITE_SOLANA_DEVNET_RPC || clusterApiUrl("devnet")}><WalletProvider wallets={wallets} autoConnect={false}><WalletModalProvider><PassportContent pairing={pairing} /></WalletModalProvider></WalletProvider></ConnectionProvider>;
}
