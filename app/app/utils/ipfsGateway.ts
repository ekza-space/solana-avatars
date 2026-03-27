/**
 * Base URL for resolving IPFS CIDs in the browser (must end with `/`).
 *
 * - If `VITE_IPFS_GATEWAY` is set at build time, it wins (local .env or Vercel env).
 * - Otherwise: dev server → local gateway; production build → ipfs.io.
 *
 * On Vercel, `.env` is not deployed unless you add variables in the dashboard;
 * without them, production must not fall back to localhost.
 */
export function getIpfsGatewayBase(): string {
    const fromEnv = import.meta.env.VITE_IPFS_GATEWAY?.trim();
    if (fromEnv) {
        return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
    }
    if (import.meta.env.DEV) {
        return "http://localhost:8080/ipfs/";
    }
    return "https://ipfs.io/ipfs/";
}
