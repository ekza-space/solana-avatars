import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { useState, useEffect, ChangeEvent } from "react";
import { useFetcher } from "@remix-run/react";
import Header from "~/components/header";
import type { ActionFunctionArgs } from "@remix-run/node";
import * as Tabs from '@radix-ui/react-tabs';

interface ActionData {
    imageUrl?: string;
}

export default function GenerateAvatar() {

    // Generator state
    const [prompt, setPrompt] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string>("");

    // Upload state
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>("");

    // Solana wallet and Metaplex setup
    const { publicKey, wallet } = useWallet();
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
                                onClick={() => {
                                    console.log("Mock mint");
                                    alert("Minted mock NFT!");
                                }}
                                className="w-1/4 px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-colors duration-200"
                            >
                                Mint
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

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const prompt = formData.get("prompt");
    // TODO: add API call
    console.log("Received prompt:", prompt);
    // TODO: replace with real generation logic
    const generatedImageUrl = "https://ipfs.io/ipfs/QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF";
    return Response.json({ imageUrl: generatedImageUrl });
}