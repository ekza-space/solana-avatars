import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { type ReactNode, useEffect, useState } from "react";

import { Badge, Button, PageSection, Panel, StatCard } from "~/components/ui";
import { getIpfsUrl } from "~/utils/ipfsUrls";
import { NftMetadata } from "~/types/nft";
import SceneWithModel from "~/components/3d/SceneWithModel";

let DISABLE_CACHE = true;

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
  if (DISABLE_CACHE || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AvatarItem[]) : [];
  } catch {
    return [];
  }
}

function saveCachedAvatars(avatars: AvatarItem[]) {
  if (DISABLE_CACHE || typeof window === "undefined") return;
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
  const [avatars, setAvatars] = useState<AvatarItem[] | null>(null);
  const [activeModelSrc, setActiveModelSrc] = useState<string | null>(null);
  const [activeModelDescription, setActiveModelDescription] = useState<string | null>(null);
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const [minter, setMinter] = useState<any | null>(null);

  // Initialise with the local mock while no wallet/cluster is yet queried
  useEffect(() => {
    const cached = loadCachedAvatars();
    if (cached.length) {
      setAvatars(cached);
    }
  }, []);

  useEffect(() => {
    if (!connection || !anchorWallet || typeof window === "undefined") {
      setMinter(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [anchor, { default: minterClient }] = await Promise.all([
          import("@coral-xyz/anchor"),
          import("avatars-sdk/minter"),
        ]);
        const provider = new anchor.AnchorProvider(
          connection,
          anchorWallet as any,
          anchor.AnchorProvider.defaultOptions()
        );
        const program = new anchor.Program(minterClient.idlJson as any, provider);
        // @ts-ignore – minterClient.create has a generic signature
        const minterClientInstance = minterClient.create(provider, program);

        if (cancelled) return;
        setMinter(minterClientInstance);

        // --- On‑chain count ---
        const { registry } = await minterClientInstance.getAvatarRegistry();
        const onChainCount = registry ? registry.nextIndex.toNumber() : 0;

        // --- Local cache ---
        const cached = loadCachedAvatars();

        // If cache is up‑to‑date just ensure it is in state and quit
        if (cached.length === onChainCount) {
          setAvatars(cached);
          return;
        }

        // Otherwise fetch only the missing slice (or reset if cache is longer)
        const start = Math.min(cached.length, onChainCount);
        const limit = onChainCount - start;
        const range = await minterClientInstance.getAvatarDataRange({ start, limit });
        const enriched = await enrichWithMetadata(range as AvatarItem[]);

        // Merge or reset as needed
        const merged =
          cached.length > onChainCount ? enriched : [...cached, ...enriched];

        if (cancelled) return;
        saveCachedAvatars(merged);
        setAvatars(merged);
      } catch (error) {
        console.error("Failed to initialize minter client:", error);
        if (!cancelled) {
          setMinter(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, anchorWallet]);

  const items = avatars ?? [];

  return (
    <PageSection
      eyebrow="Marketplace"
      title="Explore avatar collections"
      description="Browse creator drops, inspect supply and pricing, open 3D previews, and mint directly from the collection feed."
      actions={
        <>
          <Badge>{items.length} items</Badge>
          <Badge tone={minter ? "success" : "default"}>
            {minter ? "Minter ready" : "Initializing"}
          </Badge>
        </>
      }
    >
      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <StatCard label="Source" value="On-chain + IPFS" hint="Registry data and metadata are resolved separately and merged client-side." />
        <StatCard label="Cache" value={DISABLE_CACHE ? "Disabled" : "Enabled"} hint="Local avatar cache remains available, but is disabled by default right now." />
        <StatCard label="Preview" value="3D + text modals" hint="React state now drives previews instead of direct DOM mutation." />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {avatars === null ? (
          <Panel className="col-span-full">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="ui-panel-muted h-56 animate-pulse" />
              <div className="ui-panel-muted h-56 animate-pulse" />
              <div className="ui-panel-muted h-56 animate-pulse" />
            </div>
          </Panel>
        ) : (
          items.map(({ index, data, metadata }) => (
            <Panel key={index} className="flex h-full flex-col gap-4">
              {metadata?.image ? (
                <div className="overflow-hidden rounded-[22px] border border-[rgba(var(--line),0.55)]">
                  <img
                    src={getIpfsUrl(metadata.image)}
                    alt={metadata.name}
                    className="h-52 w-full object-cover"
                  />
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="ui-label">Avatar #{index}</div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
                    {metadata?.name || `Avatar #${index}`}
                  </h2>
                </div>
                <Badge>
                  {Number(data.maxSupply) > 1000000000000 ? "∞ supply" : `${Number(data.maxSupply)} max`}
                </Badge>
              </div>

              {metadata?.description ? (
                <p className="ui-copy text-sm">
                  {metadata.description.slice(0, 160)}
                  {metadata.description.length > 160 ? "..." : ""}
                </p>
              ) : (
                <p className="ui-copy text-sm">No description attached to this collection.</p>
              )}

              <div className="grid gap-3 border-t border-[rgba(var(--line),0.5)] pt-4 text-sm">
                <div>
                  <div className="ui-label">Creator</div>
                  <p className="break-all font-mono text-xs text-[rgb(var(--text-strong))]">
                    {data.creator.toString()}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="ui-label">Current</div>
                    <p className="text-[rgb(var(--text-strong))]">{Number(data.currentSupply)}</p>
                  </div>
                  <div>
                    <div className="ui-label">Mint fee</div>
                    <p className="text-[rgb(var(--text-strong))]">
                      {(Number(data.mintingFeePerMint) / 1_000_000_000).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 9 }
                      )}{" "}
                      SOL
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-auto grid gap-3 sm:grid-cols-2">
                {metadata?.animation_url &&
                metadata?.properties?.category === "vrmodel" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setActiveModelSrc(getIpfsUrl(metadata.animation_url!));
                      setActiveModelDescription(metadata.description || null);
                    }}
                  >
                    View 3D
                  </Button>
                ) : (
                  <div />
                )}

                <Button
                  type="button"
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
                >
                  Mint
                </Button>
              </div>

              {metadata?.description && metadata.description.length > 160 ? (
                <button
                  type="button"
                  className="self-start text-sm font-medium text-[rgb(var(--accent))]"
                  onClick={() => setFullDescription(metadata.description)}
                >
                  Read full description
                </button>
              ) : null}
            </Panel>
          ))
        )}
      </div>

      {activeModelSrc ? (
        <OverlayPanel
          title="3D model preview"
          onClose={() => {
            setActiveModelSrc(null);
            setActiveModelDescription(null);
          }}
        >
          <div className="h-[55vh] overflow-hidden rounded-[22px] border border-[rgba(var(--line),0.55)]">
            <SceneWithModel file={activeModelSrc} />
          </div>
          {activeModelDescription ? (
            <Panel muted className="mt-4">
              <p className="ui-copy text-sm">{activeModelDescription}</p>
            </Panel>
          ) : null}
        </OverlayPanel>
      ) : null}

      {fullDescription ? (
        <OverlayPanel
          title="Collection description"
          onClose={() => setFullDescription(null)}
        >
          <Panel muted>
            <p className="ui-copy whitespace-pre-wrap">{fullDescription}</p>
          </Panel>
        </OverlayPanel>
      ) : null}
    </PageSection>
  );
}

function OverlayPanel({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(2,6,23,0.72)] p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-5xl rounded-[28px] border border-[rgba(var(--line-strong),0.45)] bg-[rgba(var(--surface),0.96)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
            {title}
          </h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}