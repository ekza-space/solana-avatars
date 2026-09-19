import { Link, useLocation } from "@remix-run/react";
import { useEffect, useState } from "react";
import ThemeToggle from "./theme-toggle";
import { normalizePathname, AVATAR_STORE_NAV } from "~/lib/routes";

export default function Header() {
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => setIsOpen(false), [location.pathname, location.search]);
  const items = AVATAR_STORE_NAV.map((item) => ({
    ...item,
    active: item.to === "/passport#my-avatars"
      ? pathname === "/passport" && location.hash === "#my-avatars"
      : item.to === "/passport"
      ? pathname === "/passport" && location.hash !== "#my-avatars"
      : pathname === item.to.split("?")[0],
  }));
  return (
    <header className="sticky top-0 z-50 border-b border-[rgb(var(--line))] bg-[rgb(var(--bg))]">
      <div aria-hidden="true" className="h-[3px] bg-[rgb(var(--accent))]" />
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-6 px-5 py-3 sm:px-8">
        <Link
          to="/passport"
          className="flex items-center gap-2.5"
          aria-label="Ekza Avatars — purchased avatars"
        >
          <span className="flex h-8 items-center bg-[rgb(var(--accent))] px-2 font-display text-[15px] font-bold leading-none tracking-tight text-[rgb(var(--accent-ink))]">
            EKZA
          </span>
          <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.18em] text-[rgb(var(--text-strong))]">
            Avatars
          </span>
        </Link>
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="ui-navlink"
              data-active={item.active}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="ui-icon-button lg:hidden"
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
          className="border-t border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-5 py-4 lg:hidden"
          aria-label="Mobile menu"
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.to} className="border-b border-[rgb(var(--line))]">
                <Link
                  to={item.to}
                  className="flex min-h-12 items-center text-base font-medium"
                  aria-current={item.active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
