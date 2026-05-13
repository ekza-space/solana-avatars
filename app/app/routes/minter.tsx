import { useSearchParams } from "@remix-run/react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge, Button, PageSection, Panel, StatCard } from "~/components/ui";
import { getIpfsUrl } from "~/utils/ipfsUrls";
import { NftMetadata } from "~/types/nft";
import SceneWithModel from "~/components/3d/SceneWithModel";

let DISABLE_CACHE = true;
const MAX_NAME_BYTES = 32;
const MAX_SYMBOL_BYTES = 10;
const MAX_URI_BYTES = 200;
const SOLANA_STELLAR_PROGRAM_ID =
  "3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA";
const STELLAR_ASSET_PARENT_CHILD_OFFSET = 8;
const STELLAR_ASSET_PARENT_PARENT_OFFSET = 8 + 32;

let mocked = [
  {
    index: 0,
    data: {
      uriIpfsHash: "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
      creator: "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
      maxSupply: "64",
      currentSupply: "04",
      mintingFeePerMint: "989680",
      totalUnclaimedFees: "989680",
      index: "00",
      bump: 252,
    },
  },
  {
    index: 1,
    data: {
      uriIpfsHash: "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
      creator: "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
      maxSupply: "64",
      currentSupply: "01",
      mintingFeePerMint: "00",
      totalUnclaimedFees: "00",
      index: "01",
      bump: 253,
    },
  },
  {
    index: 2,
    data: {
      uriIpfsHash: "QmasLmFRuRJQd8iJKQpzq2M1vFXLsKa3q6mMfQHy2rsN19",
      creator: "FCMPSxbmyMugTRyfdGPNx4mdeAaVDcSnVaN3p82zBcT8",
      maxSupply: "01",
      currentSupply: "01",
      mintingFeePerMint: "989680",
      totalUnclaimedFees: "989680",
      index: "02",
      bump: 255,
    },
  },
];

type AvatarItem = (typeof mocked)[number] & { metadata?: NftMetadata | null };
type StellarOriginLink = {
  avatarData: string;
  stellarProgram: string;
  universe: string;
  asset: string;
  release: string;
  vault: string;
};

type EnrichedAvatarItem = AvatarItem & {
  stellarLink?: StellarOriginLink | null;
  sourceImageHash?: string | null;
};

const VIEW_3D_BUTTON_STYLE = {
  color: "rgb(var(--text-strong, 15 23 42))",
  backgroundColor: "rgb(var(--surface, 255 255 255))",
  background: "linear-gradient(180deg, rgba(var(--surface, 255 255 255), 0.97), rgba(var(--surface-2, 239 244 248), 0.9))",
  borderColor: "rgba(var(--line-strong, 28 36 48), 0.62)",
};

const LS_KEY = "avatarsCache";

function getStellarUiBaseUrl(): string {
  const envBase = import.meta.env.VITE_STELLAR_UI_URL?.trim();
  if (envBase) return envBase;
  if (import.meta.env.DEV) return "http://localhost:7101";
  return "";
}

function loadCachedAvatars(): EnrichedAvatarItem[] {
  if (DISABLE_CACHE || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as EnrichedAvatarItem[]) : [];
  } catch {
    return [];
  }
}

function saveCachedAvatars(avatars: EnrichedAvatarItem[]) {
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
function mintUriForHash(hash: string) {
  if (
    hash.startsWith("http://") ||
    hash.startsWith("https://") ||
    hash.startsWith("local:")
  ) {
    return hash;
  }
  return `ipfs://${hash}`;
}

function isRenderableModelMetadata(metadata?: NftMetadata | null) {
  const animationUrl = metadata?.animation_url?.trim();
  if (!animationUrl) return false;

  const animationPath = animationUrl.split(/[?#]/)[0].toLowerCase();
  if (animationPath.endsWith(".json")) return false;
  if (/\.(glb|gltf|vrm|obj)$/i.test(animationPath)) return true;

  const animationFile = metadata?.properties?.files?.find(
    (file) => file.uri === animationUrl
  );
  const fileType = animationFile?.type?.toLowerCase() || "";
  return (
    fileType.includes("gltf") ||
    fileType.includes("glb") ||
    fileType.includes("vrm") ||
    fileType.includes("wavefront") ||
    fileType.includes("model/")
  );
}

function formatMintError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("Index out of range") ||
      message.includes("Buffer size") ||
      message.includes("Out of bounds")
    ) {
      return "Mint payload is too large for client-side instruction encoding. Please check name/symbol/URI length.";
    }
    if (message.includes("mintNft failed")) {
      return message;
    }
    return message;
  }
  return "Unknown mint error.";
}

function normalizeUtf8String(
  value: unknown,
  label: string,
  maxBytes: number
): string {
  if (typeof value !== "string") {
    throw new Error(`Avatar ${label} is not a string.`);
  }
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > maxBytes) {
    throw new Error(
      `Avatar ${label} is too long (${bytes} bytes, max ${maxBytes}).`
    );
  }
  return value;
}

type ParsedStellarAssetMetadata = {
  metadataHash: string;
  previewHash: string;
};

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return "";
}

function decodeBorshString(
  value: Uint8Array,
  cursor: { current: number },
  view: DataView
): string {
  if (cursor.current + 4 > value.length) {
    throw new Error("Stellar asset metadata string length is truncated.");
  }

  const length = view.getUint32(cursor.current, true);
  cursor.current += 4;

  if (cursor.current + length > value.length) {
    throw new Error("Stellar asset metadata string payload is truncated.");
  }

  const bytes = value.slice(cursor.current, cursor.current + length);
  cursor.current += length;
  return new TextDecoder()
    .decode(bytes)
    .replace(/\u0000/g, "")
    .trim();
}

function parseStellarAssetMetadata(
  data: Uint8Array
): ParsedStellarAssetMetadata | null {
  try {
    if (data.length < 8) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const cursor = { current: 8 };
    const fixedPrefix = 32 + 8 + 32 + 32 + 1 + 1 + 1 + 1 + 1;

    if (cursor.current + fixedPrefix > data.length) {
      return null;
    }
    cursor.current += fixedPrefix;

    const metadataHash = decodeBorshString(data, cursor, view);
    const previewHash = decodeBorshString(data, cursor, view);

    return { metadataHash, previewHash };
  } catch (error) {
    console.error("Failed to parse Stellar asset metadata", error);
    return null;
  }
}

async function fetchStellarAssetMetadata(
  connection: Connection,
  assetAddress: string
): Promise<ParsedStellarAssetMetadata | null> {
  try {
    const account = await connection.getAccountInfo(
      new PublicKey(assetAddress)
    );
    if (!account?.data) {
      return null;
    }

    return parseStellarAssetMetadata(account.data);
  } catch (error) {
    console.error(
      `Cannot load on-chain Stellar asset metadata #${assetAddress}`,
      error
    );
    return null;
  }
}

async function fetchJsonMetadata(
  hash: string
): Promise<Record<string, any> | null> {
  if (!hash) return null;

  try {
    const res = await fetch(getIpfsUrl(hash));
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? json : null;
  } catch (error) {
    console.error(`Cannot load JSON metadata #${hash}`, error);
    return null;
  }
}

function imageFromMetadata(metadata: Record<string, any> | null) {
  if (!metadata) return "";
  return firstString([
    metadata.image,
    metadata.image_url,
    metadata.imageUrl,
    metadata.thumbnail,
    metadata.preview,
    metadata.previewImage,
    metadata.preview_ipfs_hash,
    metadata.preview_hash,
    metadata.ipfs_img_hash,
    metadata.ipfsImgHash,
    metadata.ipfsImage,
  ]);
}

async function fetchStellarAssetImage(
  connection: Connection,
  assetAddress: string
): Promise<string | null> {
  const assetMetadata = await fetchStellarAssetMetadata(
    connection,
    assetAddress
  );
  if (!assetMetadata) return null;
  if (assetMetadata.previewHash) return assetMetadata.previewHash;

  const jsonMetadata = await fetchJsonMetadata(assetMetadata.metadataHash);
  return imageFromMetadata(jsonMetadata) || null;
}

function parseStellarParentAssetAddress(data: Uint8Array): string | null {
  if (data.length < STELLAR_ASSET_PARENT_PARENT_OFFSET + 32) return null;
  return new PublicKey(
    data.slice(
      STELLAR_ASSET_PARENT_PARENT_OFFSET,
      STELLAR_ASSET_PARENT_PARENT_OFFSET + 32
    )
  ).toBase58();
}

async function fetchStellarParentAssetImage(
  connection: Connection,
  stellarProgram: string,
  childAssetAddress: string
): Promise<string | null> {
  try {
    const links = await connection.getProgramAccounts(
      new PublicKey(stellarProgram),
      {
        filters: [
          {
            memcmp: {
              offset: STELLAR_ASSET_PARENT_CHILD_OFFSET,
              bytes: childAssetAddress,
            },
          },
        ],
      }
    );

    for (const link of links) {
      const parentAsset = parseStellarParentAssetAddress(link.account.data);
      if (!parentAsset) continue;

      const parentMetadata = await fetchStellarAssetMetadata(
        connection,
        parentAsset
      );
      const image =
        parentMetadata?.previewHash ||
        imageFromMetadata(
          await fetchJsonMetadata(parentMetadata?.metadataHash || "")
        );
      if (image) return image;
    }
  } catch (error) {
    console.error(
      `Cannot load parent Stellar asset preview for #${childAssetAddress}`,
      error
    );
  }

  return null;
}

function stellarSourceUrl(link: StellarOriginLink) {
  const base = getStellarUiBaseUrl();
  if (!base) {
    return `/universe/${link.universe}/source/${link.asset}`;
  }

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}/universe/${link.universe}/source/${link.asset}`;
}

const publicKeyString = (value: unknown) =>
  value && typeof (value as any).toBase58 === "function"
    ? (value as any).toBase58()
    : String(value || "");

const enrichWithMetadata = async (
  raw: AvatarItem[],
  minter: any,
  connection: Connection
): Promise<EnrichedAvatarItem[]> => {
  return Promise.all(
    raw.map(async (avatar) => {
      let metadata: NftMetadata | null = null;
      let stellarLink: StellarOriginLink | null = null;
      let sourceImageHash: string | null = null;

      try {
        const metadataUrl = getIpfsUrl(avatar.data.uriIpfsHash);
        const res = await fetch(metadataUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        metadata = await res.json();
      } catch (err) {
        console.error(`Cannot load metadata for avatar #${avatar.index}`, err);
      }

      try {
        const link = await minter?.getStellarLinkByIndex?.(avatar.index);
        if (link?.account) {
          stellarLink = {
            avatarData: publicKeyString(link.account.avatarData),
            stellarProgram:
              publicKeyString(link.account.stellarProgram) ||
              SOLANA_STELLAR_PROGRAM_ID,
            universe: publicKeyString(link.account.universe),
            asset: publicKeyString(link.account.asset),
            release: publicKeyString(link.account.release),
            vault: publicKeyString(link.account.vault),
          };

          sourceImageHash = await fetchStellarAssetImage(
            connection,
            stellarLink.asset
          );
          if (!sourceImageHash) {
            sourceImageHash = await fetchStellarParentAssetImage(
              connection,
              stellarLink.stellarProgram,
              stellarLink.asset
            );
          }
        }
      } catch (err) {
        console.error(
          `Cannot load Stellar link for avatar #${avatar.index}`,
          err
        );
      }

      return { ...avatar, metadata, stellarLink, sourceImageHash };
    })
  );
};

export default function MarketPage() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [searchParams] = useSearchParams();
  const [avatars, setAvatars] = useState<EnrichedAvatarItem[] | null>(null);
  const [activeModelSrc, setActiveModelSrc] = useState<string | null>(null);
  const [activeModelDescription, setActiveModelDescription] = useState<
    string | null
  >(null);
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
        const program = new anchor.Program(
          minterClient.idlJson as any,
          provider
        );
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
        const range = await minterClientInstance.getAvatarDataRange({
          start,
          limit,
        });
        const enriched = await enrichWithMetadata(
          range as AvatarItem[],
          minterClientInstance,
          connection
        );

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

  const requestedAvatarData = searchParams.get("avatarData")?.trim() || "";
  const requestedAvatarIndexRaw = searchParams.get("avatarIndex")?.trim() || "";
  const requestedAvatarIndex = requestedAvatarIndexRaw
    ? Number(requestedAvatarIndexRaw)
    : NaN;
  const items = useMemo(() => {
    const source = avatars ?? [];
    if (!requestedAvatarData && Number.isNaN(requestedAvatarIndex)) {
      return source;
    }

    return source.slice().sort((left, right) => {
      const leftMatch =
        (requestedAvatarData &&
          left.stellarLink?.avatarData === requestedAvatarData) ||
        (!Number.isNaN(requestedAvatarIndex) &&
          Number(left.index) === requestedAvatarIndex);
      const rightMatch =
        (requestedAvatarData &&
          right.stellarLink?.avatarData === requestedAvatarData) ||
        (!Number.isNaN(requestedAvatarIndex) &&
          Number(right.index) === requestedAvatarIndex);
      return Number(rightMatch) - Number(leftMatch);
    });
  }, [avatars, requestedAvatarData, requestedAvatarIndex]);
  const highlightedAvatar = items.find(
    (item) =>
      (requestedAvatarData &&
        item.stellarLink?.avatarData === requestedAvatarData) ||
      (!Number.isNaN(requestedAvatarIndex) &&
        Number(item.index) === requestedAvatarIndex)
  );

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
        <StatCard
          label="Source"
          value="On-chain + IPFS"
          hint="Registry data and metadata are resolved separately and merged client-side."
        />
        <StatCard
          label="Cache"
          value={DISABLE_CACHE ? "Disabled" : "Enabled"}
          hint="Local avatar cache remains available, but is disabled by default right now."
        />
        <StatCard
          label="Preview"
          value="3D + text modals"
          hint="React state now drives previews instead of direct DOM mutation."
        />
      </div>

      {requestedAvatarData || !Number.isNaN(requestedAvatarIndex) ? (
        <Panel muted className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-label">Direct mint link</div>
              <p className="ui-copy">
                {highlightedAvatar
                  ? "The deployed avatar drop is pinned at the top of the market."
                  : "Looking for the deployed avatar drop. Connect the right wallet/cluster if it is not visible yet."}
              </p>
            </div>
            <Badge tone={highlightedAvatar ? "success" : "default"}>
              {highlightedAvatar
                ? `Avatar #${highlightedAvatar.index}`
                : "Searching"}
            </Badge>
          </div>
        </Panel>
      ) : null}

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
          items.map(
            ({ index, data, metadata, stellarLink, sourceImageHash }) => {
              const imageSource = metadata?.image || sourceImageHash;
              const isHighlighted =
                (requestedAvatarData &&
                  stellarLink?.avatarData === requestedAvatarData) ||
                (!Number.isNaN(requestedAvatarIndex) &&
                  Number(index) === requestedAvatarIndex);
              const canPreviewModel = isRenderableModelMetadata(metadata);
              const modelAnimationUrl = canPreviewModel
                ? metadata?.animation_url
                : "";
              const modelDescription = metadata?.description || null;
              return (
                <Panel
                  key={index}
                  className={`flex h-full flex-col gap-4 ${
                    isHighlighted
                      ? "ring-2 ring-[rgb(var(--accent))] ring-offset-2 ring-offset-[rgb(var(--bg))]"
                      : ""
                  }`}
                >
                  {imageSource ? (
                    <div className="overflow-hidden rounded-[22px] border border-[rgba(var(--line),0.55)]">
                      <img
                        src={getIpfsUrl(imageSource)}
                        alt={metadata?.name || `Avatar ${index}`}
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
                      {Number(data.maxSupply) > 1000000000000
                        ? "∞ supply"
                        : `${Number(data.maxSupply)} max`}
                    </Badge>
                  </div>

                  {metadata?.description ? (
                    <p className="ui-copy text-sm">
                      {metadata.description.slice(0, 160)}
                      {metadata.description.length > 160 ? "..." : ""}
                    </p>
                  ) : (
                    <p className="ui-copy text-sm">
                      No description attached to this collection.
                    </p>
                  )}

                  <div className="grid gap-3 border-t border-[rgba(var(--line),0.5)] pt-4 text-sm">
                    <div>
                      <div className="ui-label">Creator</div>
                      <p className="break-all font-mono text-xs text-[rgb(var(--text-strong))]">
                        {data.creator.toString() ===
                        "11111111111111111111111111111111"
                          ? "Stellar release"
                          : data.creator.toString()}
                      </p>
                    </div>
                    {stellarLink ? (
                      <div>
                        <div className="ui-label">Source</div>
                        <a
                          href={stellarSourceUrl(stellarLink)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-[rgb(var(--accent))]"
                        >
                          Open Stellar asset
                        </a>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="ui-label">Current</div>
                        <p className="text-[rgb(var(--text-strong))]">
                          {Number(data.currentSupply)}
                        </p>
                      </div>
                      <div>
                        <div className="ui-label">Mint fee</div>
                        <p className="text-[rgb(var(--text-strong))]">
                          {(
                            Number(data.mintingFeePerMint) / 1_000_000_000
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 9,
                          })}{" "}
                          SOL
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto grid gap-3 sm:grid-cols-2">
                    {canPreviewModel ? (
                      <Button
                        type="button"
                        variant="secondary"
                        style={VIEW_3D_BUTTON_STYLE}
                        onClick={() => {
                          if (!modelAnimationUrl) return;
                          setActiveModelSrc(getIpfsUrl(modelAnimationUrl));
                          setActiveModelDescription(modelDescription);
                        }}
                      >
                        View 3D
                      </Button>
                    ) : (
                      <div />
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      style={VIEW_3D_BUTTON_STYLE}
                      onClick={async () => {
                        if (!minter || !metadata) return;
                        try {
                          const name = normalizeUtf8String(
                            metadata.name,
                            "name",
                            MAX_NAME_BYTES
                          );
                          const symbol = normalizeUtf8String(
                            metadata.symbol,
                            "symbol",
                            MAX_SYMBOL_BYTES
                          );
                          const uri = normalizeUtf8String(
                            mintUriForHash(data.uriIpfsHash),
                            "metadata URI",
                            MAX_URI_BYTES
                          );

                          const result = await minter.mintNft({
                            index,
                            name,
                            symbol,
                            uri,
                            stellar: stellarLink
                              ? {
                                  stellarLink: minter.getStellarLinkPda(
                                    minter.getAvatarDataPda(index)[0]
                                  )[0],
                                  stellarProgram: new PublicKey(
                                    "3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA"
                                  ),
                                  stellarRelease: new PublicKey(
                                    stellarLink.release
                                  ),
                                  stellarVault: new PublicKey(
                                    stellarLink.vault
                                  ),
                                }
                              : undefined,
                          });
                          console.log("Minted NFT:", result);
                          alert(`Minted NFT!\nSignature: ${result.signature}`);
                          } catch (error) {
                            const message = formatMintError(error);
                            console.error("Mint failed:", error);
                            alert(message);
                          }
                        }}
                    >
                      Mint
                    </Button>
                  </div>

                  {metadata?.description &&
                  metadata.description.length > 160 ? (
                    <button
                      type="button"
                      className="self-start text-sm font-medium text-[rgb(var(--accent))]"
                      onClick={() => setFullDescription(metadata.description)}
                    >
                      Read full description
                    </button>
                  ) : null}
                </Panel>
              );
            }
          )
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
          <div className="h-[55vh] overflow-hidden rounded-[22px] border border-[rgba(var(--line),0.55)] bg-[rgba(var(--surface-2),0.86)]">
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
