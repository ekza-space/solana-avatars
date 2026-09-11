import { json, type MetaFunction } from "@remix-run/node";
import { Link, useBlocker, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Badge,
  Button,
  Card,
  DataList,
  EmptyState,
  Field,
  Input,
  Notice,
  Page,
  PageHeader,
  Section,
  Textarea,
} from "~/components/ui";
import { studioConfiguration } from "~/lib/studio-proxy.server";
import PreviewBoundary from "~/components/3d/PreviewBoundary";
import { parseStudioView, studioHref, type StudioView } from "~/lib/routes";
import {
  accountHref, accountReturnView, createStudioRefreshQueue, requiresStudioAccount,
  shouldBlockStudioNavigation, shouldPollStudio,
} from "~/lib/studio-navigation";
import {
  safeFileUrl,
  SOURCE_LIMIT,
  spaceLaunchUrl,
  THUMBNAIL_LIMIT,
  type StudioAvatar,
  type StudioUser,
} from "~/lib/studio";

const ModelPreview = lazy(() => import("~/components/3d/SceneWithModel"));

export const meta: MetaFunction = () => [
  { title: "Avatar Studio · Ekza" },
  {
    name: "description",
    content:
      "Discover reviewed avatars, save your library, and publish models with your Ekza email account.",
  },
];

export function loader() {
  const { publicApi, space } = studioConfiguration();
  return json({ publicApi, space });
}

class StudioRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/studio/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new StudioRequestError(
      "The service returned an unreadable response. Refresh and try again.",
      response.status
    );
  }
  if (!response.ok)
    throw new StudioRequestError(
      data.error?.message || "This action could not be completed.",
      response.status
    );
  return data as T;
}

function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
function size(bytes: number | null) {
  return bytes === null ? "Pending" : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const statusCopy = {
  draft: ["Draft", "Upload a VRM and send this version for processing."],
  queued: ["Queued", "Your upload is saved. Waiting for the model worker."],
  processing: [
    "Preparing",
    "Preparing and checking the iPhone model. You can leave this page.",
  ],
  review: [
    "In review",
    "Technical checks passed. Waiting for the curator's decision.",
  ],
  published: [
    "Published",
    "This exact version is approved and available in the catalog.",
  ],
  rejected: [
    "Changes requested",
    "Read the curator's note, then submit a new version.",
  ],
  failed: [
    "Processing failed",
    "Your model is private. Review the error and upload a corrected version.",
  ],
} as const;

function StatusBadge({
  status,
}: {
  status: StudioAvatar["revision"]["status"];
}) {
  return (
    <Badge
      tone={
        status === "published"
          ? "success"
          : status === "failed" || status === "rejected"
          ? "danger"
          : status === "draft"
          ? "default"
          : "warning"
      }
    >
      {statusCopy[status][0]}
    </Badge>
  );
}

type Run = (
  label: string,
  action: () => Promise<void>,
  success?: string
) => Promise<boolean>;

type DraftChanged = (id: string, dirty: boolean) => void;

function useDraftGuard(id: string, dirty: boolean, onDraftChanged: DraftChanged) {
  useEffect(() => {
    onDraftChanged(id, dirty);
    return () => onDraftChanged(id, false);
  }, [id, dirty, onDraftChanged]);
}

function UploadFields({
  file,
  setFile,
  thumbnail,
  setThumbnail,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  thumbnail: File | null;
  setThumbnail: (file: File | null) => void;
}) {
  return (
    <>
      <Field
        label="Avatar model"
        hint="VRM with a humanoid skeleton, embedded textures and no external resources. Up to 50 MB."
      >
        <Input
          type="file"
          accept=".vrm"
          required={!file}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        {file ? (
          <span className="ui-copy-sm">
            {file.name} · {size(file.size)}
          </span>
        ) : null}
      </Field>
      <Field
        label="Cover image"
        optional
        hint="PNG, up to 5 MB. A neutral cover is used when omitted."
      >
        <Input
          type="file"
          accept="image/png,.png"
          onChange={(event) => setThumbnail(event.target.files?.[0] || null)}
        />
        {thumbnail ? (
          <span className="ui-copy-sm">{thumbnail.name}</span>
        ) : null}
      </Field>
    </>
  );
}

function validateFiles(file: File | null, thumbnail: File | null) {
  if (!file || !/\.vrm$/i.test(file.name))
    throw new Error("Choose a .vrm avatar model.");
  if (!file.size || file.size > SOURCE_LIMIT)
    throw new Error("The VRM must be between 1 byte and 50 MB.");
  if (
    thumbnail &&
    (!/\.png$/i.test(thumbnail.name) ||
      !thumbnail.size ||
      thumbnail.size > THUMBNAIL_LIMIT)
  )
    throw new Error("The cover must be a PNG file smaller than 5 MB.");
}

async function uploadRevision(
  revisionId: string,
  file: File,
  thumbnail: File | null,
  setProgress: (value: string) => void
) {
  setProgress("Uploading VRM… Keep this page open.");
  await api(`revisions/${revisionId}/source`, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (thumbnail) {
    setProgress("Uploading cover…");
    await api(`revisions/${revisionId}/thumbnail`, {
      method: "PUT",
      body: thumbnail,
      headers: { "Content-Type": "image/png" },
    });
  }
  setProgress("Submitting for processing…");
  await post(`revisions/${revisionId}/submit`);
}

function NewAvatarForm({
  run,
  busy,
  onSubmitted,
  onDraftChanged,
}: {
  run: Run;
  busy: boolean;
  onSubmitted: () => void;
  onDraftChanged: DraftChanged;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [created, setCreated] = useState<StudioAvatar | null>(null);
  const [progress, setProgress] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [attribution, setAttribution] = useState("");
  useDraftGuard("new", !!(file || thumbnail || name || description || license || attribution || created), onDraftChanged);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const done = await run(
      "Publishing your draft",
      async () => {
        validateFiles(file, thumbnail);
        if (!name.trim() || !license.trim())
          throw new Error(
            "Enter an avatar name and the permission you grant to users."
          );
        setProgress("Saving draft…");
        const avatar =
          created ||
          (await post<StudioAvatar>("avatars", {
            name: name.trim(),
            description: description.trim(),
            license: license.trim(),
            attribution: attribution.trim(),
          }));
        setCreated(avatar);
        await uploadRevision(
          avatar.revision.revisionId,
          file!,
          thumbnail,
          setProgress
        );
      },
      "Upload received. Processing continues on the server; your avatar stays private until approval."
    );
    setProgress("");
    if (done) {
      setCreated(null);
      onSubmitted();
    }
  }
  return (
    <Card className="p-5 sm:p-7">
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <fieldset disabled={busy || !!created} className="space-y-5">
          <Field label="Avatar name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              placeholder="A character worth taking everywhere"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Tell people about your character."
            />
          </Field>
          <Field
            label="Usage license"
            hint="State the permission you grant to people using this avatar. Only upload work you are entitled to publish."
          >
            <Input
              value={license}
              onChange={(event) => setLicense(event.target.value)}
              maxLength={1000}
              required
              placeholder="e.g. Free personal use; credit the creator"
            />
          </Field>
          <Field label="Attribution" optional>
            <Input
              value={attribution}
              onChange={(event) => setAttribution(event.target.value)}
              maxLength={1000}
              placeholder="Creator or source credits"
            />
          </Field>
        </fieldset>
        <fieldset disabled={busy} className="space-y-5">
          <UploadFields
            file={file}
            setFile={setFile}
            thumbnail={thumbnail}
            setThumbnail={setThumbnail}
          />
          {created ? (
            <Notice>
              Your draft is saved. Retry this upload, or continue it from My
              uploads.
            </Notice>
          ) : null}
          <p className="ui-copy-sm">
            We prepare a version for iPhone and keep the VRM for Space. The
            curator reviews the prepared result before it becomes public.
          </p>
          <Button type="submit" disabled={busy}>
            {busy
              ? progress || "Please wait…"
              : created
              ? "Retry upload & submit"
              : "Upload & submit"}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

function DraftUpload({
  avatar,
  run,
  busy,
  onDraftChanged,
}: {
  avatar: StudioAvatar;
  run: Run;
  busy: boolean;
  onDraftChanged: DraftChanged;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [progress, setProgress] = useState("");
  useDraftGuard(avatar.revision.revisionId, !!(file || thumbnail), onDraftChanged);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(
      "Submitting draft",
      async () => {
        if (file) {
          validateFiles(file, thumbnail);
          await uploadRevision(
            avatar.revision.revisionId,
            file,
            thumbnail,
            setProgress
          );
        } else {
          if (!avatar.revision.sourceSha256)
            throw new Error("Choose a VRM to upload first.");
          if (thumbnail) {
            if (
              !/\.png$/i.test(thumbnail.name) ||
              !thumbnail.size ||
              thumbnail.size > THUMBNAIL_LIMIT
            )
              throw new Error("Choose a PNG smaller than 5 MB.");
            await api(`revisions/${avatar.revision.revisionId}/thumbnail`, {
              method: "PUT",
              body: thumbnail,
              headers: { "Content-Type": "image/png" },
            });
          }
          await post(`revisions/${avatar.revision.revisionId}/submit`);
        }
      },
      "Version submitted. Processing continues on the server."
    );
    setProgress("");
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 border-t border-[rgb(var(--line))] pt-5"
    >
      <fieldset disabled={busy} className="space-y-4">
        <Field
          label={
            avatar.revision.sourceSha256 ? "Replace uploaded VRM" : "VRM model"
          }
          optional={!!avatar.revision.sourceSha256}
          hint="VRM · up to 50 MB"
        >
          <Input
            type="file"
            accept=".vrm"
            required={!avatar.revision.sourceSha256}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </Field>
        <Field label="PNG cover" optional>
          <Input
            type="file"
            accept="image/png,.png"
            onChange={(event) => setThumbnail(event.target.files?.[0] || null)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? progress || "Please wait…" : "Submit this version"}
        </Button>
      </fieldset>
    </form>
  );
}

function AvatarCard({
  avatar,
  mode,
  user,
  saved,
  busy,
  run,
  publicApi,
  space,
  onDraftChanged,
}: {
  avatar: StudioAvatar;
  mode: "catalog" | "library" | "uploads" | "review";
  user: StudioUser | null;
  saved: boolean;
  busy: boolean;
  run: Run;
  publicApi: string;
  space: string;
  onDraftChanged: DraftChanged;
}) {
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const revision = avatar.revision;
  const sourceUrl = safeFileUrl(revision.sourceUrl);
  const source =
    sourceUrl?.startsWith("/api/studio/") && revision.sourceSha256
      ? `${sourceUrl}?v=${encodeURIComponent(revision.sourceSha256)}`
      : sourceUrl;
  const thumbnail = safeFileUrl(revision.thumbnailUrl);
  const ios = safeFileUrl(revision.iosUrl);
  const own = user?.id === avatar.creator.id;
  const editable = mode === "uploads" && own;
  const moderator =
    user?.role === "moderator" && (mode === "review" || mode === "uploads");
  useDraftGuard(
    `review:${revision.revisionId}`,
    moderator && revision.status === "review" && !!(note || checked),
    onDraftChanged
  );
  const published =
    revision.status === "published" &&
    avatar.currentRevisionId === revision.revisionId;
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="relative flex h-56 items-center justify-center border-b border-[rgb(var(--line))] bg-[rgb(var(--surface-2))]">
        {preview && source ? (
          <div className="h-full w-full">
            <PreviewBoundary key={source} onClose={() => setPreview(false)}>
              <Suspense
                fallback={<p className="ui-copy p-5">Loading 3D viewer…</p>}
              >
                <ModelPreview file={source} />
              </Suspense>
            </PreviewBoundary>
          </div>
        ) : thumbnail ? (
          <img
            key={revision.updatedAt}
            className="h-full w-full object-contain p-4"
            src={thumbnail}
            alt={`${avatar.name} cover`}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="text-center">
            <div className="font-display text-5xl text-[rgb(var(--text-strong))]">
              {avatar.name.slice(0, 1).toUpperCase()}
            </div>
            <p className="ui-label mt-3">Avatar preview</p>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge status={revision.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="ui-h3 break-words">{avatar.name}</h3>
          <p className="ui-copy-sm mt-1">by {avatar.creator.username}</p>
        </div>
        {avatar.description ? (
          <p className="ui-copy-sm whitespace-pre-wrap break-words">
            {avatar.description}
          </p>
        ) : null}
        <p className="ui-copy-sm">{statusCopy[revision.status][1]}</p>
        {avatar.currentRevisionId && !published ? (
          <Notice>
            An approved version remains live while this update is private.
          </Notice>
        ) : null}
        {revision.error ? <Notice tone="error">{revision.error}</Notice> : null}
        {revision.reviewNote ? (
          <Notice>Curator: {revision.reviewNote}</Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {source ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Show cover" : "Preview VRM"}
            </Button>
          ) : null}
          {ios ? (
            <a
              href={ios}
              rel="ar"
              className="ui-button ui-button-secondary ui-button-sm"
            >
              <img
                src={
                  thumbnail ||
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII="
                }
                alt=""
                className="hidden"
              />
              Check iPhone model ↗
            </a>
          ) : null}
        </div>
        <details className="border-y border-[rgb(var(--line))] py-3">
          <summary className="ui-copy-sm cursor-pointer font-medium">
            Version, files & usage
          </summary>
          <div className="mt-3 overflow-hidden text-xs [&_dd]:break-all">
            <DataList
              items={[
                { label: "Avatar ID", value: avatar.avatarId },
                { label: "This version", value: revision.revisionId },
                {
                  label: "Published version",
                  value: avatar.currentRevisionId || "Not published",
                },
                {
                  label: "VRM",
                  value: source ? (
                    <a href={source} className="ui-link" download>
                      Download · {size(revision.sourceSizeBytes)}
                    </a>
                  ) : (
                    "No source yet"
                  ),
                },
                {
                  label: "VRM SHA-256",
                  value: revision.sourceSha256 || "Pending",
                },
                {
                  label: "iPhone",
                  value: ios ? (
                    <a href={ios} className="ui-link" download>
                      USDZ · {size(revision.iosSizeBytes)}
                    </a>
                  ) : (
                    "Not prepared"
                  ),
                },
                {
                  label: "USDZ SHA-256",
                  value: revision.iosSha256 || "Pending",
                },
                { label: "License", value: avatar.license },
                !!avatar.attribution && {
                  label: "Attribution",
                  value: avatar.attribution,
                },
              ]}
            />
          </div>
        </details>
        {published && (mode === "catalog" || mode === "library") ? (
          <div className="mt-auto space-y-3">
            <div className="flex flex-wrap gap-3">
              <a
                className="ui-button"
                href={spaceLaunchUrl(space, publicApi, avatar.avatarId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Use in Space ↗
              </a>
              {user ? (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => {
                    void run(
                      saved ? "Removing from library" : "Saving to library",
                      async () => {
                        if (saved)
                          await api(`library/${avatar.avatarId}`, {
                            method: "DELETE",
                          });
                        else await post(`library/${avatar.avatarId}`);
                      },
                      saved
                        ? "Removed from your saved library."
                        : "Saved. Sign in with this account in Mirror to download the approved version."
                    );
                  }}
                >
                  {saved ? "Remove from library" : "Save to my library"}
                </Button>
              ) : (
                <Link
                  to={accountHref("catalog")}
                  className="ui-button ui-button-secondary"
                >
                  Sign in to save
                </Link>
              )}
            </div>
            <p className="ui-copy-sm">
              In Mirror, open Avatar Studio and sign in to download your saved
              avatars.
            </p>
          </div>
        ) : null}
        {editable && revision.status === "draft" ? (
          <DraftUpload avatar={avatar} run={run} busy={busy} onDraftChanged={onDraftChanged} />
        ) : null}
        {editable &&
        ["published", "rejected", "failed"].includes(revision.status) ? (
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => {
              void run(
                "Creating a new version",
                async () => {
                  await post(`avatars/${avatar.avatarId}/revisions`);
                },
                "New draft created. Upload the revised model below; the avatar keeps its identity."
              );
            }}
          >
            Upload a new version
          </Button>
        ) : null}
        {moderator && revision.status === "review" ? (
          <div className="space-y-4 border-t border-[rgb(var(--line))] pt-4">
            <Field
              label="Review note"
              hint="Explain required changes when returning a model."
            >
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={2000}
                disabled={busy}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input
                className="mt-1"
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                disabled={busy}
              />
              <span>
                I checked this version&apos;s VRM and prepared iPhone model, and
                approve its content and stated usage rights.
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  busy ||
                  !checked ||
                  !ios ||
                  !revision.iosSha256 ||
                  !revision.sourceSha256
                }
                onClick={() => {
                  void run(
                    "Approving this version",
                    async () => {
                      await post(`revisions/${revision.revisionId}/review`, {
                        decision: "approve",
                        note: note.trim(),
                      });
                    },
                    "Approved. This exact version is now available in the catalog."
                  );
                }}
              >
                Approve & publish
              </Button>
              <Button
                disabled={busy || !note.trim()}
                variant="secondary"
                onClick={() => {
                  void run(
                    "Returning for changes",
                    async () => {
                      await post(`revisions/${revision.revisionId}/review`, {
                        decision: "reject",
                        note: note.trim(),
                      });
                    },
                    "Returned to the creator with your note."
                  );
                }}
              >
                Request changes
              </Button>
            </div>
          </div>
        ) : null}
        {moderator && avatar.currentRevisionId ? (
          <div className="space-y-3 border-t border-[rgb(var(--line))] pt-4">
            {confirmUnpublish ? (
              <>
                <Notice>
                  This removes the currently published version from the catalog
                  and stops new downloads. Existing offline copies remain.
                </Notice>
                <div className="flex gap-3">
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      void run(
                        "Removing publication",
                        async () => {
                          await post(`avatars/${avatar.avatarId}/unpublish`);
                          setConfirmUnpublish(false);
                        },
                        "Publication removed."
                      );
                    }}
                  >
                    Confirm unpublish
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setConfirmUnpublish(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmUnpublish(true)}
              >
                Unpublish current version
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default function Studio() {
  const { publicApi, space } = useLoaderData<typeof loader>();
  const [search, setSearch] = useSearchParams();
  const tab = parseStudioView(search.toString());
  const [user, setUser] = useState<StudioUser | null>(null);
  const [catalog, setCatalog] = useState<StudioAvatar[]>([]);
  const [avatars, setAvatars] = useState<StudioAvatar[]>([]);
  const [library, setLibrary] = useState<StudioAvatar[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    tone: "error" | "success" | "info";
    text: string;
  } | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const authMode = search.get("auth") === "signup" ? "signup" : "signin";
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const refreshGeneration = useRef(0);
  const mounted = useRef(false);
  const mutationActive = useRef(false);
  const allowCompletedNavigation = useRef(false);
  const [dirtyDrafts, setDirtyDrafts] = useState<Record<string, boolean>>({});
  const dirty = Object.values(dirtyDrafts).some(Boolean);
  const onDraftChanged = useCallback<DraftChanged>((id, value) => {
    setDirtyDrafts(current => current[id] === value || (!value && !(id in current)) ? current : { ...current, [id]: value });
  }, []);
  const setTab = (view: StudioView, completed = false) => {
    if (completed) {
      allowCompletedNavigation.current = true;
      setDirtyDrafts({});
      if (blocker.state === "blocked") blocker.reset();
    }
    setSearch(new URLSearchParams({ view }));
  };
  const setAuthMode = (mode: "signin" | "signup") => {
    const next = new URLSearchParams(search);
    next.set("auth", mode);
    setSearch(next, { replace: true });
  };
  useEffect(() => { allowCompletedNavigation.current = false; }, [search]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowCompletedNavigation.current
    && shouldBlockStudioNavigation(dirty, !!busy, currentLocation, nextLocation));

  const readSnapshot = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setLoading(true);
    try {
      const status = await api<{ enabled: boolean }>("status");
      if (!status.enabled)
        throw new Error("Avatar Studio is not enabled on this server yet.");
      const [publicResult, sessionResult] = await Promise.all([
        api<{ items: StudioAvatar[] }>("catalog"),
        api<{ user: StudioUser }>("session").catch((error: unknown) => {
          if (error instanceof StudioRequestError && error.status === 401)
            return { user: null };
          throw error;
        }),
      ]);
      let own: StudioAvatar[] = [];
      let saved: StudioAvatar[] = [];
      if (sessionResult.user) {
        const [a, l] = await Promise.all([
          api<{ items: StudioAvatar[] }>("avatars"),
          api<{ items: StudioAvatar[] }>("library"),
        ]);
        own = a.items;
        saved = l.items;
      }
      if (!mounted.current || generation !== refreshGeneration.current) return;
      setUser(sessionResult.user);
      setCatalog(publicResult.items);
      setAvatars(own);
      setLibrary(saved);
      setAvailable(true);
      setServiceError("");
    } catch (error) {
      if (mounted.current && generation === refreshGeneration.current) {
        setAvailable(false);
        setServiceError(message(error));
      }
    } finally {
      if (mounted.current && generation === refreshGeneration.current) {
        setLoaded(true);
        setLoading(false);
      }
    }
  }, []);
  const refreshQueue = useRef<ReturnType<typeof createStudioRefreshQueue> | null>(null);
  if (!refreshQueue.current) refreshQueue.current = createStudioRefreshQueue(readSnapshot);
  const refresh = useCallback(() => refreshQueue.current!.refresh(), []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const online = () => {
      void refresh();
    };
    window.addEventListener("online", online);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", online);
    };
  }, [refresh]);

  const pending = avatars.some((avatar) =>
    ["queued", "processing", "review"].includes(avatar.revision.status)
  );
  const poll = shouldPollStudio(tab, user?.role, pending);
  useEffect(() => {
    if (!poll || busy || loading) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [poll, avatars, busy, refresh, serviceError, loading]);

  useEffect(() => {
    if (!busy && !dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [busy, dirty]);

  const run: Run = async (label, action, success) => {
    if (mutationActive.current) return false;
    mutationActive.current = true;
    setBusy(label);
    setNotice(null);
    let done = false;
    try {
      await refreshQueue.current!.mutate(action);
      done = true;
      if (success) setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({ tone: "error", text: message(error) });
    } finally {
      setBusy("");
      mutationActive.current = false;
    }
    return done;
  };

  const queue = avatars.filter((avatar) => avatar.revision.status === "review");
  const own = avatars.filter((avatar) => avatar.creator.id === user?.id);
  const items =
    tab === "catalog"
      ? catalog
      : tab === "library"
      ? library
      : tab === "review"
      ? queue
      : user?.role === "moderator"
      ? avatars
      : own;
  const disabled = !!busy || !available;
  const tabs = [
    { id: "catalog" as const, title: "Discover", count: catalog.length },
    ...(user
      ? [
          {
            id: "library" as const,
            title: "My library",
            count: library.length,
          },
          {
            id: "uploads" as const,
            title: user.role === "moderator" ? "All submissions" : "My uploads",
            count: user.role === "moderator" ? avatars.length : own.length,
          },
          ...(user.role === "moderator"
            ? [
                {
                  id: "review" as const,
                  title: "Review queue",
                  count: queue.length,
                },
              ]
            : []),
          { id: "new" as const, title: "Upload avatar", count: undefined },
        ]
      : []),
  ];
  const needsAccount = requiresStudioAccount(tab);
  const showSignIn = !user && loaded && (tab === "account" || needsAccount);
  const reviewDenied = tab === "review" && user?.role !== "moderator";
  const viewTitles = {
    catalog: "One character. More places to be.",
    library: "Your avatar library",
    uploads: user?.role === "moderator" ? "All submissions" : "Your submissions",
    review: "Review queue",
    new: "Publish an avatar",
    account: "Your Ekza account",
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Ekza · Avatar Studio"
        title={viewTitles[tab]}
        lede={tab === "catalog"
          ? "Discover reviewed avatars. Save your favorites and take them into Mirror on iPhone or Ekza Space."
          : tab === "account"
          ? "One email account for your library, your publications and Mirror on iPhone."
              : tab === "library"
              ? "Your saved, approved avatars are ready for Mirror on iPhone and Ekza Space."
              : tab === "review"
              ? "Inspect the prepared files and approve the exact version that people will use."
              : "Upload a model, follow its preparation, and publish the approved version after curator review."}
        actions={tab === "catalog" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="solid">Reviewed publications</Badge>
            {user ? <Link className="ui-button" to={studioHref("new")}>Upload avatar</Link> : <>
              <Link className="ui-button" to={accountHref("library", "signup")}>Create account</Link>
              <Link className="ui-button ui-button-secondary" to={accountHref("library")}>Sign in</Link>
            </>}
          </div>
        ) : undefined}
      />
      {tab === "new" ? <div className="mt-6 grid gap-px border border-[rgb(var(--line))] bg-[rgb(var(--line))] sm:grid-cols-4">
        {[
          ["01", "Upload", "Your VRM and usage terms"],
          ["02", "Prepare", "A version for every app"],
          ["03", "Review", "The curator approves it"],
          ["04", "Use", "Mirror + Space"],
        ].map(([number, title, text]) => (
          <div key={number} className="bg-[rgb(var(--surface))] p-4">
            <span className="ui-index">{number}</span>
            <h2 className="ui-h3 mt-2">{title}</h2>
            <p className="ui-copy-sm mt-1">{text}</p>
          </div>
        ))}
      </div> : null}

      <div className="mt-6 space-y-3">
        {serviceError ? (
          <Notice tone="error">
            <p>{serviceError}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              disabled={loading || !!busy}
              onClick={() => {
                void refresh();
              }}
            >
              {loading ? "Connecting…" : "Reconnect"}
            </Button>
          </Notice>
        ) : null}
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        {busy ? <Notice>{busy}…</Notice> : null}
        {!loaded ? <Notice>Connecting to Avatar Studio…</Notice> : null}
        {blocker.state === "blocked" ? (
          <Notice className="fixed bottom-6 left-4 right-4 z-50 mx-auto max-w-2xl border border-[rgb(var(--line))] shadow-xl">
            <p>{busy ? "Please wait for the current action to finish before leaving this page."
              : "This form has unsent changes or selected files. Leave this page and discard them? Saved server drafts will remain in My uploads."}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => blocker.reset()}>Stay here</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => blocker.proceed()}>Discard changes & leave</Button>
            </div>
          </Notice>
        ) : null}
      </div>

      {showSignIn ? (
        <Card
          id="studio-login"
          className="mt-6 grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr] sm:p-6"
        >
          <div>
            <h2 className="ui-h3">{needsAccount ? "Sign in to continue" : "Your library starts here"}</h2>
            <p className="ui-copy-sm mt-2">
              Browse approved avatars as a guest. Create an account with your
              email to publish models and save avatars. Use the same email and
              password in Mirror on iPhone.
            </p>
            {needsAccount ? <p className="ui-copy-sm mt-2">After sign-in, you will return to {viewTitles[tab].toLowerCase()}.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {(["signin", "signup"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={authMode === mode ? "primary" : "secondary"}
                  aria-pressed={authMode === mode}
                  disabled={!!busy}
                  onClick={() => {
                    setAuthMode(mode);
                    setPassword("");
                  }}
                >
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              ))}
            </div>
            {confirmationEmail ? (
              <div className="mt-4" role="status">
                <Notice>
                  Check {confirmationEmail} for a confirmation email. Confirm
                  your address, then return here and sign in. Your account can
                  upload models, but publication always requires curator review.
                </Notice>
              </div>
            ) : null}
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              let confirmationRequired = false;
              const done = await run(
                authMode === "signup" ? "Creating your account" : "Signing in",
                async () => {
                  const result = await post<{
                    requiresEmailConfirmation?: boolean;
                  }>(authMode === "signup" ? "registrations" : "sessions", {
                    email: email.trim(),
                    password,
                    ...(authMode === "signup"
                      ? { username: username.trim() }
                      : {}),
                  });
                  setPassword("");
                  if (result.requiresEmailConfirmation) {
                    confirmationRequired = true;
                    setConfirmationEmail(email.trim());
                  } else {
                    setConfirmationEmail("");
                    setNotice({
                      tone: "success",
                      text: "Signed in. Your uploads and saved library are ready.",
                    });
                  }
                }
              );
              if (done && confirmationRequired) {
                allowCompletedNavigation.current = true;
                setAuthMode("signin");
              } else if (done && tab === "account") {
                const destination = accountReturnView(search);
                if (destination) setTab(destination, true);
              }
            }}
          >
            <div className="min-w-36 flex-1">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                  disabled={disabled}
                />
              </Field>
            </div>
            {authMode === "signup" ? (
              <div className="min-w-36 flex-1">
                <Field
                  label="Creator username"
                  hint="Shown publicly. Use English letters, numbers, dots, underscores or hyphens."
                >
                  <Input
                    autoComplete="nickname"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    minLength={3}
                    maxLength={64}
                    pattern={"[a-zA-Z0-9][a-zA-Z0-9_.\\-]{2,63}"}
                    disabled={disabled}
                  />
                </Field>
              </div>
            ) : null}
            <div className="min-w-36 flex-1">
              <Field
                label="Password"
                hint={
                  authMode === "signup" ? "At least 12 characters." : undefined
                }
              >
                <Input
                  type="password"
                  autoComplete={
                    authMode === "signup" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={authMode === "signup" ? 12 : undefined}
                  maxLength={256}
                  disabled={disabled}
                />
              </Field>
            </div>
            <Button type="submit" disabled={disabled}>
              {authMode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>
      ) : user && tab === "account" ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--line))] pb-5">
          <div className="flex items-center gap-3">
            <span className="ui-h3">{user.username}</span>
            <Badge>{user.role === "moderator" ? "Curator" : "Creator"}</Badge>
            <span className="ui-copy-sm">{user.email}</span>
          </div>
          <div className="flex gap-3">
            <Link className="ui-button ui-button-secondary ui-button-sm" to={studioHref("library")}>My library</Link>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => setTab("new")}
            >
              Upload avatar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => {
                void run("Signing out", async () => {
                  await api("session", { method: "DELETE" });
                  setUser(null);
                  setAvatars([]);
                  setLibrary([]);
                  setTab("catalog", true);
                });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : null}

      <nav aria-label="Studio views" className="mt-8 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            className={tab === item.id ? "ui-button" : "ui-button ui-button-secondary"}
            aria-current={tab === item.id ? "page" : undefined}
            to={studioHref(item.id)}
          >
            {item.title}
            {item.count !== undefined ? ` · ${item.count}` : ""}
          </Link>
        ))}
        <Button
          className="ml-auto"
          variant="ghost"
          disabled={loading || !!busy}
          onClick={() => {
            void refresh();
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </nav>

      {tab === "account" ? (
        user ? <Section title="Ready for your next character" description="Use this same email and password in Mirror to access your saved library. Your public creator name is shown with your submissions.">
          <div className="flex flex-wrap gap-3">
            <Link className="ui-button" to={studioHref("uploads")}>My uploads</Link>
            {user.role === "moderator" ? <Link className="ui-button ui-button-secondary" to={studioHref("review")}>Open review queue</Link> : null}
          </div>
        </Section> : null
      ) : needsAccount && !user ? null : reviewDenied && tab === "review" ? (
        <Section title="Curator access required" description="This account can upload models and follow its submissions. Publication decisions are available to the curator account.">
          <Link className="ui-button" to={studioHref("uploads")}>View my uploads</Link>
        </Section>
      ) : tab === "new" && user ? (
        <Section
          title="Publish a new avatar"
          description="Every update receives its own version and goes through review."
        >
          <NewAvatarForm
            run={run}
            busy={disabled}
            onSubmitted={() => setTab("uploads", true)}
            onDraftChanged={onDraftChanged}
          />
        </Section>
      ) : (
        <Section
          title={
            tab === "catalog"
              ? "Approved avatars"
              : tab === "library"
              ? "Ready to take with you"
              : tab === "review"
              ? "Review the prepared version"
              : "Submissions & versions"
          }
          description={
            tab === "review"
              ? "Check the VRM preview, open the prepared iPhone file, then approve or return this exact version."
              : tab === "library"
              ? "Sign in with the same account in Mirror. Space opens the published VRM directly."
              : tab === "uploads" && pending
              ? "Submission status updates automatically. You can safely leave once an upload is queued."
              : undefined
          }
        >
          {!items.length ? (
            <EmptyState
              title={
                !loaded
                  ? "Loading avatars…"
                  : tab === "catalog"
                  ? "The next character starts with you."
                  : tab === "review"
                  ? "No avatars waiting for review."
                  : tab === "library"
                  ? "Your library is ready for its first avatar."
                  : "No submissions yet."
              }
              description={
                !loaded
                  ? "Waiting for the catalog."
                  : tab === "catalog"
                  ? "Approved avatars will appear here. Sign in and upload a VRM to begin the full publishing journey."
                  : tab === "review"
                  ? "This queue checks automatically every five seconds, including when it is empty. Prepared submissions will appear after processing finishes."
                  : tab === "library"
                  ? "Save an approved avatar from Discover to make it available in your Mirror library."
                  : "Upload a VRM, track its preparation and get the curator's feedback here."
              }
              action={
                user && tab !== "review" ? (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      setTab(tab === "library" ? "catalog" : "new")
                    }
                  >
                    {tab === "library" ? "Discover avatars" : "Upload avatar"}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((avatar) => (
                <AvatarCard
                  key={`${avatar.avatarId}:${avatar.revision.revisionId}`}
                  avatar={avatar}
                  mode={tab === "new" ? "uploads" : tab}
                  user={user}
                  saved={library.some(
                    (saved) => saved.avatarId === avatar.avatarId
                  )}
                  busy={disabled}
                  run={run}
                  publicApi={publicApi}
                  space={space}
                  onDraftChanged={onDraftChanged}
                />
              ))}
            </div>
          )}
        </Section>
      )}

    </Page>
  );
}
