import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Button, Card, Notice, Page, PageHeader } from "./ui";
import { passportRequest, PROJECT_NAMES } from "~/lib/passport-client";
import { approveIdentity, validateIdentityDevice, type IdentityDevice } from "~/lib/passport-identity";

function IdentityContent() {
  const [params] = useSearchParams();
  const code = (params.get("userCode") || "").toUpperCase();
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() || "";
  const context = `${wallet}:${code}`;
  const generation = useRef({ context, value: 0 });
  if (generation.current.context !== context) generation.current = { context, value: generation.current.value + 1 };
  const [device, setDevice] = useState<IdentityDevice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  useEffect(() => () => { generation.current.value++; }, []);
  useEffect(() => { setApproved(false); setBusy(false); }, [context]);
  useEffect(() => {
    let active = true;
    setDevice(null); setError("");
    if (!/^[A-F0-9]{12}$/.test(code)) { setError("Open the verification link from your app to continue."); return; }
    void passportRequest<IdentityDevice>(`device?userCode=${encodeURIComponent(code)}`)
      .then((value) => { if (active) setDevice(validateIdentityDevice(value, code)); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Verification is unavailable. Start again in your app."); });
    return () => { active = false; };
  }, [code]);
  async function approve() {
    if (!wallet || !signMessage || !device || busy || approved) return;
    const revision = ++generation.current.value;
    const isCurrent = () => generation.current.value === revision;
    setBusy(true); setError("");
    try {
      const done = await approveIdentity({ wallet, device, isCurrent, signMessage: async (message) => bs58.encode(await signMessage!(message)) });
      if (done && isCurrent()) setApproved(true);
    } catch (reason) { if (isCurrent()) setError(reason instanceof Error ? reason.message : "Wallet verification failed. Try again."); }
    finally { if (isCurrent()) setBusy(false); }
  }
  return <Page>
    <PageHeader eyebrow="Ekza · Wallet identity" title="Verify your Solana wallet."
      lede="Confirm the code shown in your app. A message signature verifies your wallet address; it does not make a payment or grant content access." />
    <Card className="mt-8 max-w-xl space-y-5 p-6">
      {error && <Notice tone="error">{error}</Notice>}
      {approved ? <Notice tone="success">Wallet verified. Return to your app. You can close this page.</Notice> : <>
        {device ? <><p>Application: <strong>{PROJECT_NAMES[device.projectId]}</strong></p><p className="font-mono text-xl">{device.userCode}</p>
          <p>Share your wallet address with this application for up to 30 minutes. No account profile is created.</p>
          <WalletMultiButton />
          {wallet && !signMessage ? <Notice tone="error">This wallet cannot sign messages. Choose a wallet that supports message signing.</Notice> :
            <Button disabled={!wallet || !signMessage || busy} onClick={() => void approve()}>{busy ? "Confirm in your wallet…" : "Verify wallet identity"}</Button>}
        </> : !error ? <p role="status">Checking the application code…</p> : null}
      </>}
    </Card>
  </Page>;
}

export default function SolanaIdentityPage() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return <ConnectionProvider endpoint={clusterApiUrl("devnet")}><WalletProvider wallets={wallets} autoConnect={false}>
    <WalletModalProvider><IdentityContent /></WalletModalProvider>
  </WalletProvider></ConnectionProvider>;
}
