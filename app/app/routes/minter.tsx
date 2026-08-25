import { useSearchParams } from "@remix-run/react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  Button,
  DataList,
  EmptyState,
  Meta,
  Notice,
  Page,
  PageHeader,
  Section,
  Skeleton,
  Status,
} from "~/components/ui";
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

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
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
  const [mintingIndex, setMintingIndex] = useState<number | null>(null);
  const [mintNotice, setMintNotice] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

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

  const isLoading = avatars === null;
  const showDirectLinkNotice =
    Boolean(requestedAvatarData) || !Number.isNaN(requestedAvatarIndex);

  return (
    <Page>
      <PageHeader
        eyebrow="Market"
        title="Avatar drops, ready to mint."
        lede="Every collection is a 3D model published on-chain. Preview it, check the supply, mint it into your wallet."
        meta={
          <>
            <Meta label="Collections" value={isLoading ? "—" : items.length} />
            <Meta
              label="Mint fee unit"
              value="SOL"
            />
            <Status tone={minter ? "ok" : "idle"}>
              {minter ? "Minter ready" : "Connecting"}
            </Status>
          </>
        }
        actions={
          <a href="/deployer" className="ui-button ui-button-secondary">
            Publish a collection
          </a>
        }
      />

      {mintNotice ? (
        <Notice tone={mintNotice.tone} className="mt-8">
          <div className="flex items-start justify-between gap-4">
            <span className="break-all">{mintNotice.text}</span>
            <button
              type="button"
              className="ui-label shrink-0 hover:text-[rgb(var(--text-strong))]"
              onClick={() => setMintNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </Notice>
      ) : null}

      {showDirectLinkNotice ? (
        <Notice
          tone={highlightedAvatar ? "success" : "info"}
          className="mt-8"
        >
          {highlightedAvatar
            ? `Shared link resolved — collection #${highlightedAvatar.index} is pinned first.`
            : "Looking for the shared collection. If it stays missing, switch to the cluster it was deployed on."}
        </Notice>
      ) : null}

      <Section>
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="ui-card overflow-hidden" aria-busy="true">
                <Skeleton className="aspect-square w-full" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No collections on this network yet"
            description="Nothing has been deployed to the selected cluster. Switch the network in the header, or publish the first drop yourself."
            action={
              <a href="/deployer" className="ui-button">
                Publish a collection
              </a>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map(
              ({ index, data, metadata, stellarLink, sourceImageHash }) => {
                const imageSource = metadata?.image || sourceImageHash;
                const isHighlighted =
                  (requestedAvatarData &&
                    stellarLink?.avatarData === requestedAvatarData) ||
                  (!Number.isNaN(requestedAvatarIndex) &&
                    Number(index) === requestedAvatarIndex);
                const canPreviewModel = isRenderableModelMetadata(metadata);
                // Metadata lives off-chain; when its CID is malformed or unpinned
                // the collection cannot be minted (name/symbol/uri come from it).
                const metadataUnavailable = !metadata;
                const modelAnimationUrl = canPreviewModel
                  ? metadata?.animation_url
                  : "";
                const modelDescription = metadata?.description || null;
                const maxSupplyRaw = Number(data.maxSupply);
                const isInfinite = maxSupplyRaw > 1000000000000;
                const feeLamports = Number(data.mintingFeePerMint);
                const isBusy = mintingIndex === index;
                const description = metadata?.description?.trim() || "";

                return (
                  <article
                    key={index}
                    className="ui-card-action flex h-full flex-col overflow-hidden"
                    data-selected={isHighlighted ? "true" : undefined}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-[rgb(var(--surface-2))]">
                      {imageSource ? (
                        <img
                          src={getIpfsUrl(imageSource)}
                          alt={metadata?.name || `Avatar collection ${index}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="ui-label">No preview</span>
                        </div>
                      )}

                      <span className="absolute left-0 top-0 bg-[rgb(var(--accent))] px-2 py-1 font-mono text-[10px] font-semibold tabular-nums tracking-[0.12em] text-[rgb(var(--accent-ink))]">
                        #{String(index).padStart(3, "0")}
                      </span>

                      {canPreviewModel ? (
                        // The whole thumbnail opens the 3D view: a small corner
                        // button read as decoration, so people did not realise
                        // the model was viewable at all.
                        <button
                          type="button"
                          aria-label={`View ${metadata?.name || `collection ${index}`} in 3D`}
                          className="group absolute inset-0 flex items-end justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-inset"
                          onClick={() => {
                            if (!modelAnimationUrl) return;
                            setActiveModelSrc(getIpfsUrl(modelAnimationUrl));
                            setActiveModelDescription(modelDescription);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 bg-[rgb(var(--text-strong))] opacity-0 transition-opacity duration-150 group-hover:opacity-20 group-focus-visible:opacity-20"
                          />
                          <span className="relative mb-3 flex items-center gap-2 bg-[rgb(var(--accent))] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--accent-ink))] shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5">
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
                              <path d="M3 7.5 12 12l9-4.5M12 12v9" />
                            </svg>
                            View in 3D
                          </span>
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col gap-4 p-4">
                      <div>
                        <h2 className="ui-h3">
                          {metadata?.name || `Avatar #${index}`}
                        </h2>
                        {description ? (
                          <p className="ui-copy-sm mt-1.5 line-clamp-2">
                            {description}
                          </p>
                        ) : metadataUnavailable ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--warning))]">
                            Metadata could not be loaded from IPFS, so this
                            collection cannot be minted.
                          </p>
                        ) : (
                          <p className="ui-copy-sm mt-1.5 opacity-70">
                            No description.
                          </p>
                        )}
                        {description.length > 160 ? (
                          <button
                            type="button"
                            className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--text-strong))] underline decoration-[rgb(var(--accent-line))] decoration-2 underline-offset-4"
                            onClick={() => setFullDescription(description)}
                          >
                            Read more
                          </button>
                        ) : null}
                      </div>

                      <DataList
                        className="mt-auto border-t border-[rgb(var(--line))] pt-1"
                        items={[
                          {
                            label: "Price",
                            value:
                              feeLamports === 0
                                ? "Free"
                                : `${(feeLamports / 1_000_000_000).toLocaleString(
                                    undefined,
                                    { maximumFractionDigits: 4 }
                                  )} SOL`,
                          },
                          {
                            label: "Minted",
                            value: isInfinite
                              ? `${Number(data.currentSupply)} / ∞`
                              : `${Number(data.currentSupply)} / ${maxSupplyRaw}`,
                          },
                          {
                            label: "Creator",
                            value: (
                              <span title={data.creator.toString()}>
                                {data.creator.toString() ===
                                "11111111111111111111111111111111"
                                  ? "Stellar release"
                                  : shortAddress(data.creator.toString())}
                              </span>
                            ),
                          },
                          stellarLink
                            ? {
                                label: "Source",
                                value: (
                                  <a
                                    href={stellarSourceUrl(stellarLink)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ui-link"
                                  >
                                    Stellar asset ↗
                                  </a>
                                ),
                              }
                            : null,
                        ]}
                      />

                      <Button
                        className="w-full"
                        disabled={metadataUnavailable || isBusy || !minter}
                        title={
                          metadataUnavailable
                            ? "Metadata could not be loaded for this collection"
                            : undefined
                        }
                        onClick={async () => {
                          if (!minter || !metadata) return;
                          setMintNotice(null);
                          setMintingIndex(index);
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
                            setMintNotice({
                              tone: "success",
                              text: `Minted "${name}". Signature ${result.signature}`,
                            });
                          } catch (error) {
                            const message = formatMintError(error);
                            console.error("Mint failed:", error);
                            setMintNotice({ tone: "error", text: message });
                          } finally {
                            setMintingIndex(null);
                          }
                        }}
                      >
                        {metadataUnavailable
                          ? "Unavailable"
                          : isBusy
                            ? "Minting…"
                            : "Mint"}
                      </Button>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </Section>

      {activeModelSrc ? (
        <Overlay
          title="3D preview"
          onClose={() => {
            setActiveModelSrc(null);
            setActiveModelDescription(null);
          }}
        >
          <div className="h-[60vh] border border-[rgb(var(--line))] bg-[rgb(var(--surface-2))]">
            <SceneWithModel file={activeModelSrc} />
          </div>
          {activeModelDescription ? (
            <p className="ui-copy-sm mt-4 max-w-3xl">
              {activeModelDescription}
            </p>
          ) : null}
        </Overlay>
      ) : null}

      {fullDescription ? (
        <Overlay
          title="Description"
          onClose={() => setFullDescription(null)}
        >
          <p className="ui-copy max-w-3xl whitespace-pre-wrap">
            {fullDescription}
          </p>
        </Overlay>
      ) : null}
    </Page>
  );
}

function Overlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close overlay"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[rgba(0,0,0,0.66)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ui-card relative w-full max-w-5xl p-4 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[rgb(var(--line))] pb-3">
          <h2 className="ui-h3">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
