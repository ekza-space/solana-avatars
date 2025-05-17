import React, { useRef, useEffect, useState } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { fetchUserNFTs } from "~/utils/fetchUserNfts";
import { handleBurnInvalidNFTs } from "~/utils/burnNft";
import SceneWithModel from "./3d/SceneWithModel";


const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "/ipfs/";


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
    const { publicKey, connected, sendTransaction } = useWallet();
    const { connection } = useConnection();

    const [realAvatarList, setRealAvatarList] = useState<Avatar[]>([]);

    const [modelUrl, setModelUrl] = useState<string>("");

    useEffect(() => {
        const { modelHash, imgHash } = selectedAvatar;
        if (!modelHash) {
            setModelUrl("");
            return;
        }
        const ipfsUrl = `/ipfs/${modelHash}`;
        console.log("ipfsUrl:", ipfsUrl);
        // Determine if this should be treated as a 3D model:
        // 1. It has a recognized 3D extension, or
        // 2. The modelHash differs from the imgHash (i.e., animation_url provided)
        const has3DExtension = /\.(glb|gltf|usdz|vrm)$/i.test(modelHash);
        const isAnimationUrl = modelHash !== imgHash;
        if (has3DExtension || isAnimationUrl) {
            console.log("set model url: ", ipfsUrl);
            setModelUrl(ipfsUrl);
        } else {
            // Fallback: clear any previous URL so image will render
            setModelUrl("");
        }
    }, [selectedAvatar]);


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
            .then(nfts => {
                const avatars: Avatar[] = nfts.map(nft => ({
                    imgHash: nft.metadata?.image
                        ? nft.metadata.image
                        : '', // fallback to empty string or some default
                    modelHash: nft.metadata?.animation_url
                        ? nft.metadata.animation_url
                        : '', // fallback to empty string or some default
                    avatarMint: new PublicKey(nft.mint),
                }));
                console.log("Fetched Avatars:", avatars);
                setRealAvatarList(avatars);
            })
            .catch(e => console.error("Failed to fetch user NFTs:", e));
    }, [publicKey, connection]);

    useEffect(() => {
        if (realAvatarList.length > 0) {
            const realMatch = realAvatarList.find(avatar => avatar.avatarMint.toString() === selectedAvatar.avatarMint.toString());
            if (realMatch && realMatch.modelHash !== selectedAvatar.modelHash) {
                setSelectedAvatar(realMatch);
            }
        }
    }, [realAvatarList, selectedAvatar, setSelectedAvatar]);

    const displayedAvatarList = realAvatarList;

    if (realAvatarList.length === 0) {
        return (
            <div className="p-4 bg-yellow-100 text-yellow-900 rounded-lg text-center flex justify-center items-center h-40">
                No avatar found. Go and&nbsp;<a href="/mint" className="underline">create one first</a>.
            </div>
        );
    }

    return (
        <div>
            {/* 3D Visualization Placeholder */}
            {modelUrl ? <div className="mb-6">
                <div className="w-full h-[500px]">
                    <SceneWithModel file={modelUrl} />
                </div>
            </div> : <div className="mb-6">
                <img
                    src={`${IPFS_GATEWAY}${selectedAvatar.imgHash}`}
                    alt={`Avatar preview ${selectedAvatar.imgHash}`}
                    className="w-full h-80 object-contain rounded-lg shadow-lg"
                />
            </div>}

            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
                Browse &amp; Select 3D Avatars
            </h3>
            <div ref={containerRef} className="h-40 overflow-x-auto whitespace-nowrap flex gap-4 p-1">
                {displayedAvatarList.map((avatar) => (
                    <div
                        key={avatar.avatarMint.toString()}
                        className="p-1 inline-block"
                        data-selected={avatar.avatarMint.toString() === selectedAvatar.avatarMint.toString()}
                    >
                        <div
                            className={`relative group w-32 h-32 overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer ${avatar.avatarMint.toString() === selectedAvatar.avatarMint.toString() ? 'ring-4 ring-purple-500' : 'ring-0'}`}
                            onClick={() => {
                                setSelectedAvatar(avatar)
                                console.log("set selected avatar: ", avatar)
                            }}
                        >
                            <img
                                src={`${IPFS_GATEWAY}${avatar.imgHash}`}
                                alt={avatar.imgHash}
                                className="w-full h-full object-cover"
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleBurnInvalidNFTs(
                                        publicKey,
                                        connected,
                                        [avatar.avatarMint.toString()],
                                        sendTransaction
                                    );
                                }}
                                disabled={!connected}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Delete Avatar"
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Selected Avatar IPFS Details */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">

                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <strong>Image IPFS Mint:</strong> <br /> {selectedAvatar.avatarMint.toString()}
                </p>

                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <strong>Image IPFS Hash:</strong> <br /> {selectedAvatar.imgHash}
                </p>

                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 mt-1">
                    <strong>Model IPFS Hash:</strong> <br /> {selectedAvatar.modelHash}
                </p>

            </div>
        </div>
    );
};

export default AvatarSelector;