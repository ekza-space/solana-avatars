import path from "node:path";
import { fileURLToPath } from "node:url";

import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { vercelPreset } from "@vercel/remix/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo sibling; avoids broken `file:` installs on Vercel Turbo (subpath exports). */
const sdkSrc = path.resolve(__dirname, "../sdk/src");
/** App hoisted deps — files under ../sdk resolve node_modules from sdk/ first (empty on CI). */
const nm = path.resolve(__dirname, "node_modules");

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}


export default defineConfig({
  server: {
    port: Number(process.env.PORT || process.env.VITE_PORT || 7102),
    strictPort: true,
  },
  resolve: {
    // The sibling workspace has React 19 while this app renders with React 18.
    // Linked SDK/library imports must use the app's one React/R3F/Three identity.
    // Deduping the React package also covers its JSX runtime subpaths.
    dedupe: ["react", "react-dom", "@react-three/fiber", "three"],
    alias: {
      "avatars-sdk/profile": path.join(sdkSrc, "profile.ts"),
      "avatars-sdk/minter": path.join(sdkSrc, "minter.ts"),
      "@coral-xyz/anchor": path.join(nm, "@coral-xyz/anchor"),
      "@solana/web3.js": path.join(nm, "@solana/web3.js"),
      "@solana/spl-token": path.join(nm, "@solana/spl-token"),
      "@metaplex-foundation/mpl-token-metadata": path.join(
        nm,
        "@metaplex-foundation/mpl-token-metadata"
      ),
    },
  },
  optimizeDeps: {
    // Prepare the lazy preview and aliased SDK dependencies before the first
    // Check VRM click. Discovering these later can regenerate React's browser
    // module URLs while an older page is still mounted.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@react-three/fiber",
      "@react-three/drei",
      "@ekza/avatar-renderer/model",
      "three",
      "@coral-xyz/anchor",
      "@solana/web3.js",
      "@solana/spl-token",
    ],
  },
  // server.proxy can be added here if local IPFS gateway proxying is needed.
  plugins: [
    remix({
      presets: [vercelPreset()],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths(),
  ],
});
