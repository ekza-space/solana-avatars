import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

// Only the already rehearsed source can be offered by the local demo launcher.
// No request parameter is ever used as a filesystem path.
export const DEMO_SOURCE_SHA256 =
  "5e3edaf330577ee4c3f6440b8989af3722e7c800bb90eb037f1c05cdfe61fd7c";

export function demoEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.EKZA_STUDIO_DEMO === "1";
}

export async function demoSample(
  kind: string | null,
  environment: NodeJS.ProcessEnv = process.env
): Promise<Response> {
  if (!demoEnabled(environment))
    throw new Response("Not found", { status: 404 });
  if (kind !== "source" && kind !== "thumbnail")
    throw new Response("Unknown sample", { status: 404 });
  const path =
    environment[
      kind === "source"
        ? "EKZA_STUDIO_DEMO_SOURCE"
        : "EKZA_STUDIO_DEMO_THUMBNAIL"
    ];
  if (!path) throw new Response("Sample unavailable", { status: 404 });
  try {
    const file = await open(path, "r");
    let bytes: Buffer;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > 5 * 1024 * 1024)
        throw new Error("Invalid sample");
      bytes = await file.readFile();
    } finally {
      await file.close();
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (kind === "source" && hash !== DEMO_SOURCE_SHA256)
      throw new Error("Unrehearsed sample");
    if (
      kind === "thumbnail" &&
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("Invalid cover");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          kind === "source" ? "application/octet-stream" : "image/png",
        "Content-Disposition": `attachment; filename="Robert.${
          kind === "source" ? "vrm" : "png"
        }"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Do not expose a local path or filesystem error to the client.
    throw new Response(
      "Prepared sample unavailable. Check the local launcher.",
      {
        status: 503,
      }
    );
  }
}
