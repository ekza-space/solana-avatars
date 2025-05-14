import { Link } from "@remix-run/react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect } from "react";

export default function Header() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  return (
    <header className="flex justify-between items-center py-4 px-8 bg-gray-100 dark:bg-gray-900 mb-8">
      <Link
        to="/"
        className="text-2xl font-bold text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
      >
        W3 Avatars
      </Link>
      <nav className="space-x-4">

        <Link
          to="/"
          className="text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
        >
          Home
        </Link>

        <Link
          to="/profile"
          className="text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
        >
          Profile
        </Link>

        {/* <Link
          to="/market"
          className="text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
        >
          Market
        </Link> */}

        <Link
          to="/mint"
          className="text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
        >
          Mint
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
      {isClient && (
        <WalletMultiButton className="px-6 py-3 rounded-lg font-semibold transition-colors duration-200 focus:outline-none" />
      )}
    </header>
  );
}
