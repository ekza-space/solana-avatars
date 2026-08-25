import React, { useRef, useEffect, useState } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button, Card, DataList, EmptyState } from "~/components/ui";
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
            <EmptyState
                title="No avatars in this wallet"
                description="Mint an avatar in the market first, then come back to bind it to your profile."
                action={
                    <a href="/minter" className="ui-button">
                        Open the market
                    </a>
                }
            />
        );
    }

    return (
        <div className="space-y-6">
            <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--line))] px-4 py-3">
                    <h2 className="ui-h3">Preview</h2>
                    <span className="ui-label">
                        {displayedAvatarList.length} owned
                    </span>
                </div>

                {modelUrl ? (
                    <div className="h-[440px] bg-[rgb(var(--surface-2))]">
                        <SceneWithModel file={modelUrl} />
                    </div>
                ) : (
                    <div className="flex h-[440px] items-center justify-center bg-[rgb(var(--surface-2))] p-4">
                        {selectedAvatar.imgHash ? (
                            <img
                                src={`${IPFS_GATEWAY}${selectedAvatar.imgHash}`}
                                alt={`Avatar preview ${selectedAvatar.imgHash}`}
                                className="max-h-full w-auto object-contain"
                            />
                        ) : (
                            <span className="ui-label">No preview available</span>
                        )}
                    </div>
                )}

                <div className="px-4 py-2">
                    <DataList
                        items={[
                            {
                                label: "Mint",
                                value: selectedAvatar.avatarMint.toString(),
                            },
                            selectedAvatar.modelHash
                                ? { label: "Model", value: selectedAvatar.modelHash }
                                : null,
                        ]}
                    />
                </div>
            </Card>

            <section>
                <div className="mb-4 flex items-end justify-between gap-3 border-b border-[rgb(var(--line))] pb-3">
                    <h2 className="ui-h3">Wallet inventory</h2>
                    <span className="ui-label">Click to select</span>
                </div>

                <div
                    ref={containerRef}
                    className="grid max-h-[420px] gap-4 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3"
                >
                    {displayedAvatarList.map((avatar) => {
                        const isSelected =
                            avatar.avatarMint.toString() === selectedAvatar.avatarMint.toString();

                        return (
                            <div
                                key={avatar.avatarMint.toString()}
                                className="ui-card-action group relative overflow-hidden"
                                data-selected={isSelected ? "true" : undefined}
                            >
                                <button
                                    type="button"
                                    className="block w-full cursor-pointer text-left"
                                    aria-pressed={isSelected}
                                    onClick={() => {
                                        setSelectedAvatar(avatar);
                                        console.log("set selected avatar: ", avatar);
                                    }}
                                >
                                    <div className="aspect-square w-full overflow-hidden bg-[rgb(var(--surface-2))]">
                                        {avatar.imgHash ? (
                                            <img
                                                src={`${IPFS_GATEWAY}${avatar.imgHash}`}
                                                alt=""
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : null}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                                        <span className="ui-mono truncate">
                                            {avatar.avatarMint.toString().slice(0, 6)}…
                                            {avatar.avatarMint.toString().slice(-4)}
                                        </span>
                                        {isSelected ? (
                                            <span className="bg-[rgb(var(--accent))] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--accent-ink))]">
                                                Selected
                                            </span>
                                        ) : null}
                                    </div>
                                </button>

                                <Button
                                    variant="danger"
                                    size="sm"
                                    className="absolute right-2 top-2 bg-[rgb(var(--surface))] opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                            typeof window !== "undefined" &&
                                            !window.confirm(
                                                "Burn this NFT? The token is destroyed permanently."
                                            )
                                        ) {
                                            return;
                                        }
                                        handleBurnInvalidNFTs(
                                            publicKey,
                                            connected,
                                            [avatar.avatarMint.toString()],
                                            sendTransaction,
                                            connection
                                        );
                                    }}
                                    disabled={!connected}
                                    aria-label={`Burn avatar ${avatar.avatarMint.toString()}`}
                                >
                                    Burn
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default AvatarSelector;
