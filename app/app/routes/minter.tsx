import Header from "~/components/header"; // Assuming this is your existing header
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import minterClient from "~/../../sdk/src/minter";
import { useEffect, useMemo, useState } from "react";

import { getIpfsUrl } from "~/utils/ipfsUrls";
import { NftMetadata } from "~/types/nft";

let mocked = [
    {
        "index": 0,
        "data": {
            "uriIpfsHash": "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
            "creator": "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
            "maxSupply": "64",
            "currentSupply": "04",
            "mintingFeePerMint": "989680",
            "totalUnclaimedFees": "989680",
            "index": "00",
            "bump": 252
        }
    },
    {
        "index": 1,
        "data": {
            "uriIpfsHash": "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
            "creator": "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
            "maxSupply": "64",
            "currentSupply": "01",
            "mintingFeePerMint": "00",
            "totalUnclaimedFees": "00",
            "index": "01",
            "bump": 253
        }
    },
    {
        "index": 2,
        "data": {
            "uriIpfsHash": "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
            "creator": "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
            "maxSupply": "01",
            "currentSupply": "01",
            "mintingFeePerMint": "989680",
            "totalUnclaimedFees": "989680",
            "index": "02",
            "bump": 255
        }
    }
]

type AvatarItem = (typeof mocked)[number] & { metadata?: NftMetadata | null };

const LS_KEY = "avatarsCache";

function loadCachedAvatars(): AvatarItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AvatarItem[]) : [];
  } catch {
    return [];
  }
}

function saveCachedAvatars(avatars: AvatarItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(avatars));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Resolves the on‑chain NFT metadata JSON for each avatar and attaches it
 * under `metadata`. Errors are swallowed so that a single bad fetch
 * does not break the whole grid.
 */
const enrichWithMetadata = async (raw: AvatarItem[]): Promise<AvatarItem[]> => {
  return Promise.all(
    raw.map(async avatar => {
      try {
        const metadataUrl = getIpfsUrl(avatar.data.uriIpfsHash);
        const res = await fetch(metadataUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const metadata: NftMetadata = await res.json();
        return { ...avatar, metadata };
      } catch (err) {
        console.error(`Cannot load metadata for avatar #${avatar.index}`, err);
        return { ...avatar, metadata: null };
      }
    })
  );
};

export default function MarketPage() {
    const { connection } = useConnection();
    const anchorWallet = useAnchorWallet();
    const [avatars, setAvatars] = useState<AvatarItem[]>([]);
    const minter = useMemo(() => {
      if (!connection || !anchorWallet) return null;
      const provider = new anchor.AnchorProvider(connection, anchorWallet, {});
      const program = new anchor.Program(minterClient.idlJson as any, provider);
      // @ts-ignore
      return minterClient.create(provider, program);
    }, [connection, anchorWallet]);

    // Initialise with the local mock while no wallet/cluster is yet queried
    useEffect(() => {
      const cached = loadCachedAvatars();
      if (cached.length) {
        setAvatars(cached);
      } else {
        enrichWithMetadata(mocked as AvatarItem[]).then(setAvatars);
      }
    }, []);

    useEffect(() => {
        if (!connection || !anchorWallet) return;

        (async () => {
          const provider = new anchor.AnchorProvider(
            connection,
            anchorWallet as any,
            anchor.AnchorProvider.defaultOptions()
          );
          const program = new anchor.Program(minterClient.idlJson as any, provider);
          // @ts-ignore – minterClient.create has a generic signature
          const minter = minterClient.create(provider, program);

          // --- On‑chain count ---
          const { registry } = await minter.getAvatarRegistry();
          const onChainCount = registry ? registry.nextIndex.toNumber() : 0;

          // --- Local cache ---
          let cached = loadCachedAvatars();

          // If cache is up‑to‑date just ensure it is in state and quit
          if (cached.length === onChainCount) {
            setAvatars(cached);
            return;
          }

          // Otherwise fetch only the missing slice (or reset if cache is longer)
          const start = Math.min(cached.length, onChainCount);
          const limit = onChainCount - start;
          const range = await minter.getAvatarDataRange({ start, limit });
          const enriched = await enrichWithMetadata(range as AvatarItem[]);

          // Merge or reset as needed
          let merged: AvatarItem[];
          if (cached.length > onChainCount) {
            merged = enriched; // chain rolled back? unlikely, but handle
          } else {
            merged = [...cached, ...enriched];
          }

          saveCachedAvatars(merged);
          setAvatars(merged);
        })();
    }, [connection, anchorWallet]);

    return (
        <div className="min-h-screen text-slate-800"> {/* Softer background */}
            <Header />
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 className="text-4xl font-bold text-slate-900 mb-10 text-center"> {/* Page Title */}
                    Explore the Avatar NFT Marketplace
                </h1>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {avatars && avatars.map(({ index, data, metadata }) => (
                        <div
                            key={index}
                            className="bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-2xl hover:-translate-y-1 p-6"
                        >
                            {metadata?.image && (
                              <img
                                src={getIpfsUrl(metadata.image)}
                                alt={metadata.name}
                                className="w-full h-48 object-cover rounded mb-4"
                              />
                            )}

                            {metadata?.animation_url &&
                              metadata?.properties?.category === "vrmodel" && (
                                <a
                                  href={getIpfsUrl(metadata.animation_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-indigo-600 underline text-sm mb-4"
                                >
                                  View 3D model
                                </a>
                              )}

                            <h3 className="text-xl font-semibold text-slate-900 mb-4">
                                Avatar #{index}
                            </h3>
                            {metadata?.name && (
                              <p className="text-slate-700 font-medium mb-2">{metadata.name}</p>
                            )}
                            {metadata?.description && (
                              <p className="text-sm text-slate-500 mb-4">{metadata.description}</p>
                            )}
                            <p className="text-sm text-slate-500 mb-2">
                                Creator:{" "}
                                <span className="font-medium text-slate-700 break-all">
                                    {data.creator.toString()}
                                </span>
                            </p>
                            <p className="text-sm text-slate-600 mb-2">
                                Max supply: {Number(data.maxSupply)}
                            </p>
                            <p className="text-sm text-slate-600 mb-2">
                                Current supply: {Number(data.currentSupply)}
                            </p>
                            <p className="text-sm text-slate-600">
                                Minting fee:{" "}
                                {(Number(data.mintingFeePerMint) / 1_000_000_000).toLocaleString(
                                    undefined,
                                    { maximumFractionDigits: 9 }
                                )}{" "}
                                SOL
                            </p>
                            {/* Mint button */}
                            <button
                              onClick={async () => {
                                if (!minter || !metadata) return;
                                const result = await minter.mintNft({
                                  index,
                                  name: metadata.name,
                                  symbol: metadata.symbol,
                                  uri: getIpfsUrl(data.uriIpfsHash),
                                });
                                console.log("Minted NFT:", result);
                                alert(`Minted NFT!\nSignature: ${result.signature}`);
                              }}
                              className="mt-4 w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition"
                            >
                              Mint
                            </button>
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