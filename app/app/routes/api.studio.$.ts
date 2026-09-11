import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { proxyStudioRequest } from "~/lib/studio-proxy.server";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  proxyStudioRequest(request, params["*"] || "");
export const action = ({ request, params }: ActionFunctionArgs) =>
  proxyStudioRequest(request, params["*"] || "");
