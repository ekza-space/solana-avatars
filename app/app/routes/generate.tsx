import { useState, useEffect } from "react";
import { useActionData, Form } from "@remix-run/react";
import Header from "~/components/header";
import type { ActionFunctionArgs } from "@remix-run/node";

interface ActionData {
    imageUrl?: string;
}

export default function GenerateAvatar() {
    // Wallet state
    const [connected, setConnected] = useState(false);
    const [address, setAddress] = useState("");

    // Generator state
    const [prompt, setPrompt] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string>("");

    const actionData = useActionData<ActionData>();
    useEffect(() => {
        if (actionData?.imageUrl) {
            setPreviewUrl(actionData.imageUrl);
        }
    }, [actionData]);

    const handleConnect = () => {
        const mock = "0xAbCd...1234";
        setAddress(mock);
        setConnected(true);
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header with nav + wallet */}
            <Header connected={connected} address={address} onConnect={handleConnect} />

            {/* Main panel */}
            <div className="flex-1 px-8 py-4 bg-white dark:bg-gray-900">
                <div className="flex flex-col space-y-8 items-center">
                    {/* Preview */}
                    <div className="flex items-center justify-center w-full md:w-3/4 mx-auto">
                        {previewUrl ? (
                            <img
                                src={previewUrl}
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

                    <Form method="post" className="w-full flex flex-col items-center space-y-4">
                        <textarea
                            name="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe the avatar you want…"
                            rows={6}
                            className="w-2/3 max-w-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                            type="submit"
                            disabled={!connected}
                            className="w-1/4 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-colors duration-200 disabled:opacity-50"
                        >
                            Generate
                        </button>
                        {!connected && (
                            <p className="text-sm text-red-500">
                                Connect your wallet to generate.
                            </p>
                        )}
                    </Form>
                </div>
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