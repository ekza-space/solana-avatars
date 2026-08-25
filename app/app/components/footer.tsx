import { Link } from "@remix-run/react";

import { useSolanaNetwork } from "~/lib/network";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Market", to: "/minter" },
      { label: "Profile", to: "/" },
      { label: "Deploy", to: "/deployer" },
      { label: "Users", to: "/users" },
    ],
  },
] as const;

export default function Footer() {
  const { clusterLabel } = useSolanaNetwork();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-[rgb(var(--line))]">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 items-center bg-[rgb(var(--accent))] px-2 font-display text-sm font-bold leading-none text-[rgb(var(--accent-ink))]">
                EKZA
              </span>
              <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[rgb(var(--text-strong))]">
                Avatars
              </span>
            </div>
            <p className="ui-copy-sm">
              3D avatars as portable, ownable identity on Solana. Built by{" "}
              <a
                href="https://wotori.io"
                target="_blank"
                rel="noopener noreferrer"
                className="ui-link"
              >
                Wotori Studio
              </a>
              .
            </p>
          </div>

          <div className="flex gap-12">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <div className="ui-label mb-3">{column.title}</div>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-[rgb(var(--text))] hover:text-[rgb(var(--text-strong))]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            <nav aria-label="Elsewhere">
              <div className="ui-label mb-3">Elsewhere</div>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://space.ekza.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[rgb(var(--text))] hover:text-[rgb(var(--text-strong))]"
                  >
                    Ekza Space
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/ekza-space/solana-avatars"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[rgb(var(--text))] hover:text-[rgb(var(--text-strong))]"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--line))] pt-5">
          <span className="ui-label">
            Network · {clusterLabel}
          </span>
          <span className="ui-label">© {currentYear} Ekza</span>
        </div>
      </div>
    </footer>
  );
}
