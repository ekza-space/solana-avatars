import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handlePassportRequest } from "~/lib/passport.server";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  handlePassportRequest(request, params["*"] || "");
export const action = ({ request, params }: ActionFunctionArgs) =>
  handlePassportRequest(request, params["*"] || "");
