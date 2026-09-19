import { redirect } from "@remix-run/node";

export function loader() {
  return redirect("/passport");
}

export default function Index() {
  return null;
}
