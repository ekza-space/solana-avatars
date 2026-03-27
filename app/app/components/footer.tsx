export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="px-4 pb-6 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 rounded-[28px] border border-[rgba(var(--line),0.6)] bg-[rgba(var(--surface),0.72)] px-5 py-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="font-display text-lg font-semibold tracking-tight text-[rgb(var(--text-strong))]">
            Solana Avatars
          </div>
          <p className="text-sm text-[rgb(var(--text))]">
            Crafted by{" "}
            <a
              href="https://wotori.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[rgb(var(--accent))]"
            >
              Wotori Studio
            </a>{" "}
            for web3 identity experiments.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="ui-badge">Devnet</div>
          <div className="font-mono text-xs uppercase tracking-[0.24em] text-[rgb(var(--text))]">
            © {currentYear}
          </div>
          <GitHubLink />
        </div>
      </div>
    </footer>
  );
}

function GitHubLink() {
  return (
    <a
      href="https://github.com/ekza-space/solana-avatars"
      target="_blank"
      rel="noopener noreferrer"
      className="ui-icon-button"
      aria-label="Open GitHub repository"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="currentColor"
        viewBox="0 0 24 24"
        className="h-4 w-4"
      >
        <path d="M12 0a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.5v-2c-3.3.7-4-1.6-4-1.6a3.2 3.2 0 0 0-1.3-1.8c-1-.7.1-.7.1-.7a2.6 2.6 0 0 1 1.9 1.3 2.6 2.6 0 0 0 3.6 1 2.6 2.6 0 0 1 .8-1.7c-2.7-.3-5.5-1.3-5.5-5.8a4.5 4.5 0 0 1 1.2-3.2 4.2 4.2 0 0 1 .1-3.1s1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2a4.2 4.2 0 0 1 .1 3.1 4.5 4.5 0 0 1 1.2 3.2c0 4.5-2.8 5.5-5.5 5.8a2.9 2.9 0 0 1 .8 2.2v3.3c0 .3.2.6.8.5A12 12 0 0 0 12 0Z" />
      </svg>
    </a>
  );
}
