import { getIpfsGatewayBase } from "~/utils/ipfsGateway";

export function getIpfsUrl(modelHash: string): string {
    return `${getIpfsGatewayBase()}${modelHash}`;
}
