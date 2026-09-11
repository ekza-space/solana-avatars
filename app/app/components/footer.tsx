import { Link } from "@remix-run/react";
import { STUDIO_NAV, studioHref } from "~/lib/routes";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-[rgb(var(--line))]">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row">
          <div className="max-w-sm">
            <Link
              to="/passport"
              className="font-display text-sm font-bold uppercase tracking-[0.18em]"
            >
              Ekza Avatars
            </Link>
            <p className="ui-copy-sm mt-3">
              Buy an avatar once. Use it in its supported projects.
              Creators publish models and add approved game renditions.
            </p>
          </div>
          <nav
            aria-label="Product"
            className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm"
          >
            <Link to="/passport" className="ui-link">Purchased avatars</Link>
            {STUDIO_NAV.map((item) => (
              <Link
                key={item.view}
                to={studioHref(item.view)}
                className="ui-link"
              >
                {item.label}
              </Link>
            ))}
            <Link to="/about" className="ui-link">
              About
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--line))] pt-5">
          <span className="ui-label">
            Ekza Space · Ekza Mirror · Omoba · © {new Date().getFullYear()} Ekza
          </span>
          <Link to="/web3" className="text-xs opacity-70 hover:opacity-100">
            Optional Web3 experiments ↗
          </Link>
        </div>
      </div>
    </footer>
  );
}
