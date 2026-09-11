import { passportRequest, PROJECT_NAMES, type CatalogAvatar } from "~/lib/passport-client";
import { Badge, Button } from "./ui";

export type MinterCatalogState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; items: CatalogAvatar[] };

/** The public catalog approves projects for a canonical Devnet template. */
export async function loadMinterCatalog(): Promise<MinterCatalogState> {
  try {
    const result = await passportRequest<{ schema: string; network: string; items: CatalogAvatar[] }>("catalog");
    if (result.schema !== "ekza.passport.catalog.v1" || result.network !== "solana-devnet" ||
        !Array.isArray(result.items) || result.items.some((item) =>
          !item || typeof item.avatarId !== "string" || !Array.isArray(item.support) ||
          item.support.some((support) => !support || typeof support.projectId !== "string" || typeof support.status !== "string"))) {
      return { status: "unavailable" };
    }
    return { status: "ready", items: result.items };
  } catch {
    return { status: "unavailable" };
  }
}

export function approvedMinterProjects(items: CatalogAvatar[], avatarData: string) {
  const avatar = items.find((item) => item.avatarId === `solana:devnet:avatar-data:${avatarData}`);
  return (Object.keys(PROJECT_NAMES) as Array<keyof typeof PROJECT_NAMES>).filter((projectId) =>
    avatar?.support.some((support) => support.projectId === projectId && support.status === "approved"));
}

export function MinterCompatibility({ avatarData, catalog, onRetry }: {
  avatarData: string;
  catalog: MinterCatalogState;
  onRetry: () => void;
}) {
  if (catalog.status === "loading") return <p className="ui-copy-sm" role="status">Checking approved projects… Support is not yet confirmed.</p>;
  if (catalog.status === "unavailable") return <div className="space-y-2">
    <p className="ui-copy-sm" role="status">Supported projects are unknown because the avatar catalog is unavailable.</p>
    <Button variant="secondary" onClick={onRetry}>Retry supported projects</Button>
  </div>;
  const projects = approvedMinterProjects(catalog.items, avatarData);
  if (!projects.length) return <p className="ui-copy-sm">No approved project support is listed for this collection.</p>;
  return <ul className="flex flex-wrap gap-2" aria-label="Supported projects">
    {projects.map((projectId) => <li key={projectId}><Badge tone="success">{PROJECT_NAMES[projectId]} · Supported</Badge></li>)}
  </ul>;
}
