import { Suspense } from "react";
import { ChartsView } from "@/components/mlive/charts-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading charts…</p>}>
      <ChartsView />
    </Suspense>
  );
}
