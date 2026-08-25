import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useLocation,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";
import SayHi from "~/components/SayHi";
import { Analytics } from "@vercel/analytics/remix";

import { type ReactNode, useEffect, useMemo, useState } from "react";

// TODO: move to vite config
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

// Solana Wallet
import { ConnectionProvider, useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

import Footer from "./components/footer";
import Header from "./components/header";
import { Card, Page, PageHeader, Skeleton } from "./components/ui";
import { SolanaNetworkProvider, useSolanaNetwork } from "./lib/network";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
  },
];

const themeBootScript = `
(() => {
  try {
    const key = "solana-avatars-theme";
    const saved = localStorage.getItem(key);
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved === "light" || saved === "dark" ? saved : preferred;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  } catch (_error) {}
})();
`;

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
        <Analytics />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown rendering error.";

  return (
    <Layout>
      <main className="flex min-h-dvh items-center justify-center px-5 py-16">
        <div className="w-full max-w-2xl space-y-6">
          <div className="ui-eyebrow">Error</div>
          <h1 className="ui-display">Something did not load.</h1>
          <Card tone="quiet" className="p-5">
            <div className="ui-label mb-2">Details</div>
            <p className="ui-mono leading-relaxed">{message}</p>
          </Card>
          <p className="ui-copy">
            Check that the network endpoint and the metadata service are
            reachable, then reload the page.
          </p>
          <a href="/" className="ui-button">
            Back to start
          </a>
        </div>
      </main>
    </Layout>
  );
}

function MainContent() {
  const { publicKey } = useWallet();
  const location = useLocation();
  const { clusterLabel } = useSolanaNetwork();

  if (!publicKey && location.pathname !== "/about") {
    return (
      <main className="flex-1 py-10 sm:py-14">
        <Page>
          <PageHeader
            eyebrow={`Solana · ${clusterLabel}`}
            title={
              <>
                Connect a wallet
                <br />
                to continue.
              </>
            }
            lede="Profiles, collections and minting all sign with your own key. Nothing leaves the browser until you confirm it."
          />

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
              {[
                {
                  n: "01",
                  title: "Browse the market",
                  body: "Open creator drops, preview the 3D model, mint what fits.",
                },
                {
                  n: "02",
                  title: "Claim an identity",
                  body: "Bind a username, a bio and an avatar NFT to an on-chain profile.",
                },
                {
                  n: "03",
                  title: "Publish a collection",
                  body: "Upload a .glb or .vrm model, set supply and mint fee, deploy.",
                },
              ].map((step) => (
                <div key={step.n} className="bg-[rgb(var(--bg))] p-5">
                  <div className="ui-index">{step.n}</div>
                  <h2 className="ui-h3 mt-3">{step.title}</h2>
                  <p className="ui-copy-sm mt-2">{step.body}</p>
                </div>
              ))}
            </div>

            <Card className="flex flex-col gap-4 p-5">
              <div className="ui-label">Access</div>
              <p className="ui-copy-sm">
                Phantom is supported. Nothing is signed until you confirm it in
                the wallet.
              </p>
              <WalletMultiButton />
            </Card>
          </div>
        </Page>
      </main>
    );
  }

  return (
    <main className="flex-1 py-8 sm:py-12">
      <Outlet />
    </main>
  );
}

function ServerFallbackContent() {
  const location = useLocation();

  if (location.pathname === "/about") {
    return <Outlet />;
  }

  return (
    <main className="flex-1 py-8 sm:py-12">
      <Page>
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-3/4 max-w-xl" />
          <Skeleton className="h-4 w-1/2 max-w-md" />
          <div className="grid gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </Page>
    </main>
  );
}

export default function App() {
  return (
    <SolanaNetworkProvider>
      <AppWithConnectionGate />
    </SolanaNetworkProvider>
  );
}

function AppWithConnectionGate() {
  const [isHydrated, setIsHydrated] = useState(false);
  const { endpoint } = useSolanaNetwork();
  const wallets = useMemo(
    () => (isHydrated ? [new PhantomWalletAdapter()] : []),
    [isHydrated]
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <div className="ui-shell flex min-h-dvh flex-col">
        <Header />
        <ServerFallbackContent />
        <Footer />
      </div>
    );
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="ui-shell flex min-h-dvh flex-col">
            <Header />
            <SayHi />
            <MainContent />
            <Footer />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
