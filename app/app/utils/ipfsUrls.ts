import { getIpfsGatewayBase } from "~/utils/ipfsGateway";

function normalizeLocalPath(modelHash: string): string {
  const trimmed = modelHash.trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("_/uploads/") ||
    trimmed.startsWith("ipfs/") ||
    trimmed.startsWith("uploads/")
    ? trimmed
    : `_/uploads/${trimmed}`;
}

function joinGatewayPath(base: string, path: string): string {
  if (base.endsWith("/_/uploads/")) {
    return `${base}${path
      .replace(/^_\/uploads\//, "")
      .replace(/^uploads\//, "")}`;
  }
  return `${base}${path}`;
}

export function getIpfsUrl(modelHash: string): string {
  if (modelHash.startsWith("http://") || modelHash.startsWith("https://")) {
    return modelHash;
  }
  if (modelHash.startsWith("ipfs://")) {
    return joinGatewayPath(
      getIpfsGatewayBase(),
      modelHash.slice("ipfs://".length)
    );
  }
  if (modelHash.startsWith("local:")) {
    const localPath = normalizeLocalPath(modelHash.slice("local:".length));
    return joinGatewayPath(getIpfsGatewayBase(), localPath);
  }
  return joinGatewayPath(getIpfsGatewayBase(), modelHash);
}
