import type { ActionFunctionArgs } from "@remix-run/node";

const PINATA_FILE_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_MULTIPART_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 4;

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

function rejectIfContentLengthTooLarge(request: Request, limit: number) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return;

  const contentLength = Number(rawLength);
  if (!Number.isFinite(contentLength) || contentLength > limit) {
    throw new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function assertUploadFileAllowed(file: File) {
  if (file.size <= 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Response(
      JSON.stringify({ error: "Uploaded file is too large" }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function readPinataError(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return `Pinata request failed with status ${response.status}`;
  }

  try {
    const data = JSON.parse(text) as {
      error?: { reason?: string; details?: string };
    };
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
      rejectIfContentLengthTooLarge(request, MAX_MULTIPART_BYTES);
      const formData = await request.formData();
      const files: Array<{ field: string; ipfsHash: string; uri: string }> = [];

      for (const [field, value] of formData) {
        if (!(value instanceof File)) continue;
        if (files.length >= MAX_FILES_PER_REQUEST) {
          throw new Response(JSON.stringify({ error: "Too many files" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }

        assertUploadFileAllowed(value);
        const result = await uploadFileToPinata(value);
        files.push({
          field,
          ipfsHash: result.ipfsHash,
          uri: result.uri,
        });
      }
      if (files.length === 0) {
        return Response.json({ error: "No files provided" }, { status: 400 });
      }

      return Response.json({ files });
    } catch (error: any) {
      if (error instanceof Response) return error;
      console.error("Failed to upload files to Pinata:", error);
      return new Response(JSON.stringify({ error: "File upload failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (contentType.includes("application/json")) {
    try {
      rejectIfContentLengthTooLarge(request, MAX_JSON_BYTES);
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).length > MAX_JSON_BYTES) {
        throw new Response(JSON.stringify({ error: "Payload too large" }), {
          status: 413,
          headers: { "Content-Type": "application/json" },
        });
      }

      const metadata = JSON.parse(rawBody);
      const result = await uploadJsonToPinata(metadata);
      return Response.json(result);
    } catch (error: any) {
      if (error instanceof Response) return error;
      console.error("Failed to upload JSON metadata to Pinata:", error);
      return new Response(JSON.stringify({ error: "Metadata upload failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Unsupported Content-Type", { status: 415 });
}
