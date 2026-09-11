import { readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export function findStudioBuild(appRoot) {
  const server = resolve(appRoot, "build/server");
  let candidates;
  try {
    candidates = readdirSync(server, { withFileTypes: true }).flatMap(
      (entry) => {
        if (entry.isFile() && entry.name === "index.js")
          return [resolve(server, entry.name)];
        if (entry.isDirectory()) {
          const child = readdirSync(resolve(server, entry.name), {
            withFileTypes: true,
          });
          if (child.some((item) => item.name === "index.js" && item.isFile()))
            return [resolve(server, entry.name, "index.js")];
        }
        return [];
      }
    );
  } catch {
    throw new Error("Studio build is missing. Run npm run build first.");
  }
  if (candidates.length !== 1 || !statSync(candidates[0]).isFile())
    throw new Error(
      "Expected exactly one Studio server bundle. Run npm run build and inspect its output."
    );
  return candidates[0];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const child = spawn(
      process.execPath,
      [
        resolve(appRoot, "node_modules/@remix-run/serve/dist/cli.js"),
        findStudioBuild(appRoot),
      ],
      {
        cwd: appRoot,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "inherit",
      }
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error(
        "Studio could not start. Check the installed dependencies."
      );
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
