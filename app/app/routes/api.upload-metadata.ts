import type { ActionFunctionArgs } from "@remix-run/node";
import { create as createIpfsClient } from "ipfs-http-client";

export async function action({ request }: ActionFunctionArgs) {
  const contentType = request.headers.get("content-type") || "";
  const ipfs = createIpfsClient({ url: "http://127.0.0.1:5001" });

  // Handle file uploads via multipart/form-data
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const files: Array<{ field: string; ipfsHash: string; uri: string }> = [];
      for (const [field, value] of formData) {
        if (value instanceof File) {
          const data = value.stream ? value.stream() : value;
          const result = await ipfs.add(data);
          files.push({
            field,
            ipfsHash: result.path,
            uri: `https://ipfs.io/ipfs/${result.path}`,
          });
        }
      }
      return Response.json({ files });
    } catch (error: any) {
      console.error("Failed to upload files:", error);
      return new Response(
        JSON.stringify({ error: "File upload failed: " + error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Handle JSON payloads
  if (contentType.includes("application/json")) {
    try {
      const metadata = await request.json();
      const result = await ipfs.add(JSON.stringify(metadata));
      return Response.json({
        ipfsHash: result.path,
        uri: `https://ipfs.io/ipfs/${result.path}`,
      });
    } catch (error: any) {
      console.error("Failed to upload JSON metadata:", error);
      return new Response(
        JSON.stringify({ error: "Metadata upload failed: " + error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Unsupported content type
  return new Response("Unsupported Content-Type", { status: 415 });
}