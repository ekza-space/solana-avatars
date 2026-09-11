import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleMinterRpc } from "~/lib/minter-rpc.server";

export const action = ({ request }: ActionFunctionArgs) => handleMinterRpc(request);
export const loader = ({ request }: LoaderFunctionArgs) => handleMinterRpc(request);
