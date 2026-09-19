// Avatar Studio moved to the ekza-registry repository (web/). This app only
// forwards old links. The destination is operator configuration; request
// parameters can choose a Studio view but never the destination origin.
const VIEWS = ["catalog", "library", "uploads", "review", "new", "account"];

export function studioLocation(search: string): string | null {
  const configured = process.env.EKZA_STUDIO_URL;
  if (!configured) return null;
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1" && base.hostname !== "localhost")
    return null;
  const target = new URL("/studio", base.origin);
  const view = new URLSearchParams(search).get("view");
  if (view && VIEWS.includes(view)) target.searchParams.set("view", view);
  return target.href;
}
