import type { LoaderFunctionArgs } from "@remix-run/node";

const DEFAULT_IPFS_GATEWAY = "http://127.0.0.1:8080/ipfs/";

function gatewayBase(): string {
  const configured =
    process.env.IPFS_GATEWAY_LOCALNET ||
    process.env.VITE_IPFS_GATEWAY_LOCALNET ||
    process.env.IPFS_GATEWAY ||
    process.env.VITE_IPFS_GATEWAY ||
    DEFAULT_IPFS_GATEWAY;
  return configured.endsWith("/") ? configured : `${configured}/`;
}

function normalizeIpfsPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^\/+/, "")
    .replace(/^ipfs:\/\//, "")
    .replace(/^ipfs\//, "");
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const rawPath = params["*"] || "";
  const ipfsPath = normalizeIpfsPath(rawPath);

  if (!ipfsPath) {
    return new Response("Missing IPFS path", { status: 400 });
  }

  const upstreamUrl = `${gatewayBase()}${ipfsPath}`;
  const upstream = await fetch(upstreamUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: {
      accept: request.headers.get("accept") || "*/*",
    },
  });

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");
  const cacheControl = upstream.headers.get("cache-control");

  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Cache-Control", cacheControl || "public, max-age=60");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
