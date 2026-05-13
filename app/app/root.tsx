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
import { PageSection, Panel } from "./components/ui";
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
        : "The avatar interface hit an unexpected rendering error.";

  return (
    <Layout>
      <main className="ui-shell flex min-h-dvh items-center justify-center px-4 py-10">
        <Panel className="max-w-2xl">
          <div className="ui-eyebrow">Interface recovered</div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
            This view could not load one of its resources.
          </h1>
          <p className="ui-copy mt-4">
            {message}
          </p>
          <p className="ui-copy mt-3 text-sm">
            Check that the local metadata server is running, then refresh the page.
            The app should keep the rest of the console available instead of
            dropping into Remix&apos;s developer crash screen.
          </p>
        </Panel>
      </main>
    </Layout>
  );
}

function MainContent() {
  const { publicKey } = useWallet();
  const location = useLocation();
  const { clusterLabel } = useSolanaNetwork();

  const curLoc = location.pathname;

  if (!publicKey && curLoc !== "/about") {
    return (
      <PageSection
        eyebrow="Wallet Gate"
        title="Connect your wallet to enter the avatar console"
        description="Profiles, deployment, and minting stay exactly as before. The wallet gate is simply packaged into a clearer, calmer landing state."
        className="py-10 sm:py-14"
      >
        <Panel className="mx-auto max-w-3xl p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-4">
              <div className="ui-badge">{clusterLabel}</div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
                Web3 identity, minting, and avatar management in one place.
              </h2>
              <p className="ui-copy">
                Connect Phantom to create a profile, publish your own collection,
                or mint avatars from the marketplace.
              </p>
            </div>
            <div className="ui-panel-muted flex min-h-[220px] flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="ui-label">Access Required</div>
                <p className="ui-copy">
                  The app keeps read/write wallet flows protected until a Solana
                  account is connected.
                </p>
              </div>
              <WalletMultiButton />
            </div>
          </div>
        </Panel>
      </PageSection>
    );
  }

  return (
    <main className="flex-1 py-8 sm:py-10">
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
    <main className="flex-1 py-8 sm:py-10">
      <PageSection
        eyebrow="Loading"
        title="Preparing the wallet layer"
        description="The client is hydrating before the Solana wallet adapter becomes available."
      >
        <Panel className="mx-auto max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="ui-panel-muted h-28 animate-pulse" />
            <div className="ui-panel-muted h-28 animate-pulse" />
            <div className="ui-panel-muted h-28 animate-pulse" />
          </div>
        </Panel>
      </PageSection>
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
