import { Link, useLocation } from "@remix-run/react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect } from "react";

import ThemeToggle from "./theme-toggle";
import { Select } from "./ui";
import { SOLANA_CLUSTER_OPTIONS, useSolanaNetwork } from "~/lib/network";

const navItems = [
  { to: "/minter", label: "Market" },
  { to: "/", label: "Profile" },
  { to: "/deployer", label: "Deploy" },
  { to: "/users", label: "Users" },
  { to: "/about", label: "About" },
] as const;

function NetworkSelect({ className }: { className?: string }) {
  const { cluster, setCluster } = useSolanaNetwork();
  return (
    <Select
      className={className}
      value={cluster}
      onChange={(event) =>
        setCluster(event.target.value as (typeof SOLANA_CLUSTER_OPTIONS)[number])
      }
      aria-label="Solana network"
    >
      {SOLANA_CLUSTER_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option === "mainnet-beta" ? "Mainnet" : option === "devnet" ? "Devnet" : "Localnet"}
        </option>
      ))}
    </Select>
  );
}

export default function Header() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-[rgb(var(--line))] bg-[rgb(var(--bg))]">
      {/* signature rule */}
      <div aria-hidden="true" className="h-[3px] bg-[rgb(var(--accent))]" />

      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-6 px-5 py-3 sm:px-8">
        <Link
          to="/minter"
          className="flex items-center gap-2.5"
          aria-label="Ekza Avatars — market"
        >
          <span className="flex h-8 items-center bg-[rgb(var(--accent))] px-2 font-display text-[15px] font-bold leading-none tracking-tight text-[rgb(var(--accent-ink))]">
            EKZA
          </span>
          <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.18em] text-[rgb(var(--text-strong))]">
            Avatars
          </span>
        </Link>

        <nav
          className="hidden items-center gap-7 md:flex"
          aria-label="Primary"
        >
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="ui-navlink"
              data-active={location.pathname === item.to}
              aria-current={location.pathname === item.to ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://space.ekza.io"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-navlink"
          >
            Ekza Space ↗
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isClient ? (
            <NetworkSelect className="hidden w-[118px] text-xs sm:block" />
          ) : null}
          <ThemeToggle />
          {isClient ? (
            <div className="hidden md:block">
              <WalletMultiButton />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="ui-icon-button md:hidden"
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeWidth={1.75}
                d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 7h16M4 12h16M4 17h16"}
              />
            </svg>
          </button>
        </div>
      </div>

      {isOpen ? (
        <nav
          className="border-t border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-5 py-4 md:hidden"
          aria-label="Mobile menu"
        >
          <ul className="flex flex-col">
            {navItems.map((item) => (
              <li key={item.to} className="border-b border-[rgb(var(--line))]">
                <Link
                  to={item.to}
                  className="flex min-h-12 items-center justify-between text-base font-medium text-[rgb(var(--text-strong))]"
                  aria-current={
                    location.pathname === item.to ? "page" : undefined
                  }
                >
                  {item.label}
                  {location.pathname === item.to ? (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 bg-[rgb(var(--accent))]"
                    />
                  ) : null}
                </Link>
              </li>
            ))}
            <li className="border-b border-[rgb(var(--line))]">
              <a
                href="https://space.ekza.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center text-base font-medium text-[rgb(var(--text-strong))]"
              >
                Ekza Space ↗
              </a>
            </li>
          </ul>

          {isClient ? (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-2">
                <span className="ui-label">Network</span>
                <NetworkSelect />
              </label>
              <WalletMultiButton />
            </div>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
