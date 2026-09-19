import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useLocation,
  isRouteErrorResponse,
} from "@remix-run/react";
import { Analytics } from "@vercel/analytics/remix";
import { lazy, Suspense, type ReactNode, useEffect, useState } from "react";
import Footer from "./components/footer";
import Header from "./components/header";
import { Card, Notice, Page } from "./components/ui";
import { isLegacyToolPath, normalizePathname } from "./lib/routes";

const LegacyShell = lazy(() => import("./components/legacy-shell"));

// System font fallbacks keep the core experience independent of Google Fonts.
const themeBootScript = `
(() => {
  try {
    const saved = localStorage.getItem("solana-avatars-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved === "light" || saved === "dark" ? saved : preferred;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  } catch (_error) {}
})();
`;

export function Layout({ children }: { children: ReactNode }) {
  const identityPage = normalizePathname(useLocation().pathname) === "/auth/solana";
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
        {!identityPage && <Analytics />}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const identityPage = normalizePathname(useLocation().pathname) === "/auth/solana";
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const message =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
      ? error.statusText
      : typeof error === "string"
      ? error
      : "A page component could not be loaded.";
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-2xl space-y-6">
        <div className="ui-eyebrow">
          {notFound ? "Page not found" : "Page error"}
        </div>
        <h1 className="ui-display">
          {notFound ? "This page is not here." : "Something did not load."}
        </h1>
        {!notFound ? (
          <Card tone="quiet" className="p-5">
            <div className="ui-label mb-2">Details</div>
            <p className="ui-mono leading-relaxed">{message.slice(0, 500)}</p>
          </Card>
        ) : null}
        {identityPage ? <p className="ui-copy">Return to your app and start wallet verification again.</p> : <><p className="ui-copy">
          Return to the avatar store to continue.
        </p>
        <a href="/passport" className="ui-button">
          Back to avatars
        </a>
        </>}
      </div>
    </main>
  );
}

function LegacyLoading() {
  return (
    <Page>
      <Notice>
        Loading optional Web3 tools… Your Ekza account is separate.
      </Notice>
    </Page>
  );
}

function ClientLegacyPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return <LegacyLoading />;
  return (
    <Suspense fallback={<LegacyLoading />}>
      <LegacyShell>
        <Outlet />
      </LegacyShell>
    </Suspense>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const identityPage = normalizePathname(pathname) === "/auth/solana";
  return (
    <div className="ui-shell flex min-h-dvh flex-col">
      {!identityPage && <Header />}
      <main className="flex-1 py-8 sm:py-12">
        {isLegacyToolPath(pathname) ? <ClientLegacyPage /> : <Outlet />}
      </main>
      {!identityPage && <Footer />}
    </div>
  );
}
