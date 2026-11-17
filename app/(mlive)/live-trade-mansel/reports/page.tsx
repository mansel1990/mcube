import { Suspense } from "react";
import { ReportsView } from "@/components/mlive/reports-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading reports…</p>}>
      <ReportsView />
    </Suspense>
  );
}
