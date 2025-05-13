import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { clusterApiUrl, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect, ChangeEvent } from "react";
import { useFetcher } from "@remix-run/react";
import Header from "~/components/header";
import type { ActionFunctionArgs } from "@remix-run/node";
import * as Tabs from '@radix-ui/react-tabs';
import { Buffer } from "buffer";

interface ActionData {
    imageUrl?: string;
}

/**
 * Returns the PublicKey of the treasury address.
 * Works both in the browser (`import.meta.env`) and on the server (`process.env`).
 * Throws a clear error if the env variable is missing.
 */
function getTreasury(): PublicKey {
    const addr =
        (typeof window !== "undefined"
            ? (import.meta as any).env?.VITE_TREASURY_ADDRESS
            : process.env.VITE_TREASURY_ADDRESS) as string | undefined;

    if (!addr) {
        throw new Error(
            "VITE_TREASURY_ADDRESS env variable is missing. " +
            "Add it to your .env or .env.local file."
        );
    }
    return new PublicKey(addr);
}

/** Price per mint in lamports (e.g. 0.01 SOL) */
const PRICE_LAMPORTS = 0.03 * LAMPORTS_PER_SOL;

export default function GenerateAvatar() {

    // Generator state
    const [prompt, setPrompt] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string>("");

    // Upload state
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>("");

    // Solana wallet and Metaplex setup
    const { publicKey, wallet, sendTransaction } = useWallet();
    const { connection } = useConnection();

    // Track which tab is active and auto-switch on generation
    const [tabValue, setTabValue] = useState<'upload' | 'generate'>('upload');
    useEffect(() => {
        if (previewUrl) {
            setTabValue('generate');
        }
    }, [previewUrl]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setUploadedPreviewUrl(URL.createObjectURL(file));
            setPreviewUrl("");
        }
    };

    // Fetcher for generating images without full page reload
    const fetcher = useFetcher<ActionData>();
    useEffect(() => {
        if (fetcher.data?.imageUrl) {
            setPreviewUrl(fetcher.data.imageUrl);
        }
    }, [fetcher.data]);

    const [minting, setMinting] = useState(false);

    const handleMint = async () => {
        if (!publicKey || !sendTransaction || (!previewUrl && !uploadedPreviewUrl)) return;

        try {
            setMinting(true);

            // 1) Build transfer → admin
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: getTreasury(),
                    lamports: PRICE_LAMPORTS,
                })
            );

            // 2) Send & confirm
            const signature = await sendTransaction(transaction, connection);
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            await connection.confirmTransaction(
                { signature, blockhash, lastValidBlockHeight },
                "confirmed"
            );

            // 3) Notify backend to mint NFT on behalf of the payer
            const body: Record<string, string> = {
                owner: publicKey.toBase58(),
                paymentSig: signature,
            };
            if (previewUrl) body.metadataUri = previewUrl;
            if (uploadedPreviewUrl) body.metadataUri = uploadedPreviewUrl;

            const mintRes = await fetch("/mint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!mintRes.ok) throw new Error(`Backend mint failed: ${await mintRes.text()}`);

            alert("Mint successful! Tx: " + signature);
        } catch (err) {
            console.error(err);
            alert("Mint failed: " + (err as Error).message);
        } finally {
            setMinting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header with nav + wallet */}
            <Header />

            {/* Main panel */}
            <div className="flex-1 px-8 py-4 bg-white dark:bg-gray-900">
                <Tabs.Root
                    value={tabValue}
                    onValueChange={(value) => {
                        setTabValue(value as 'upload' | 'generate');
                        setPreviewUrl('');
                        setUploadedPreviewUrl('');
                    }}
                    className="flex flex-col items-center space-y-8"
                >
                    <div className="flex items-center justify-center w-full md:w-3/4 mx-auto mb-4">
                        {previewUrl || uploadedPreviewUrl ? (
                            <img
                                src={previewUrl || uploadedPreviewUrl}
                                alt="Avatar preview"
                                className="w-2/3 max-w-sm aspect-square object-contain rounded-lg shadow-lg"
                            />
                        ) : (
                            <div className="w-2/3 max-w-sm aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                                <span className="text-gray-500 dark:text-gray-400">
                                    Preview
                                </span>
                            </div>
                        )}
                    </div>
                    <Tabs.List className="flex space-x-4 mb-4">
                        <Tabs.Trigger
                            value="upload"
                            className="px-4 py-2 rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 transition-colors"
                        >
                            Upload
                        </Tabs.Trigger>
                        <Tabs.Trigger
                            value="generate"
                            className="px-4 py-2 rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 transition-colors"
                        >
                            Generate
                        </Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value="generate" className="w-full flex flex-col space-y-8 items-center">
                        <fetcher.Form method="post" className="w-full flex flex-col items-center space-y-4">
                            <textarea
                                name="prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the avatar you want…"
                                rows={4}
                                className="w-2/3 max-w-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                                type="submit"
                                className="w-1/4 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-colors duration-200"
                            >
                                Generate
                            </button>
                            {!publicKey && (
                                <p className="text-sm text-red-500">
                                    Connect your wallet to generate.
                                </p>
                            )}
                        </fetcher.Form>
                        {(previewUrl || uploadedPreviewUrl) && publicKey && (
                            <button
                                onClick={handleMint}
                                disabled={minting}
                                className={`w-1/4 px-4 py-2 ${minting ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"} text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-4 focus:ring-blue-300 transition-colors duration-200`}
                            >
                                {minting ? "Minting..." : "Mint"}
                            </button>
                        )}
                    </Tabs.Content>

                    <Tabs.Content value="upload" className="w-full flex flex-col space-y-4 items-center">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="w-2/3 max-w-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4"
                        />
                    </Tabs.Content>
                </Tabs.Root>
            </div>
        </div>
    );
}

// Polyfill Buffer for browser environments
if (typeof window !== "undefined" && !window.Buffer) {
    // @ts-ignore
    window.Buffer = Buffer;
}

export async function action({ request }: ActionFunctionArgs) {
    const contentType = request.headers.get("content-type") || "";

    // ───────────────────────────────────────────────────────────
    // 1) JSON branch → called from handleMint (minting request)
    // ───────────────────────────────────────────────────────────
    if (contentType.includes("application/json")) {
        const { owner, metadataUri, paymentSig } = await request.json();

        if (!owner || !metadataUri || !paymentSig) {
            return new Response("Missing owner, metadataUri or paymentSig", { status: 400 });
        }

        // TODO: verify paymentSig corresponds to a transfer of PRICE_LAMPORTS to TREASURY
        // TODO: build and send Metaplex Core mint, setting 'owner' as the update & ownership authority

        console.log("✅ Payment verified:", paymentSig, "→ minting NFT for", owner);

        return Response.json({ status: "queued" });
    }

    // ───────────────────────────────────────────────────────────
    // 2) formData branch → called from the "Generate" textarea
    // ───────────────────────────────────────────────────────────
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await request.formData();
        const prompt = formData.get("prompt");
        console.log("Received prompt:", prompt);

        // TODO: replace with real image generation logic
        const generatedImageUrl = "https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF";

        return Response.json({ imageUrl: generatedImageUrl });
    }

    // Unsupported content type
    return new Response("Unsupported Content‑Type", { status: 415 });
}