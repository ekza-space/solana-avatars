import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleMinterMetadata } from "~/lib/minter-metadata.server";

export const loader = ({ request }: LoaderFunctionArgs) => handleMinterMetadata(request);
export const action = ({ request }: ActionFunctionArgs) => handleMinterMetadata(request);
