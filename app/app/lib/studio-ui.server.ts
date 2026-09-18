// Studio is retained for development, but is not part of the Solana alpha.
// Only the operator can enable its pages; URL parameters cannot enable them.
export function studioUiEnabled() {
  return process.env.EKZA_STUDIO_UI_ENABLED === "1";
}
