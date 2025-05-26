export default function Footer() {
    const currentYear = new Date().getFullYear();
    return (
        <footer className="fixed bottom-0 left-0 w-full z-50 py-4 text-slate-500 text-sm bg-white">
            <div className="relative w-full flex justify-center items-center">
                <div className="text-center">
                    <div>
                        Created at{" "}
                        <a
                            href="https://wotori.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-500 hover:underline"
                        >
                            Wotori Studio
                        </a>
                    </div>
                    <div>© {currentYear}</div>
                </div>
                <div className="absolute right-4">
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
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 24 24"
                className="w-6 h-6 text-slate-500 hover:text-indigo-500 transition-colors"
            >
                <path d="M12 0a12 12 0 00-3.8 23.4c.6.1.8-.2.8-.5v-2c-3.3.7-4-1.6-4-1.6a3.2 3.2 0 00-1.3-1.8c-1-.7.1-.7.1-.7a2.6 2.6 0 011.9 1.3 2.6 2.6 0 003.6 1 2.6 2.6 0 01.8-1.7c-2.7-.3-5.5-1.3-5.5-5.8a4.5 4.5 0 011.2-3.2 4.2 4.2 0 01.1-3.1s1-.3 3.3 1.2a11.3 11.3 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2a4.2 4.2 0 01.1 3.1 4.5 4.5 0 011.2 3.2c0 4.5-2.8 5.5-5.5 5.8a2.9 2.9 0 01.8 2.2v3.3c0 .3.2.6.8.5A12 12 0 0012 0z" />
            </svg>
        </a>
    );
}
