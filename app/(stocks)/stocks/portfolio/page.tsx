"use client";

import { Suspense } from "react";
import { PortfolioPage } from "@/components/stocks/portfolio/portfolio-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--dota-dim)]">Loading portfolio…</div>}>
      <PortfolioPage />
    </Suspense>
  );
}
