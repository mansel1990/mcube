"use client";

import { useEffect, useState } from "react";
import type { PnlModel, PnlRange, PnlStrategyFilter, PnlTrade } from "@/lib/mlive/pnl";
import { ChartsBoard } from "./charts-board";
import { TradePanel } from "./trade-panel";

export function ChartsView() {
  const [range, setRange] = useState<PnlRange>("all");
  const [strategy, setStrategy] = useState<PnlStrategyFilter>("all");
  const [pnl, setPnl] = useState<PnlModel | null>(null);
  const [trade, setTrade] = useState<PnlTrade | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/pnl?range=${range}&strategy=${strategy}`, { cache: "no-store" }).then(async (res) => {
        if (res.ok) setPnl((await res.json()) as PnlModel);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [range, strategy]);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Charts</h1>
          <p className="sub">Account value, profit and the shape of the trades. One set of numbers.</p>
        </div>
        <div className="pnl-switch">
          <div className="seg" role="group" aria-label="Range">
            {(["1m", "3m", "all"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={range === item} onClick={() => setRange(item)}>{item === "all" ? "All" : item.toUpperCase()}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Strategy">
            {(["all", "rs", "ema"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={strategy === item} onClick={() => setStrategy(item)}>{item === "all" ? "All" : item.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>
      {pnl ? (
        <ChartsBoard pnl={pnl} onOpen={setTrade} />
      ) : (
        <p className="muted" role="status">Loading charts…</p>
      )}
      <TradePanel trade={trade} onClose={() => setTrade(null)} />
    </section>
  );
}
