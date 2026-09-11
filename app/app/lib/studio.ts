export type StudioUser = {
  id: string;
  username: string;
  email: string;
  role: "creator" | "moderator";
};

export type StudioAvatar = {
  avatarId: string;
  name: string;
  description: string;
  license: string;
  attribution: string;
  creator: { id: string; username: string };
  currentRevisionId: string | null;
  revision: {
    revisionId: string;
    status:
      | "draft"
      | "queued"
      | "processing"
      | "review"
      | "published"
      | "rejected"
      | "failed";
    sourceSha256: string | null;
    sourceSizeBytes: number | null;
    sourceUrl: string | null;
    thumbnailUrl: string | null;
    iosUrl: string | null;
    iosSha256: string | null;
    iosSizeBytes: number | null;
    error: string | null;
    reviewNote: string | null;
    updatedAt: string;
  };
};

export const SOURCE_LIMIT = 50 * 1024 * 1024;
export const THUMBNAIL_LIMIT = 5 * 1024 * 1024;

export function spaceLaunchUrl(
  spaceUrl: string,
  apiUrl: string,
  avatarId: string
) {
  const url = new URL(spaceUrl);
  url.searchParams.set("studioAvatar", avatarId);
  url.searchParams.set("studioApi", apiUrl);
  return url.href;
}

export function safeFileUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/api/studio/") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Invalid file URLs do not become clickable links. */
  }
  return undefined;
}
