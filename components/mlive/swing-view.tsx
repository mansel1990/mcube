"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PnlModel } from "@/lib/mlive/pnl";
import { inr, signed } from "./format";

type Holding = { symbol: string; strategy: string; qty: number; avg: number; stop: number; since: string | null; gtt?: boolean };
type Idea = { symbol: string; strategy: string; result: string; reason: string };
type Home = {
  today: string;
  engineCanUse: number;
  holdings: Holding[];
  ideas: { rows: Idea[] };
  spark: { date: string | null; value: number }[];
  kite: { connected: boolean; matches: boolean };
  trades?: { buys: number; maxBuys: number };
  state?: { status: string };
  todayMove?: { beforeOpen: boolean; amount: number; note: string | null };
};
type ResearchRow = { strategy: string; sample: string; profitFactor: number | null; averageNet: number | null; trades: number; passed: boolean; note: string; isDefault?: boolean };

const NAMES: Record<string, string> = {
  ema: "EMA Pullback",
  rs: "RS Resilience",
  trend_breakout: "Trend breakout",
  rsi2: "RSI 2",
  momentum: "Momentum",
  ema_v2: "EMA v2",
};

function shortDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function nameOf(strategy: string): string {
  return NAMES[strategy] ?? strategy;
}

function monthMove(spark: Home["spark"], today: string): number {
  const month = today.slice(0, 7);
  const inMonth = spark.filter((point) => point.date?.startsWith(month));
  if (inMonth.length === 0) return 0;
  const before = [...spark].reverse().find((point) => point.date && point.date < `${month}-01`);
  const last = inMonth[inMonth.length - 1].value;
  return before ? last - before.value : last - inMonth[0].value;
}

export function SwingView() {
  const [data, setData] = useState<Home | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [research, setResearch] = useState<ResearchRow[] | null>(null);
  const [closed, setClosed] = useState<PnlModel["trades"]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/home").then(async (res) => {
        if (!res.ok) {
          setError("The swing book could not be loaded.");
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
        for (const [symbol, quote] of Object.entries(map)) if (quote?.price) next[symbol] = quote.price;
        setPrices(next);
      });
      void fetch("/api/mlive/research?book=swing").then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as ResearchRow[] | { results?: ResearchRow[] };
        const rows = Array.isArray(body) ? body : body.results ?? [];
        setResearch(rows.filter((row) => row.isDefault !== false));
      });
      void fetch("/api/mlive/pnl?range=all&strategy=all&book=swing", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as PnlModel;
        setClosed(body.trades.filter((trade) => trade.status === "closed").slice(-5).reverse());
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (error) return <p className="page">{error}</p>;
  if (!data) return <p className="page">Loading the swing book…</p>;

  const openPnl = data.holdings.reduce((sum, row) => sum + ((prices[row.symbol] ?? row.avg) - row.avg) * row.qty, 0);
  const todayPnl = data.todayMove?.amount ?? 0;
  const todayLabel = data.todayMove?.beforeOpen ? "Yesterday" : "Today";
  const monthPnl = monthMove(data.spark, data.today);
  const held = new Set(data.holdings.map((row) => row.symbol));
  const stopsLive = data.holdings.filter((row) => row.gtt).length;
  const bought = data.ideas.rows.filter((row) => row.result === "sent" || held.has(row.symbol)).length;
  const paused = data.state?.status.startsWith("paused");
  const strategies = ["rs", "ema", ...new Set((research ?? []).map((row) => row.strategy))].filter((name, index, list) => list.indexOf(name) === index);

  return (
    <section className="page">
      <h1 className="page-title"><span className="book-dot swing" /> Swing</h1>
      {!data.kite.connected && <p className="sub">Kite is not logged in, so last prices stay blank.</p>}
      {paused && <p className="sub">The engine is paused. Open positions stay, and new buys wait.</p>}
      <article className="card book-card swing divided" style={{ marginTop: 16 }}>
        <div><span className="lbl">{todayLabel}</span><b className={todayPnl >= 0 ? "up" : "down"}>{signed(todayPnl)}</b>{data.todayMove?.note ? <span className="sub">{data.todayMove.note}</span> : null}</div>
        <div><span className="lbl">Open positions</span><b className={openPnl >= 0 ? "up" : "down"}>{signed(openPnl)}</b></div>
        <div><span className="lbl">This month</span><b className={monthPnl >= 0 ? "up" : "down"}>{signed(monthPnl)}</b></div>
        <div><span className="lbl">Free to invest</span><b className="n">{inr(data.engineCanUse)}</b></div>
      </article>

      <article className="card" style={{ marginTop: 16, overflow: "auto" }}>
        <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2>Positions</h2>
          <span className={`chip ${data.holdings.length > 0 && stopsLive < data.holdings.length ? "loss" : ""}`}>
            {data.holdings.length === 0 ? "No positions" : `${stopsLive} of ${data.holdings.length} stops in Kite`}
          </span>
        </div>
        {data.holdings.length === 0 ? <p className="sub">No open positions.</p> : (
          <table className="sheet">
            <thead>
              <tr><th>Stock</th><th className="r">Qty</th><th className="r">Avg</th><th className="r">Last</th><th className="r">Stop</th><th className="r">Room above stop</th><th className="r">P&L</th></tr>
            </thead>
            <tbody>
              {data.holdings.map((row) => {
                const last = prices[row.symbol];
                const mark = last ?? row.avg;
                const pnl = (mark - row.avg) * row.qty;
                const room = row.stop > 0 && last ? ((last - row.stop) / row.stop) * 100 : null;
                const width = room == null ? 0 : Math.max(0, Math.min(100, room));
                return (
                  <tr key={row.symbol}>
                    <td><b>{row.symbol}</b><div className="muted">{nameOf(row.strategy)}{row.since ? ` · since ${shortDay(row.since)}` : ""}</div></td>
                    <td className="r n">{row.qty}</td>
                    <td className="r n">{inr(row.avg, 2)}</td>
                    <td className="r n">{last ? inr(last, 2) : "—"}</td>
                    <td className="r n">{row.stop ? inr(row.stop, 2) : "—"}</td>
                    <td className="r">{room == null ? "—" : <span className="room"><i><span className={room < 0 ? "down" : ""} style={{ width: `${width}%` }} /></i><span className="n">{room.toFixed(1)}%</span></span>}</td>
                    <td className="r"><span className={`pnl-chip ${pnl >= 0 ? "up" : "down"}`}>{signed(pnl)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>

      <div className="today-lower">
        <article className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>Today&apos;s ideas</h2>
            <span className="muted">{data.ideas.rows.length} ideas · {bought} bought</span>
          </div>
          {data.ideas.rows.length === 0 && <p className="sub">No ideas yet. The next scan is at 18:00.</p>}
          {data.ideas.rows.slice(0, 8).map((row) => {
            const already = held.has(row.symbol);
            return (
              <div className="act-line" key={`${row.strategy}-${row.symbol}`}>
                <div style={{ flex: 1 }}>
                  <b>{row.symbol}</b>
                  <div className="muted">{already ? "Already in the book" : row.reason}</div>
                </div>
                <span className={`chip ${already ? "bought" : row.result === "sent" ? "bought" : row.result === "proposed" ? "work" : "dead"}`}>
                  {already ? "Held" : row.result === "sent" ? "Bought" : row.result === "proposed" ? "Needs you" : "Skipped"}
                </span>
              </div>
            );
          })}
        </article>
        <article className="card">
          <div className="card-h"><h2>Strategies</h2></div>
          <div className="strategy-grid">
            {strategies.map((name) => {
              const rows = (research ?? []).filter((row) => row.strategy === name);
              const picked = rows.find((row) => row.sample === "heldback" || row.sample === "held") ?? rows.find((row) => row.sample === "building") ?? rows[0];
              const passed = rows.filter((row) => row.passed).length;
              const status = rows.length === 0 ? "Off" : passed === rows.length ? "On" : passed > 0 ? "Retiring" : "Off";
              return (
                <div key={name} className="card" style={{ padding: 14 }}>
                  <div className="book-top">
                    <b>{nameOf(name)}</b>
                    <span className={`chip ${status === "On" ? "bought" : status === "Retiring" ? "sold" : "dead"}`}>{status}</span>
                  </div>
                  <p className="sub">Profit factor {picked?.profitFactor == null ? "—" : picked.profitFactor.toFixed(2)} · per trade {picked?.averageNet == null ? "—" : `${(picked.averageNet * 100).toFixed(2)}%`} · {picked ? `${picked.trades} trades` : "—"}</p>
                  <p className="muted">{picked?.note || "Live delivery book"}</p>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <article className="card" style={{ marginTop: 16 }}>
        <div className="card-h" style={{ display: "flex", justifyContent: "space-between" }}>
          <h2>Closed trades</h2>
          <Link href="/live-trade-mansel/reports?tab=trades&book=swing">All trades in Reports</Link>
        </div>
        {closed.length === 0 ? <p className="sub">No closed swing trades yet.</p> : closed.map((trade) => (
          <div className="act-line" key={trade.id}>
            <b>{trade.symbol}</b>
            <span className="muted">{trade.exitDate ? shortDay(trade.exitDate) : ""}</span>
            <span className={`pnl-chip ${trade.net >= 0 ? "up" : "down"}`}>{signed(trade.net)}</span>
          </div>
        ))}
      </article>
    </section>
  );
}
