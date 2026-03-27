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


// server: {
//   port: 3000,
//   host: true,
//   allowedHosts: ['avatar.ekza.io'],
// },

export default defineConfig({
  resolve: {
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
  ssr: {
    noExternal: [/^@metaplex-foundation\//],
  },
  // server: {
  //   proxy: {
  //     '/ipfs': {
  //       target: 'http://localhost:8080',
  //       changeOrigin: true,
  //     },
  //   },
  // },
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
