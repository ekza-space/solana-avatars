import React, { useRef, useEffect, useState } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button, Panel } from "~/components/ui";
import { fetchUserNFTs } from "~/utils/fetchUserNfts";
import { handleBurnInvalidNFTs } from "~/utils/burnNft";
import SceneWithModel from "./3d/SceneWithModel";

import { getIpfsUrl } from "~/utils/ipfsUrls";
import { getIpfsGatewayBase } from "~/utils/ipfsGateway";

const IPFS_GATEWAY = getIpfsGatewayBase();


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

const AvatarSelector: React.FC<AvatarSelectorProps> = ({ avatarList: _avatarList, selectedAvatar, setSelectedAvatar }) => {
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
        const ipfsUrl = getIpfsUrl(modelHash);
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
            <Panel className="flex min-h-[280px] flex-col items-start justify-between gap-6">
                <div className="space-y-3">
                    <div className="ui-badge">Inventory empty</div>
                    <h3 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
                        No avatar found in this wallet yet
                    </h3>
                    <p className="ui-copy">
                        Mint one first in the marketplace, then come back here to bind it to your profile.
                    </p>
                </div>
                <a href="/minter" className="ui-button">
                    Open marketplace
                </a>
            </Panel>
        );
    }

    return (
        <div className="space-y-5">
            <Panel className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="ui-label">Preview</div>
                        <h3 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
                            Browse and select your avatar
                        </h3>
                    </div>
                    <div className="ui-badge">{displayedAvatarList.length} owned</div>
                </div>

                {modelUrl ? (
                    <div className="h-[460px] overflow-hidden rounded-[24px] border border-[rgba(var(--line),0.6)]">
                        <SceneWithModel file={modelUrl} />
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[24px] border border-[rgba(var(--line),0.6)] bg-[rgba(var(--surface-2),0.78)] p-4">
                        <img
                            src={`${IPFS_GATEWAY}${selectedAvatar.imgHash}`}
                            alt={`Avatar preview ${selectedAvatar.imgHash}`}
                            className="h-80 w-full rounded-[20px] object-contain"
                        />
                    </div>
                )}
            </Panel>

            <Panel className="space-y-4">
                <div className="ui-label">Wallet inventory</div>
                <div
                    ref={containerRef}
                    className="grid max-h-[340px] gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3"
                >
                    {displayedAvatarList.map((avatar) => {
                        const isSelected =
                            avatar.avatarMint.toString() === selectedAvatar.avatarMint.toString();

                        return (
                            <button
                                key={avatar.avatarMint.toString()}
                                type="button"
                                className={`group rounded-[22px] border p-3 text-left transition duration-200 ${
                                    isSelected
                                        ? "border-[rgba(var(--line-strong),0.72)] bg-[rgba(var(--accent),0.09)]"
                                        : "border-[rgba(var(--line),0.55)] bg-[rgba(var(--surface),0.68)] hover:border-[rgba(var(--line-strong),0.35)]"
                                }`}
                                data-selected={isSelected}
                                onClick={() => {
                                    setSelectedAvatar(avatar);
                                    console.log("set selected avatar: ", avatar);
                                }}
                            >
                                <div className="relative overflow-hidden rounded-[18px] border border-[rgba(var(--line),0.45)]">
                                    <img
                                        src={`${IPFS_GATEWAY}${avatar.imgHash}`}
                                        alt={avatar.imgHash}
                                        className="h-40 w-full object-cover"
                                    />
                                    <div className="absolute right-2 top-2">
                                        <Button
                                            type="button"
                                            variant="danger"
                                            className="h-9 min-h-0 rounded-xl px-3 py-0 text-xs opacity-0 transition-opacity group-hover:opacity-100"
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
                                            aria-label="Delete Avatar"
                                        >
                                            Burn
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                    <div className="ui-label">Mint</div>
                                    <p className="line-clamp-2 break-all font-mono text-xs text-[rgb(var(--text-strong))]">
                                        {avatar.avatarMint.toString()}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </Panel>

            <Panel muted className="grid gap-4 md:grid-cols-3">
                <div>
                    <div className="ui-label">Selected Mint</div>
                    <p className="mt-2 break-all font-mono text-xs text-[rgb(var(--text-strong))]">
                        {selectedAvatar.avatarMint.toString()}
                    </p>
                </div>
                <div>
                    <div className="ui-label">Image Hash</div>
                    <p className="mt-2 break-all font-mono text-xs text-[rgb(var(--text))]">
                        {selectedAvatar.imgHash}
                    </p>
                </div>
                <div>
                    <div className="ui-label">Model Hash</div>
                    <p className="mt-2 break-all font-mono text-xs text-[rgb(var(--text))]">
                        {selectedAvatar.modelHash}
                    </p>
                </div>
            </Panel>
        </div>
    );
};

export default AvatarSelector;