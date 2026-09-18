import { lazy, Suspense, useEffect, useState } from "react";
import { Notice, Page } from "~/components/ui";
const SolanaIdentityPage = lazy(() => import("~/components/solana-identity-page"));
export const meta = () => [{ title: "Verify your wallet · Ekza" }];
export default function SolanaIdentityRoute() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const loading = <Page><Notice>Opening wallet verification…</Notice></Page>;
  return ready ? <Suspense fallback={loading}><SolanaIdentityPage /></Suspense> : loading;
}
