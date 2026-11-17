"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PnlBook, PnlModel, PnlRange, PnlStrategyFilter, PnlTrade } from "@/lib/mlive/pnl";
import { ChartsBoard } from "./charts-board";
import { TradePanel } from "./trade-panel";

const BOOKS = ["all", "swing", "intraday"] as const;

export function ChartsView({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const bookParam = params.get("book");
  const book: PnlBook = bookParam === "swing" || bookParam === "intraday" ? bookParam : "all";
  const rangeParam = params.get("range");
  const range: PnlRange = rangeParam === "1m" || rangeParam === "3m" ? rangeParam : "all";
  const choices: PnlStrategyFilter[] = book === "intraday" ? ["all", "orb", "vwap"] : ["all", "rs", "ema"];
  const requested = params.get("strategy");
  const strategy: PnlStrategyFilter = requested != null && choices.includes(requested as PnlStrategyFilter) ? (requested as PnlStrategyFilter) : "all";
  const [pnl, setPnl] = useState<PnlModel | null>(null);
  const [trade, setTrade] = useState<PnlTrade | null>(null);

  function replace(next: Record<string, string>) {
    const url = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") url.delete(key);
      else url.set(key, value);
    }
    router.replace(`/live-trade-mansel/charts?${url.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/pnl?range=${range}&strategy=${strategy}&book=${book}`, { cache: "no-store" }).then(async (res) => {
        if (res.ok) setPnl((await res.json()) as PnlModel);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [range, strategy, book]);

  return (
    <section className={embedded ? undefined : "page"}>
      <div className="charts-phone card">
        <h1>Charts</h1>
        <p>Charts are laid out for a wide screen. On a phone, the same numbers are on Reports.</p>
        <p><Link href={`/live-trade-mansel/reports?book=${book}`}>Open Reports</Link></p>
      </div>
      <div className="charts-desk">
        <div className="page-head">
          <h1>Charts</h1>
          <div className="pnl-switch">
            <div className="seg" role="group" aria-label="Book">
              {BOOKS.map((item) => (
                <button key={item} type="button" data-tone={item} aria-pressed={book === item} onClick={() => replace({ book: item, strategy: "all" })}>{item === "all" ? "All" : item === "swing" ? "Swing" : "Intraday"}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Range">
              {(["1m", "3m", "all"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={range === item} onClick={() => replace({ range: item })}>{item === "all" ? "All" : item.toUpperCase()}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Strategy">
              {choices.map((item) => (
                <button key={item} type="button" data-tone={item} aria-pressed={strategy === item} onClick={() => replace({ strategy: item })}>{item === "all" ? "All" : item.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>
        {pnl?.empty ? (
          <div className="card empty-book">
            <p>{book === "intraday" ? "No intraday trades yet. The book starts after a strategy passes the bar." : "No trades in this book yet."}</p>
          </div>
        ) : pnl ? (
          <ChartsBoard pnl={pnl} onOpen={setTrade} />
        ) : (
          <p className="muted" role="status">Loading charts…</p>
        )}
        <TradePanel trade={trade} onClose={() => setTrade(null)} />
      </div>
    </section>
  );
}
