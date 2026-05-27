import { Suspense } from "react";
import { UnifiedSignalsPage } from "@/components/stocks/unified-signals-page";

export default function StocksHomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Loading signals…</div>}>
      <UnifiedSignalsPage />
    </Suspense>
  );
}
