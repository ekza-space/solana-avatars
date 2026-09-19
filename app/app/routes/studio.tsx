import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { studioLocation } from "~/lib/studio-location.server";

// Avatar Studio moved to the ekza-registry repository. Old links are forwarded
// to its configured home, or to the avatar store when none is configured.
export function loader({ request }: LoaderFunctionArgs) {
  return redirect(studioLocation(new URL(request.url).search) ?? "/passport");
}

export default function MovedStudio() {
  return null;
}
