import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { studioRedirectTarget } from "~/lib/routes";

export function loader({ request }: LoaderFunctionArgs) {
  const search = new URL(request.url).search;
  // Preserve existing Studio deep links while the home entry follows the
  // purchased-avatar product. The two libraries keep their own identities.
  return redirect(search ? studioRedirectTarget(search) : "/passport");
}

export default function Index() {
  return null;
}
