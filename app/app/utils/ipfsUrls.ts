export function getIpfsUrl(modelHash: string): string {
    const isDev = import.meta.env.DEV; // Vite sets this flag
    const baseUrl = isDev
        ? "http://localhost:8080/ipfs/"
        : "https://ekza.io/ipfs/";

    return `${baseUrl}${modelHash}`;
}
