import React, { useRef, useEffect } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchUserNFTs } from "~/utils/fetchUserNfts";



interface Avatar {
    imgHash: string;
    modelHash: string;
    avatarMint: PublicKey;
}

interface AvatarSelectorProps {
    avatarList: Avatar[];
    selectedAvatar: Avatar;
    setSelectedAvatar: (avatar: Avatar) => void;
}

// Default list of free-to-use 3D avatars
export const avatarList: Avatar[] = [
    { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
    { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
    { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
    { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
    { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
    { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
    { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
    { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
    { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
    { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
    { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
    { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
    { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
    { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
    { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
];

const AvatarSelector: React.FC<AvatarSelectorProps> = ({ avatarList, selectedAvatar, setSelectedAvatar }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Use Solana Wallet Adapter for connection status
    const { publicKey, connected } = useWallet();
    const { connection } = useConnection();


    useEffect(() => {
        const el = containerRef.current?.querySelector(`[data-selected="true"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [selectedAvatar]);

    // Fetch all NFTs for the connected wallet and log their mints/URIs
    useEffect(() => {
        if (!publicKey) return;
        fetchUserNFTs(connection, publicKey)
            .then(nfts => console.log("User NFTs with URIs:", nfts))
            .catch(e => console.error("Failed to fetch user NFTs:", e));
    }, [publicKey, connection]);

    return (
        <div>
            {/* 3D Visualization Placeholder */}
            <div className="mb-6">
                <img
                    src={`https://ipfs.io/ipfs/${selectedAvatar.modelHash}`}
                    alt={`3D visualization of model ${selectedAvatar.modelHash}`}
                    className="w-full h-80 object-contain rounded-lg shadow-lg"
                />
            </div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
                Browse &amp; Select 3D Avatars
            </h3>
            <div ref={containerRef} className="h-40 overflow-x-auto whitespace-nowrap flex gap-4 p-1">
                {avatarList.map((avatar) => (
                    <div
                        key={avatar.avatarMint.toString()}
                        className="p-1 inline-block"
                        data-selected={avatar.avatarMint === selectedAvatar.avatarMint}
                    >
                        <div
                            className={`relative w-32 h-32 overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer ${avatar.avatarMint === selectedAvatar.avatarMint ? 'ring-4 ring-purple-500' : 'ring-0'}`}
                            onClick={() => setSelectedAvatar(avatar)}
                        >
                            <img
                                src={`https://ipfs.io/ipfs/${avatar.imgHash}`}
                                alt={avatar.imgHash}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Selected Avatar IPFS Details */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Image IPFS Hash:</strong> {selectedAvatar.imgHash}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    <strong>Model IPFS Hash:</strong> {selectedAvatar.modelHash}
                </p>
            </div>
        </div>
    );
};

export default AvatarSelector;