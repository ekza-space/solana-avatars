/**
 * Vercel serverless expects `@vercel/remix` streaming, not raw node streams.
 * @see https://vercel.com/docs/frameworks/full-stack/remix#using-a-custom-app/entry.server-file
 */
import type { AppLoadContext, EntryContext } from "@vercel/remix";
import { handleRequest } from "@vercel/remix";
import { RemixServer } from "@remix-run/react";

export default function handleRequestEntry(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  // Kept for Remix entry signature compatibility
  _loadContext?: AppLoadContext
) {
  const remixServer = (
    <RemixServer context={remixContext} url={request.url} />
  );
  return handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixServer
  );
}
