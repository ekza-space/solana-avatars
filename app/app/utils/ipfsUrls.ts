import { getIpfsGatewayBase } from "~/utils/ipfsGateway";

export function getIpfsUrl(modelHash: string): string {
    if (modelHash.startsWith("http://") || modelHash.startsWith("https://")) {
        return modelHash;
    }
    if (modelHash.startsWith("ipfs://")) {
        return `${getIpfsGatewayBase()}${modelHash.slice("ipfs://".length)}`;
    }
    if (modelHash.startsWith("local:")) {
        const localPath = modelHash.slice("local:".length).replace(/^\/+/, "");
        return `${getIpfsGatewayBase()}${localPath}`;
    }
    return `${getIpfsGatewayBase()}${modelHash}`;
}
