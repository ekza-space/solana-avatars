// Loaded only after an explicit visit to a whitelisted experimental tool.
import { useMemo, type ReactNode } from "react";
import { Link, useLocation } from "@remix-run/react";
import { Buffer } from "buffer";
import {
  ConnectionProvider,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Card, Notice, Page, PageHeader, Select } from "./ui";
import {
  SOLANA_CLUSTER_OPTIONS,
  SolanaNetworkProvider,
  useSolanaNetwork,
} from "~/lib/network";
import { isPassportPublicationRoute, isPassportPurchaseRoute, isPublicAvatarToolPath, LEGACY_TOOLS, normalizePathname } from "~/lib/routes";

globalThis.Buffer = Buffer;

export function LegacyContent({ children }: { children: ReactNode }) {
  const { publicKey, wallet } = useWallet();
  const { cluster, setCluster, clusterLabel, networkLocked } = useSolanaNetwork();
  const { pathname } = useLocation();
  const publicTool = isPublicAvatarToolPath(pathname);
  const navigation = networkLocked
    ? [{ to: "/passport", label: "Avatar Store" }, { to: "/deployer?network=devnet", label: "Publish an avatar" }]
    : LEGACY_TOOLS;
  return (
    <>
      <Page>
        <Notice>
          {networkLocked ? `Avatar ${normalizePathname(pathname) === "/deployer" ? "publication" : "purchase"} · Solana Devnet · Test SOL` : "Experimental Web3 tools · Separate from your Ekza account and moderated Studio library."}
        </Notice>
        <Card className="my-5 flex flex-wrap items-center justify-between gap-4 p-4">
          <nav aria-label={networkLocked ? "Avatar Store" : "Web3 tools"} className="flex flex-wrap gap-4 text-sm">
            {navigation.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                className="ui-link"
                aria-current={
                  normalizePathname(pathname) === tool.to ? "page" : undefined
                }
              >
                {tool.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="flex items-center gap-2 text-xs"
              htmlFor="legacy-solana-network"
            >
              Solana network
              <Select
                id="legacy-solana-network"
                value={cluster}
                disabled={networkLocked}
                onChange={(event) =>
                  setCluster(
                    event.target
                      .value as (typeof SOLANA_CLUSTER_OPTIONS)[number]
                  )
                }
              >
                {SOLANA_CLUSTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "mainnet-beta"
                      ? "Mainnet"
                      : option === "devnet"
                      ? "Devnet"
                      : "Localnet"}
                  </option>
                ))}
              </Select>
            </label>
            <WalletMultiButton />
          </div>
        </Card>
        {!publicKey && wallet && ["NotDetected", "Unsupported"].includes(wallet.readyState) && <Notice tone="error">Your wallet is not available in this browser. Open this page in a browser with Phantom installed, or in Phantom's browser, then connect again.</Notice>}
      </Page>
      {publicTool || publicKey ? (
        children
      ) : (
        <Page>
          <PageHeader
            eyebrow={`Web3 experiment · Solana ${clusterLabel}`}
            title="Connect a wallet for this experiment."
            lede="NFT minting and on-chain profiles use a Solana wallet. They do not sign you into your ordinary Ekza account or publish an avatar in Studio."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/passport" className="ui-button">
              Back to avatars
            </Link>
            <Link to="/web3" className="ui-button ui-button-secondary">
              About these experiments
            </Link>
          </div>
        </Page>
      )}
    </>
  );
}

function LegacyConnection({ children }: { children: ReactNode }) {
  const { endpoint } = useSolanaNetwork();
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <LegacyContent>{children}</LegacyContent>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default function LegacyShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const passportPurchase = isPassportPurchaseRoute(location.pathname, location.search) || isPassportPublicationRoute(location.pathname, location.search);
  return (
    <SolanaNetworkProvider forcedCluster={passportPurchase ? "devnet" : undefined}>
      <LegacyConnection>{children}</LegacyConnection>
    </SolanaNetworkProvider>
  );
}
