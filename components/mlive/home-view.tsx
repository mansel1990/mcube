"use client";

import { useEffect, useState } from "react";
import { useIntradayRetired } from "./capabilities";
import { TodayBoard } from "./today-board";
import type { LongtermProposalView } from "./longterm-proposal-banner";

type Holding = {
  symbol: string;
  strategy: string;
  qty: number;
  avg: number;
  stop: number;
  since: string | null;
  sellProposed: boolean;
};
type Home = {
  today: string;
  account?: number;
  fund?: number;
  state: { status: string; mode: string; haltReason: string | null };
  kite: { connected: boolean };
  tradingLimit: number;
  engineCanUse: number;
  todayMove?: { beforeOpen: boolean; label: string; amount: number; pct: number | null; note: string | null };
  books?: { swing: { open: number; capital: number } };
  trades: { buys: number; maxBuys: number; waiting: number };
  needsYou: { id: number; side: string; symbol: string; text: string; sizing: { qty?: number; limit?: number } }[];
  holdings: Holding[];
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string }[];
  spark: { date: string | null; value: number }[];
  longtermProposal?: LongtermProposalView | null;
};

export function HomeView() {
  const intradayOff = useIntradayRetired();
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<{ id: number; action: "approve" | "skip" } | null>(null);

  async function load() {
    const res = await fetch("/api/mlive/home");
    if (!res.ok) {
      setError("The live book could not be loaded.");
      return;
    }
    const body = (await res.json()) as Home;
    setData(body);
    const tickers = body.holdings.map((row) => row.symbol).join(",");
    if (!tickers) return;
    const quotes = await fetch(`/api/stocks/current-price?tickers=${encodeURIComponent(tickers)}`);
    if (!quotes.ok) return;
    const map = (await quotes.json()) as Record<string, { price: number } | null>;
    const next: Record<string, number> = {};
    for (const [symbol, quote] of Object.entries(map)) {
      if (quote?.price) next[symbol] = quote.price;
    }
    setPrices(next);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function act(id: number, action: "approve" | "skip") {
    if (pending) return;
    setPending({ id, action });
    const res = await fetch("/api/mlive/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision_id: id, action }),
    });
    setPending(null);
    if (res.ok) await load();
  }

  if (error) return <p className="page">{error}</p>;
  if (!data) return <p className="page">Loading the book…</p>;
  return <TodayBoard data={data} prices={prices} pending={pending} intradayOff={intradayOff} onAct={(id, action) => void act(id, action)} />;
}
