import type { LoaderFunctionArgs } from "@remix-run/node";
import { demoSample } from "~/lib/studio-demo.server";

export function loader({ request }: LoaderFunctionArgs) {
  return demoSample(new URL(request.url).searchParams.get("kind"));
}
