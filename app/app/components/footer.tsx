export default function Footer() {
    return (
        // <footer className="fixed bottom-0 left-0 w-full z-50 text-center py-8 text-slate-500 text-sm bg-white"></footer>
        <footer className="text-center py-8 text-slate-500 text-sm">
            Web3 Avatar Creator — Created at{" "}
            <a
                href="https://wotori.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:underline"
            >
                Wotori Studio
            </a>
        </footer>
    );
}