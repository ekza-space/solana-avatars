import type { ActionFunctionArgs } from "@remix-run/node";

const PINATA_FILE_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function getPinataJwt(): string {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) {
    throw new Error("PINATA_JWT env variable is missing.");
  }
  return jwt;
}

function getIpfsUrl(hash: string): string {
  return `${DEFAULT_IPFS_GATEWAY}${hash}`;
}

async function readPinataError(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return `Pinata request failed with status ${response.status}`;
  }

  try {
    const data = JSON.parse(text) as { error?: { reason?: string; details?: string } };
    return (
      data.error?.reason ||
      data.error?.details ||
      text ||
      `Pinata request failed with status ${response.status}`
    );
  } catch {
    return text;
  }
}

async function uploadFileToPinata(file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name || "upload.bin");

  const response = await fetch(PINATA_FILE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPinataJwt()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readPinataError(response));
  }

  const result = (await response.json()) as { IpfsHash: string };
  return {
    ipfsHash: result.IpfsHash,
    uri: getIpfsUrl(result.IpfsHash),
  };
}

async function uploadJsonToPinata(content: unknown) {
  const response = await fetch(PINATA_JSON_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPinataJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: content,
    }),
  });

  if (!response.ok) {
    throw new Error(await readPinataError(response));
  }

  const result = (await response.json()) as { IpfsHash: string };
  return {
    ipfsHash: result.IpfsHash,
    uri: getIpfsUrl(result.IpfsHash),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const files: Array<{ field: string; ipfsHash: string; uri: string }> = [];

      for (const [field, value] of formData) {
        if (!(value instanceof File)) continue;

        const result = await uploadFileToPinata(value);
        files.push({
          field,
          ipfsHash: result.ipfsHash,
          uri: result.uri,
        });
      }

      return Response.json({ files });
    } catch (error: any) {
      console.error("Failed to upload files to Pinata:", error);
      return new Response(
        JSON.stringify({ error: "File upload failed: " + error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  if (contentType.includes("application/json")) {
    try {
      const metadata = await request.json();
      const result = await uploadJsonToPinata(metadata);
      return Response.json(result);
    } catch (error: any) {
      console.error("Failed to upload JSON metadata to Pinata:", error);
      return new Response(
        JSON.stringify({ error: "Metadata upload failed: " + error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response("Unsupported Content-Type", { status: 415 });
}