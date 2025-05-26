import { Link, useLocation } from "@remix-run/react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect } from "react";

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

export default function Header() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-100 dark:bg-gray-900 shadow-sm px-6 py-4 z-50">
      <div className="relative flex items-center w-full">
        {/* Hamburger (mobile) */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-gray-700 dark:text-gray-300 focus:outline-none"
          aria-label="Toggle menu"
          aria-expanded={isOpen}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
            />
          </svg>
        </button>

        {/* Logo */}
        <Link
          to="/"
          className="absolute left-1/2 -translate-x-1/2 transform text-2xl font-bold text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 md:static md:transform-none"
        >
          W3 Avatars
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex ml-12 space-x-4 items-center">
          <Link
            to="/"
            className={`${location.pathname === "/" ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-700 dark:text-gray-300"
              } hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200`}
          >
            Home
          </Link>
          <Link
            to="/users"
            className={`${location.pathname === "/users" ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-700 dark:text-gray-300"
              } hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200`}
          >
            Users
          </Link>
          <Link
            to="/deployer"
            className={`${location.pathname === "/deployer" ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-700 dark:text-gray-300"
              } hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200`}
          >
            Deployer
          </Link>
          <Link
            to="/minter"
            className={`${location.pathname === "/minter" ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-700 dark:text-gray-300"
              } hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200`}
          >
            Minter
          </Link>
          <Link
            to="/about"
            className={`${location.pathname === "/about" ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-700 dark:text-gray-300"
              } hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200`}
          >
            About
          </Link>
          <a
            href="https://space.ekza.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
          >
            Ekza
          </a>
        </nav>

        {/* Desktop Wallet Button */}
        {isDesktop && isClient && (
          <div className="ml-auto">
            <WalletMultiButton className="px-4 py-2 rounded-lg font-semibold transition-colors duration-200 focus:outline-none" />
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          />
          <nav
            className="fixed top-0 left-0 h-full w-64 bg-gray-100 dark:bg-gray-900 p-6 flex flex-col justify-between z-50 md:hidden"
            aria-label="Mobile menu"
          >
            <div className="flex flex-col space-y-4">
              <Link to="/" onClick={() => setIsOpen(false)} className="text-gray-700 dark:text-gray-300 hover:underline">
                Home
              </Link>
              <Link to="/users" onClick={() => setIsOpen(false)} className="text-gray-700 dark:text-gray-300 hover:underline">
                Users
              </Link>
              <Link to="/deployer" onClick={() => setIsOpen(false)} className="text-gray-700 dark:text-gray-300 hover:underline">
                Deployer
              </Link>
              <Link to="/minter" onClick={() => setIsOpen(false)} className="text-gray-700 dark:text-gray-300 hover:underline">
                Minter
              </Link>
              <Link to="/about" onClick={() => setIsOpen(false)} className="text-gray-700 dark:text-gray-300 hover:underline">
                About
              </Link>
              <a href="https://space.ekza.io" target="_blank" rel="noopener noreferrer" className="text-gray-700 dark:text-gray-300 hover:underline">
                Ekza
              </a>
            </div>
            {!isDesktop && isClient && (
              <div className="mt-auto">
                <WalletMultiButton className="w-full px-4 py-2 rounded-lg font-semibold transition-colors duration-200 focus:outline-none" />
              </div>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
