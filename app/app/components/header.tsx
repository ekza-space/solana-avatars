import { Link } from "@remix-run/react";

interface HeaderProps {
  connected: boolean;
  address: string;
  onConnect: () => void;
}

export default function Header({ connected, address, onConnect }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-4 px-8 p-4">
      <div className="flex items-center space-x-6">
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
          W3Avatar
        </h2>
        <Link to="/" className="text-lg font-medium text-gray-700 dark:text-gray-300 hover:underline">
          Setup
        </Link>
        <Link to="/mint" className="text-lg font-medium text-gray-700 dark:text-gray-300 hover:underline">
          Mint
        </Link>
        <a
          href="https://space.ekza.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-medium text-gray-700 dark:text-gray-300 hover:underline"
        >
          Space
        </a>
      </div>
      <button
        onClick={onConnect}
        className={`${connected ?
          "bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-300" :
          "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 focus:ring-indigo-300"
        } px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors duration-200 focus:outline-none focus:ring-4`}
      >
        {connected ? address : "Connect Wallet"}
      </button>
    </header>
  );
}
