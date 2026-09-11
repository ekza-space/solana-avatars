import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleCreatorUpload } from "~/lib/creator-upload.server";

export const action = ({ request }: ActionFunctionArgs) => handleCreatorUpload(request);
export const loader = ({ request }: LoaderFunctionArgs) => handleCreatorUpload(request);
