import Header from "~/components/header"; // Assuming this is your existing header

// Mock data for NFTs - more realistic
const mockNFTs = [
    {
        id: 1,
        name: "CryptoPioneer #001",
        owner: "0xAlice",
        description: "A pioneering spirit, digitally immortalized. One of the first.",
        price: "2.5",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`, // Original image
    },
    {
        id: 2,
        name: "Pixel Paladin #042",
        owner: "UserBob",
        description: "Defender of the digital realm, pixel by pixel.",
        price: "1.8",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`, // Using picsum for variety
    },
    {
        id: 3,
        name: "Galactic Guardian #7",
        owner: "CryptoChad",
        description: "Guardian of the metaverse, watching over the stars.",
        price: "3.1",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`,
    },
    {
        id: 4,
        name: "Neon Nomad #23",
        owner: "NFQueen",
        description: "Wandering the vibrant landscapes of the digital frontier.",
        price: "0.9",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`,
    },
    {
        id: 5,
        name: "Abstract Artifice #99",
        owner: "ArtCollector",
        description: "A unique algorithmic creation, defying definition.",
        price: "5.0",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`,
    },
    {
        id: 6,
        name: "Robo Buddy #123",
        owner: "TechSavvy",
        description: "Your friendly neighborhood robot companion.",
        price: "1.2",
        imageUrl: `https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF`,
    },
];

export default function MarketPage() {
    return (
        <div className="min-h-screen text-slate-800"> {/* Softer background */}
            <Header />
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 className="text-4xl font-bold text-slate-900 mb-10 text-center"> {/* Page Title */}
                    Explore the Avatar NFT Marketplace
                </h1>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"> {/* Adjusted gap and responsive cols */}
                    {mockNFTs.map((nft) => (
                        <div
                            key={nft.id}
                            className="group bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-2xl hover:-translate-y-1 flex flex-col"
                        // Added group for image hover effect, better shadow, rounded-xl, subtle lift
                        >
                            <div className="aspect-square w-full overflow-hidden"> {/* Ensures square images */}
                                <img
                                    src={nft.imageUrl}
                                    alt={nft.name} // More descriptive alt
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" // Image zoom on hover
                                />
                            </div>
                            <div className="p-5 flex flex-col flex-grow"> {/* Increased padding, flex-grow for content */}
                                <h3 className="text-xl font-semibold text-slate-900 mb-2 truncate" title={nft.name}>
                                    {nft.name}
                                </h3>
                                <p className="text-sm text-slate-500 mb-1">
                                    Owned by: <span className="font-medium text-slate-700">{nft.owner}</span>
                                </p>
                                <p className="text-sm text-slate-600 mb-4 leading-relaxed line-clamp-2"> {/* Limited lines for description */}
                                    {nft.description}
                                </p>

                                <div className="mt-auto pt-4 border-t border-slate-200"> {/* Price and button section pushed to bottom */}
                                    <div className="flex justify-between items-center mb-4">
                                        <p className="text-xs text-slate-500">Current Price:</p>
                                        <p className="text-xl font-bold text-indigo-600">
                                            {`${nft.price} SOL`}
                                        </p>
                                    </div>
                                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-5 rounded-lg text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
                                        Mint
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
            <footer className="text-center py-8 text-slate-500 text-sm">
                © {new Date().getFullYear()} NFT Marketplace. All rights reserved.
            </footer>
        </div>
    );
}