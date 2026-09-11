import { lazy, Suspense, useEffect, useState } from "react";
import { Page, Notice } from "./ui";
const PassportPage = lazy(() => import("./passport-page"));
export default function ClientPassport({ pairing = false }: { pairing?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const loading = <Page><Notice>Opening your avatar library…</Notice></Page>;
  return ready ? <Suspense fallback={loading}><PassportPage pairing={pairing} /></Suspense> : loading;
}
