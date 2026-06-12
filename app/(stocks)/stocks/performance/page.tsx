import { Suspense } from "react";
import { PerformanceClient } from "./performance-client";

export default function PerformancePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--dota-dim)]">Loading…</div>}>
      <PerformanceClient />
    </Suspense>
  );
}
