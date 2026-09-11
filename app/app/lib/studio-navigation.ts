import type { StudioView } from "./routes";

const views: readonly StudioView[] = ["catalog", "library", "uploads", "review", "new", "account"];

export function accountHref(returnTo: StudioView = "library", mode: "signin" | "signup" = "signin") {
  const search = new URLSearchParams({ view: "account", returnTo, auth: mode });
  return `/studio?${search}`;
}

export function accountReturnView(search: URLSearchParams): StudioView | null {
  const requested = search.get("returnTo");
  return views.includes(requested as StudioView) && requested !== "account" ? requested as StudioView : null;
}

export function requiresStudioAccount(view: StudioView) {
  return view !== "catalog" && view !== "account";
}

export function shouldPollStudio(view: StudioView, role: string | undefined, pending: boolean) {
  return pending || (view === "review" && role === "moderator");
}

export function shouldBlockStudioNavigation(dirty: boolean, busy: boolean,
  current: { pathname: string; search: string }, next: { pathname: string; search: string }) {
  return (dirty || busy) && (current.pathname !== next.pathname || current.search !== next.search);
}

/** One read at a time. Mutations drain the preceding read, pause background polls,
 * then refresh once after the write, so an older snapshot cannot overwrite it. */
export function createStudioRefreshQueue(read: () => Promise<void>) {
  let current: Promise<void> | null = null;
  let mutating = false;
  function execute() {
    if (current) return current;
    current = Promise.resolve().then(read).finally(() => { current = null; });
    return current;
  }
  return {
    refresh() { return mutating ? Promise.resolve() : execute(); },
    async mutate<T>(action: () => Promise<T>): Promise<T> {
      if (mutating) throw new Error("An action is already in progress. Please wait.");
      mutating = true;
      try {
        await current;
        return await action();
      } finally {
        try { await execute(); }
        finally { mutating = false; }
      }
    },
  };
}
