import * as Tabs from "@radix-ui/react-tabs";
import { Link, useFetcher } from "@remix-run/react";
import {
  useAnchorWallet,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

import SceneWithModel from "~/components/3d/SceneWithModel";
import {
  Button,
  Field,
  Input,
  Meta,
  Notice,
  Page,
  PageHeader,
  Status,
  Textarea,
} from "~/components/ui";
import { NftMetadata } from "~/types/nft";
import { useSolanaNetwork } from "~/lib/network";
import { useMinterConnection } from "~/lib/minter-connection";
import { MinterConnection, MinterPendingError, MinterRejectedError } from "~/lib/minter-transport";
import { creatorUploadSession, uploadCreatorContent } from "~/lib/creator-upload";
import type { PassportSession } from "~/lib/passport-client";

import { checkPublicationConfirmation, clearPendingPublication, publicationAddressFromTransaction, publicationSignatureBytes, publicationTerms, readPendingPublication, rememberPendingPublication, requireCurrentPreview, requirePublicationStorage, signPublicationTransaction, type PendingPublicationReceipt } from "~/lib/avatar-publication";

interface ActionData {
  imageUrl?: string;
}

interface PendingPublication extends PendingPublicationReceipt {
  connection: Connection;
  explorerUrl: string;
}

export default function GenerateAvatar() {
  const [prompt, setPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState("");
  const [capturedPreview, setCapturedPreview] = useState<{ file: File; blob: Blob } | null>(null);
  const currentFile = useRef(uploadedFile);
  currentFile.current = uploadedFile;
  const [publishedCollection, setPublishedCollection] = useState<{ address: string; network: string } | null>(null);
  const [pendingPublication, setPendingPublication] = useState<PendingPublication | null>(null);
  const pendingPublicationRef = useRef<PendingPublication | null>(null);
  const [checkingPublication, setCheckingPublication] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [recoveryReady, setRecoveryReady] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [nftName, setNftName] = useState("");
  const [nftSymbol, setNftSymbol] = useState("");
  const [nftDescription, setNftDescription] = useState("");
  const [nftMaxSupply, setNftMaxSupply] = useState("");
  const [nftMintFee, setNftMintFee] = useState("");
  const [minting, setMinting] = useState(false);
  const [tabValue, setTabValue] = useState<"upload" | "generate">("upload");
  const [notice, setNotice] = useState<
    { tone: "success" | "error"; text: string; href?: string } | null
  >(null);

  const { publicKey, signMessage } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useMinterConnection();
  const { buildExplorerTxUrl, clusterLabel, cluster, endpoint } = useSolanaNetwork();
  const walletAddress = publicKey?.toBase58() || "";
  const signingContext = `${publicKey?.toBase58() || ""}:${connection.rpcEndpoint}`;
  const context = useRef({ key: signingContext, revision: 0 });
  if (context.current.key !== signingContext) context.current = { key: signingContext, revision: context.current.revision + 1 };
  const fetcher = useFetcher<ActionData>();

  useEffect(() => {
    if (minting || !walletAddress) { setRecoveryReady(""); return; }
    try {
      const storage = window.sessionStorage;
      requirePublicationStorage(storage, walletAddress, cluster);
      const receipt = readPendingPublication(storage, walletAddress, cluster);
      if (receipt && cluster !== "devnet" && connection.rpcEndpoint !== endpoint) {
        throw new Error("Switch to the original network connection before checking this publication.");
      }
      const pending = receipt ? { ...receipt,
        connection: cluster === "devnet" ? new MinterConnection(window.location.origin) : connection,
        explorerUrl: buildExplorerTxUrl(receipt.signature),
      } : null;
      pendingPublicationRef.current = pending;
      setPendingPublication(pending);
      if (pending) {
        setPublishedCollection(null);
        setPendingMessage("A publication from this wallet is awaiting confirmation. Check the original transaction before publishing again.");
      }
      setRecoveryError("");
      setRecoveryReady(signingContext);
    } catch (error) {
      setRecoveryReady("");
      setRecoveryError(`Publication recovery is unavailable. Publishing is disabled until browser session storage and the original network are available. ${error instanceof Error ? error.message : ""}`);
    }
  // Explorer URLs are derived from these captured network values; their helper
  // function is recreated by the provider on every render.
  }, [walletAddress, cluster, connection, endpoint, signingContext, minting]);

  useEffect(() => () => { context.current.revision++; }, []);
  useEffect(() => () => { if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl); }, [uploadedPreviewUrl]);

  const capturePreview = useCallback((blob: Blob) => {
    if (uploadedFile && currentFile.current === uploadedFile) setCapturedPreview({ file: uploadedFile, blob });
  }, [uploadedFile]);
  const previewError = useCallback((message: string) => {
    if (currentFile.current !== uploadedFile) return;
    setCapturedPreview(null);
    setNotice({ tone: "error", text: message });
  }, [uploadedFile]);

  useEffect(() => {
    if (previewUrl) {
      setTabValue("generate");
    }
  }, [previewUrl]);

  useEffect(() => {
    if (fetcher.data?.imageUrl) {
      setPreviewUrl(fetcher.data.imageUrl);
    }
  }, [fetcher.data]);

  const hasPreview = Boolean(previewUrl || uploadedPreviewUrl);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setCapturedPreview(null); setPublishedCollection(null); setNotice(null);
    if (!/\.(glb|vrm)$/i.test(file.name) || file.size <= 0 || file.size > 20 * 1024 * 1024) {
      currentFile.current = null;
      setUploadedFile(null); setUploadedPreviewUrl("");
      setNotice({ tone: "error", text: "Choose a nonempty GLB or VRM model up to 20 MB." });
      return;
    }
    currentFile.current = file;
    setUploadedFile(file);
    setUploadedPreviewUrl(URL.createObjectURL(file));
    setPreviewUrl("");
  };

  async function uploadFile(file: File, session: PassportSession, isCurrent: () => boolean): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const { files } = await uploadCreatorContent<{ files: { uri: string }[] }>(formData, session, isCurrent);
    if (!files?.[0]?.uri) throw new Error("Avatar storage did not return the uploaded file.");
    return files[0].uri;
  }

  const handleDeploy = async () => {
    if (!publicKey || !anchorWallet || minting || pendingPublicationRef.current || recoveryReady !== signingContext || recoveryError) return;
    const revision = context.current.revision;
    let expectedAddress: string | null = null;
    const assertContext = () => {
      if (context.current.revision !== revision) throw new Error("Wallet or network changed. Review the collection and publish again.");
    };

    setNotice(null);
    setMinting(true);

    try {
      requirePublicationStorage(window.sessionStorage, walletAddress, cluster);
      if (readPendingPublication(window.sessionStorage, walletAddress, cluster)) throw new Error("Check the earlier publication before publishing again.");
      const terms = publicationTerms({ name: nftName, symbol: nftSymbol, supply: nftMaxSupply, price: nftMintFee });
      const blobPreview = requireCurrentPreview(uploadedFile, capturedPreview);
      const sourceFile = uploadedFile!;
      const isCurrent = () => context.current.revision === revision;
      const uploadSession = await creatorUploadSession({ wallet: walletAddress, network: cluster, isCurrent,
        signMessage: signMessage ? async (message) => bs58.encode(await signMessage(message)) : undefined });
      assertContext();

      const filePreview = new File([blobPreview], "preview.png", {
        type: blobPreview.type,
      });
      const previewIpfsLink = await uploadFile(filePreview, uploadSession, isCurrent);
      assertContext();
      const previewIpfsUri = previewIpfsLink;

      const modelIpfsUri = await uploadFile(sourceFile, uploadSession, isCurrent);
      assertContext();

      const metadata: NftMetadata = {
        name: terms.name,
        symbol: terms.symbol,
        description:
          nftDescription || "A unique 3D avatar NFT generated by Ekza Space",
        image: previewIpfsUri,
        animation_url: modelIpfsUri,
        attributes: [],
        properties: {
          files: [
            { uri: previewIpfsUri, type: "image/png" },
            { uri: modelIpfsUri, type: /\.vrm$/i.test(sourceFile.name) ? "model/vrm" : "model/gltf-binary" },
          ],
          category: "vrmodel",
          creators: [{ address: publicKey.toBase58(), share: 100 }],
        },
      };

      const uploadJson = await uploadCreatorContent<{ ipfsHash: string }>(metadata, uploadSession, isCurrent);
      const metadataUri = uploadJson.ipfsHash;
      if (typeof metadataUri !== "string" || !metadataUri) throw new Error("The metadata upload did not return a content ID.");
      assertContext();

      try {
        const [anchor, { default: minterClient }] = await Promise.all([
          import("@coral-xyz/anchor"),
          import("avatars-sdk/minter"),
        ]);
        const initializeInstruction = minterClient.idlJson.instructions.find((instruction) => instruction.name === "initialize_avatar");
        const captureAddress = (transaction: Transaction | VersionedTransaction) => {
          const address = publicationAddressFromTransaction(transaction, minterClient.idlJson.address, initializeInstruction?.discriminator ?? []);
          if (expectedAddress && expectedAddress !== address) throw new Error("The publication transaction changed its collection address.");
          expectedAddress = address;
        };
        const rememberSigned = (transaction: Transaction | VersionedTransaction) => {
          assertContext();
          captureAddress(transaction);
          const receipt = { address: expectedAddress!, signature: bs58.encode(publicationSignatureBytes(transaction)), wallet: walletAddress, network: cluster };
          rememberPendingPublication(window.sessionStorage, receipt);
          const pending = { ...receipt, connection, explorerUrl: buildExplorerTxUrl(receipt.signature) };
          pendingPublicationRef.current = pending;
          setPendingPublication(pending);
          setPendingMessage("The signed publication is being submitted and confirmed. Its public receipt is saved for recovery after a refresh.");
        };
        const provider = new anchor.AnchorProvider(
          connection,
          {
            publicKey: anchorWallet.publicKey,
            signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
              const signed = await signPublicationTransaction(async () => {
                captureAddress(transaction);
                return anchorWallet.signTransaction(transaction);
              }, assertContext);
              rememberSigned(signed);
              return signed;
            },
            signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
              const signed = await signPublicationTransaction(async () => {
                transactions.forEach(captureAddress);
                return anchorWallet.signAllTransactions(transactions);
              }, assertContext);
              signed.forEach(rememberSigned);
              return signed;
            },
          },
          anchor.AnchorProvider.defaultOptions()
        );
        const program = new anchor.Program(
          minterClient.idlJson as any,
          provider
        );
        // @ts-ignore
        const minter = minterClient.create(provider, program);

        const maxSupplyBn = new anchor.BN(terms.maxSupply, 10);
        const mintFeeLamports = new anchor.BN(terms.priceLamports, 10);
        assertContext();

        const { avatarDataPda, signature: initSig } =
          await minter.initializeAvatar({
            ipfsHash: metadataUri,
            maxSupply: maxSupplyBn,
            mintingFeePerMint: mintFeeLamports,
          });

        const saved = pendingPublicationRef.current;
        if (saved) clearPendingPublication(window.sessionStorage, saved);
        pendingPublicationRef.current = null;
        setPendingPublication(null);
        setPublishedCollection({ address: avatarDataPda.toBase58(), network: cluster });
        setNotice({
          tone: "success",
          text: `Collection deployed. Avatar PDA ${avatarDataPda.toBase58()}`,
          href: buildExplorerTxUrl(initSig),
        });
      } catch (sdkErr: any) {
        if (sdkErr instanceof MinterRejectedError) {
          const rejected = pendingPublicationRef.current;
          try {
            if (rejected) clearPendingPublication(window.sessionStorage, rejected);
          } catch {
            setPendingMessage("The transaction was rejected before submission, but its recovery receipt could not be cleared. Restore browser session storage before trying again.");
            return;
          }
          pendingPublicationRef.current = null;
          setPendingPublication(null);
          setNotice({ tone: "error", text: `The transaction was rejected before submission. Review the collection and try again. ${sdkErr.message}` });
          return;
        }
        if (sdkErr instanceof MinterPendingError) {
          setPublishedCollection(null);
          setNotice(null);
          setPendingMessage("The transaction may already have published your collection. Check its confirmation before publishing again.");
          return;
        }
        // Once signed bytes have left the guarded wallet callback, an SDK
        // error alone cannot prove that the transaction never reached RPC.
        if (pendingPublicationRef.current) {
          setNotice(null);
          setPendingMessage("The publication outcome is uncertain. Check the saved transaction before publishing again.");
          return;
        }
        setNotice({
          tone: "error",
          text: `Deploy failed: ${sdkErr.message}`,
        });
        console.error("SDK mint failed:", sdkErr);
        setMinting(false);
        return;
      }
    } catch (err: any) {
      console.error("Client: Error in handleDeploy:", err);
      setNotice({
        tone: "error",
        text: `Deploy failed before signing: ${err.message}`,
      });
    } finally {
      setMinting(false);
    }
  };

  const checkPendingPublication = async () => {
    const pending = pendingPublicationRef.current;
    if (!pending || checkingPublication || minting) return;
    if (pending.network !== "devnet" && (cluster !== pending.network
      || connection.rpcEndpoint !== pending.connection.rpcEndpoint || connection.rpcEndpoint !== endpoint)) {
      setPendingMessage("Switch back to the original network connection before checking this publication.");
      return;
    }
    setCheckingPublication(true);
    try {
      const result = await checkPublicationConfirmation(pending.connection, pending.signature);
      if (pendingPublicationRef.current !== pending) return;
      if (result === "pending") {
        setPendingMessage("Confirmation is still unavailable. Keep this page open and check again; publishing again stays disabled.");
        return;
      }
      clearPendingPublication(window.sessionStorage, pending);
      pendingPublicationRef.current = null;
      setPendingPublication(null);
      if (result === "confirmed") {
        setPublishedCollection({ address: pending.address, network: pending.network });
        setNotice({ tone: "success", text: `Collection deployed. Avatar PDA ${pending.address}`, href: pending.explorerUrl });
      } else {
        setNotice({ tone: "error", text: "The original transaction failed on-chain. No collection was published by that transaction. You can review the inputs and try again.", href: pending.explorerUrl });
      }
    } catch {
      setPendingMessage("The outcome was checked, but browser recovery storage could not be updated. Keep this transaction saved and restore session storage before continuing.");
    } finally {
      setCheckingPublication(false);
    }
  };

  const previewReady = capturedPreview?.file === uploadedFile && Boolean(capturedPreview?.blob.size);
  const previewNode = uploadedFile && uploadedPreviewUrl ? (
    <div className="h-[440px] border border-[rgb(var(--line))] bg-[rgb(var(--surface-2))]">
      <SceneWithModel
        key={uploadedPreviewUrl}
        file={uploadedPreviewUrl}
        screenshot={true}
        onScreenshot={capturePreview}
        onPreviewError={previewError}
      />
    </div>
  ) : hasPreview ? (
    <div className="flex h-[440px] items-center justify-center border border-[rgb(var(--line))] bg-[rgb(var(--surface-2))] p-4">
      <img
        src={previewUrl || uploadedPreviewUrl}
        alt="Avatar preview"
        className="max-h-full w-auto object-contain"
      />
    </div>
  ) : (
    <div className="flex h-[440px] flex-col items-center justify-center gap-3 border border-dashed border-[rgba(var(--line-strong),0.28)] p-6 text-center">
      <span className="ui-label">Nothing to show yet</span>
      <p className="ui-copy-sm max-w-xs">
        Pick a .glb or .vrm file in step 01. The preview image sent to IPFS is
        captured from this scene.
      </p>
    </div>
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Deploy"
        title={
          <>
            Publish a 3D
            <br />
            avatar collection.
          </>
        }
        lede="Upload a model, describe it, set supply and price. The metadata goes to IPFS and the collection is initialized on-chain."
        meta={
          <>
            <Meta label="Network" value={clusterLabel} />
            <Meta label="Fee unit" value="SOL" />
            <Status tone={publicKey ? "ok" : "error"}>
              {publicKey ? "Wallet connected" : "Wallet required"}
            </Status>
          </>
        }
      />

      {notice ? (
        <Notice tone={notice.tone} className="mt-8">
          <div className="space-y-2">
            <p className="break-all">{notice.text}</p>
            {notice.href ? (
              <a
                href={notice.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-link inline-block text-sm"
              >
                Open in Solana Explorer ↗
              </a>
            ) : null}
          </div>
        </Notice>
      ) : null}
      {recoveryError && <Notice tone="error" className="mt-5">{recoveryError}</Notice>}
      {cluster !== "devnet" && <Notice tone="info" className="mt-5">Avatar Store uploads currently use Solana Devnet. You can prepare a local preview here, then <Link className="ui-link" to="/deployer?network=devnet">open Devnet publication</Link> to upload and publish.</Notice>}
      {pendingPublication && <Notice tone="info" className="mt-5">
        <p>{pendingMessage}</p>
        <p className="mt-2 break-all text-sm">Original network: {pendingPublication.network}. Transaction: {pendingPublication.signature}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button type="button" variant="secondary" disabled={checkingPublication || minting} onClick={checkPendingPublication}>{checkingPublication ? "Checking confirmation…" : "Check confirmation"}</Button>
          <a className="ui-link" href={pendingPublication.explorerUrl} target="_blank" rel="noopener noreferrer">Inspect original transaction</a>
        </div>
      </Notice>}
      {publishedCollection && <Notice tone="success" className="mt-5">
        <p>Your collection is published. Game compatibility is added after each model version is prepared and reviewed.</p>
        <div className="mt-3 flex flex-wrap gap-4"><Link className="ui-link" to={`/minter?avatarData=${encodeURIComponent(publishedCollection.address)}&network=${publishedCollection.network}`}>View collection & buy</Link><a className="ui-link" href="#game-support">Prepare game support</a></div>
      </Notice>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex items-end justify-between border-b border-[rgb(var(--line))] pb-3">
            <h2 className="ui-h3">Preview</h2>
            <span className="ui-label">
              {previewReady ? "Preview ready" : hasPreview ? "Preparing preview" : "Waiting for a model"}
            </span>
          </div>
          {previewNode}
        </div>

        <fieldset disabled={minting || Boolean(pendingPublication)} className="min-w-0 space-y-8">
          <section>
            <StepHeading step="01" title="Model" />
            <Tabs.Root
              value={tabValue}
              onValueChange={(value) => {
                setTabValue(value as "upload" | "generate");
                setPreviewUrl("");
                setUploadedPreviewUrl("");
                currentFile.current = null; setUploadedFile(null); setCapturedPreview(null);
              }}
              className="space-y-5"
            >
              <Tabs.List className="flex gap-6 border-b border-[rgb(var(--line))]">
                <Tabs.Trigger value="upload" className="ui-navlink" >
                  Upload a file
                </Tabs.Trigger>
                <Tabs.Trigger value="generate" className="ui-navlink">
                  Generate (soon)
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="upload" className="space-y-4">
                <Field
                  label="3D asset"
                  hint="Accepted formats: .glb and .vrm."
                >
                  <Input
                    type="file"
                    accept=".vrm,.glb,model/gltf-binary"
                    onChange={handleFileChange}
                    className="cursor-pointer py-2.5"
                  />
                </Field>
                <p className="ui-copy-sm">
                  Nothing to test with?{" "}
                  <a
                    href="https://drive.google.com/drive/folders/11oQ8pwVMV9inSVV9cGceI8xTusDxhPC3?usp=drive_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-link"
                  >
                    Download sample models
                  </a>
                  .
                </p>
              </Tabs.Content>

              <Tabs.Content value="generate" className="space-y-4">
                <fetcher.Form method="post" className="space-y-4">
                  <Field
                    label="Prompt"
                    hint="Model generation is not wired up yet — the field is here to shape the flow."
                  >
                    <Textarea
                      name="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the avatar you want..."
                      rows={4}
                      disabled
                    />
                  </Field>
                  <Button variant="secondary" disabled className="w-full">
                    Generate preview · coming soon
                  </Button>
                </fetcher.Form>
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <section>
            <StepHeading step="02" title="Collection details" />
            <MetadataFields
              nftName={nftName}
              setNftName={setNftName}
              nftSymbol={nftSymbol}
              setNftSymbol={setNftSymbol}
              nftDescription={nftDescription}
              setNftDescription={setNftDescription}
              nftMaxSupply={nftMaxSupply}
              setNftMaxSupply={setNftMaxSupply}
              nftMintFee={nftMintFee}
              setNftMintFee={setNftMintFee}
            />
          </section>

          <section>
            <StepHeading step="03" title="Deploy" />
            <Button
              onClick={handleDeploy}
              disabled={minting || Boolean(pendingPublication) || recoveryReady !== signingContext || Boolean(recoveryError) || !previewReady || !publicKey || cluster !== "devnet"}
              className="w-full"
            >
              {minting ? "Deploying…" : "Deploy collection"}
            </Button>
            {!publicKey ? (
              <p className="mt-3 text-sm font-medium text-[rgb(var(--danger))]">
                Connect a wallet to deploy.
              </p>
            ) : !previewReady ? (
              <p className="ui-copy-sm mt-3">
                Upload a model and wait for its preview. Its image is captured
                from this scene and pinned together with the metadata.
              </p>
            ) : null}
          </section>
          <section id="game-support">
            <StepHeading step="04" title="Add game support" />
            <p className="ui-copy-sm">Keep one avatar collection. Prepare a version for each project and submit it for a compatibility review. Once approved, existing buyers can use it there without buying again.</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li><strong>Ekza Space:</strong> a humanoid VRM 0 or VRM 1 model.</li>
              <li><strong>Ekza Mirror:</strong> a USDZ model with an ARKit body rig, checked on a supported iPhone.</li>
              <li><strong>Omoba:</strong> a humanoid GLB with the game's required rig and idle, walk, attack, cast and death animations.</li>
            </ul>
            <p className="ui-copy-sm mt-4">Provide the collection address, original model, prepared model and a recording of it working in the target project. The project reviews the exact model version before its support badge appears in the store.</p>
          </section>
        </fieldset>
      </div>
    </Page>
  );
}

function StepHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b border-[rgb(var(--line))] pb-3">
      <span className="bg-[rgb(var(--accent))] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums tracking-[0.12em] text-[rgb(var(--accent-ink))]">
        {step}
      </span>
      <h2 className="ui-h3">{title}</h2>
    </div>
  );
}

function MetadataFields(props: {
  nftName: string;
  setNftName: (value: string) => void;
  nftSymbol: string;
  setNftSymbol: (value: string) => void;
  nftDescription: string;
  setNftDescription: (value: string) => void;
  nftMaxSupply: string;
  setNftMaxSupply: (value: string) => void;
  nftMintFee: string;
  setNftMintFee: (value: string) => void;
}) {
  const {
    nftName,
    setNftName,
    nftSymbol,
    setNftSymbol,
    nftDescription,
    setNftDescription,
    nftMaxSupply,
    setNftMaxSupply,
    nftMintFee,
    setNftMintFee,
  } = props;

  const infinite = nftMaxSupply === "18446744073709551615";

  return (
    <div className="grid gap-5">
      <Field label="Name" hint="Up to 32 bytes — shown on the market card.">
        <Input
          type="text"
          placeholder="Neon Runners"
          value={nftName}
          onChange={(e) => setNftName(e.target.value)}
        />
      </Field>
      <Field label="Symbol" optional hint="Short ticker, up to 10 bytes.">
        <Input
          type="text"
          placeholder="AVA3D"
          value={nftSymbol}
          onChange={(e) => setNftSymbol(e.target.value)}
        />
      </Field>
      <Field label="Description" optional>
        <Textarea
          placeholder="What is this collection about?"
          rows={3}
          value={nftDescription}
          onChange={(e) => setNftDescription(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Max supply"
          hint="How many copies can ever be minted."
        >
          <Input
            type="text"
            inputMode="numeric"
            placeholder="64"
            value={infinite ? "∞" : nftMaxSupply}
            onChange={(e) => setNftMaxSupply(e.target.value)}
            disabled={infinite}
          />
        </Field>
        <Field label="Mint fee" hint="In SOL, per mint. 0 makes it free.">
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="0.001"
            value={nftMintFee}
            onChange={(e) => setNftMintFee(e.target.value)}
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-3 border border-[rgb(var(--line))] px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[rgb(var(--accent-line))]"
          checked={infinite}
          onChange={(e) =>
            setNftMaxSupply(e.target.checked ? "18446744073709551615" : "")
          }
        />
        <span className="text-sm text-[rgb(var(--text-strong))]">
          Unlimited supply
        </span>
      </label>
    </div>
  );
}
