import { getIpfsGatewayBase } from "~/utils/ipfsGateway";

export function getIpfsUrl(modelHash: string): string {
    if (modelHash.startsWith("http://") || modelHash.startsWith("https://")) {
        return modelHash;
    }
    if (modelHash.startsWith("local:")) {
        return `http://127.0.0.1:8787/${modelHash.slice("local:".length)}`;
    }
    return `${getIpfsGatewayBase()}${modelHash}`;
}
