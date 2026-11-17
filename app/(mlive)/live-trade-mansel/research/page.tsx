import { Suspense } from "react";
import { ResearchView } from "@/components/mlive/research-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading research…</p>}>
      <ResearchView />
    </Suspense>
  );
}
