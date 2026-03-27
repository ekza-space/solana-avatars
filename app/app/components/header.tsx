import { Link, useLocation } from "@remix-run/react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect } from "react";

import ThemeToggle from "./theme-toggle";
import { cn } from "~/utils/cn";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

const navItems = [
  { to: "/", label: "Profile" },
  { to: "/users", label: "Users" },
  { to: "/deployer", label: "Deploy" },
  { to: "/minter", label: "Market" },
  { to: "/about", label: "About" },
] as const;

export default function Header() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <header className="sticky top-0 z-50 px-4 pb-4 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-[28px] border border-[rgba(var(--line),0.72)] bg-[rgba(var(--surface),0.82)] px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-3 text-[rgb(var(--text-strong))]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(var(--line-strong),0.36)] bg-[rgba(var(--accent),0.08)] font-mono text-xs font-semibold uppercase tracking-[0.24em] text-[rgb(var(--accent))]">
                AV
              </span>
              <span className="hidden sm:block">
                <span className="font-display text-lg font-semibold tracking-tight">
                  Solana Avatars
                </span>
                <span className="block font-mono text-[11px] uppercase tracking-[0.28em] text-[rgb(var(--text))]">
                  Friendly wireframe console
                </span>
              </span>
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {isDesktop && isClient ? <WalletMultiButton /> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isDesktop && (
            <div className="flex items-center gap-2">
              <div className="ui-badge">Menu</div>
            </div>
          )}

          <nav className="hidden flex-1 flex-wrap gap-2 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-2xl border px-4 py-2 text-sm font-medium transition duration-200",
                    active
                      ? "border-[rgba(var(--line-strong),0.55)] bg-[rgba(var(--accent),0.1)] text-[rgb(var(--text-strong))]"
                      : "border-[rgba(var(--line),0.5)] bg-transparent text-[rgb(var(--text))] hover:border-[rgba(var(--line-strong),0.35)] hover:text-[rgb(var(--text-strong))]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <a
              href="https://space.ekza.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-2xl border border-[rgba(var(--line),0.5)] px-4 py-2 text-sm font-medium text-[rgb(var(--text))] hover:border-[rgba(var(--line-strong),0.35)] hover:text-[rgb(var(--text-strong))]"
            >
              Ekza Space
            </a>
          </nav>

          {!isDesktop && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="ui-icon-button ml-auto"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
              </svg>
            </button>
          )}
        </div>

        {!isDesktop && isOpen && (
          <nav className="grid gap-2 border-t border-[rgba(var(--line),0.52)] pt-4 md:hidden" aria-label="Mobile menu">
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-2xl border px-4 py-2 text-sm font-medium transition duration-200",
                    active
                      ? "border-[rgba(var(--line-strong),0.55)] bg-[rgba(var(--accent),0.1)] text-[rgb(var(--text-strong))]"
                      : "border-[rgba(var(--line),0.5)] text-[rgb(var(--text))]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <a
              href="https://space.ekza.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-2xl border border-[rgba(var(--line),0.5)] px-4 py-2 text-sm font-medium text-[rgb(var(--text))]"
            >
              Ekza Space
            </a>
            {isClient ? <WalletMultiButton /> : null}
          </nav>
        )}
      </div>
    </header>
  );
}
