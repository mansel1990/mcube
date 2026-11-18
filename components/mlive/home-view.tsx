"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { homeStatusPill } from "@/lib/mlive/rules";
import { inr, signed } from "./format";
import { useIntradayRetired } from "./capabilities";
import { LongtermProposalBanner, type LongtermProposalView } from "./longterm-proposal-banner";

type Holding = {
  symbol: string;
  qty: number;
  avg: number;
  stop: number;
  since: string | null;
  sellProposed: boolean;
  frozen: boolean;
  gtt?: boolean;
};
type Home = {
  today: string;
  account?: number;
  fund?: number;
  state: { status: string; mode: string; haltReason: string | null; resumedAt: string | null; dryRun: boolean; drawdown: number; breakerPct: number; peak: number };
  kite: { connected: boolean; matches: boolean };
  tradingLimit: number;
  engineCanUse: number;
  todayMove?: { beforeOpen: boolean; label: string; amount: number; pct: number | null; note: string | null };
  books?: {
    swing: { open: number; capital: number };
    intraday: { open: number; capital: number; planned?: boolean; counts?: boolean; waiting: boolean; maxTrades: number; today?: number; month?: number; tradesToday?: number; dayLossUsed?: number; dayLossLimit?: number; realised?: number };
  };
  trades: { buys: number; maxBuys: number; waiting: number };
  needsYou: { id: number; side: string; symbol: string; text: string; sizing: { qty?: number; limit?: number } }[];
  holdings: Holding[];
  ideas: { rows: { symbol: string; strategy: string; result: string; reason: string }[] };
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string }[];
  spark: { date: string | null; value: number }[];
  longtermProposal?: LongtermProposalView | null;
};

function Info({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-wrap">
      <button type="button" className="info" aria-expanded={open} aria-label={label} onClick={() => setOpen((on) => !on)}>ⓘ</button>
      {open && <span className="popover" role="note">{label}</span>}
    </span>
  );
}

function shortDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function monthMove(spark: Home["spark"], today: string): number {
  const month = today.slice(0, 7);
  const inMonth = spark.filter((point) => point.date?.startsWith(month));
  if (inMonth.length === 0) return 0;
  const before = [...spark].reverse().find((point) => point.date && point.date < `${month}-01`);
  const last = inMonth[inMonth.length - 1].value;
  return before ? last - before.value : last - inMonth[0].value;
}

function Spark({ points, putIn }: { points: { value: number }[]; putIn: number }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values, putIn);
  const max = Math.max(...values, putIn);
  const span = max - min || 1;
  const w = 320;
  const h = 72;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * w;
    const y = h - ((value - min) / span) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const putY = h - ((putIn - min) / span) * (h - 8) - 4;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Account value since the first trade">
      <line className="put" x1="0" x2={w} y1={putY} y2={putY} />
      <polyline className="value" points={coords.join(" ")} />
    </svg>
  );
}

export function HomeView() {
  const intradayOff = useIntradayRetired();
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<{ id: number; action: "approve" | "skip" } | null>(null);
  const [filter, setFilter] = useState<"all" | "orders" | "skipped">("all");

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

  const swingCapital = data.books?.swing.capital ?? data.tradingLimit;
  const dayCapital = data.books?.intraday.capital ?? 0;
  const counts = data.books?.intraday.counts === true;
  const planned = !counts && data.books?.intraday.planned !== false;
  const swingValue = data.account ?? swingCapital;
  const dayValue = counts ? dayCapital + (data.books?.intraday.realised ?? 0) : 0;
  const both = swingValue + dayValue;
  const swingShare = both > 0 ? (swingValue / both) * 100 : 100;
  const openPnl = data.holdings.reduce((sum, row) => sum + ((prices[row.symbol] ?? row.avg) - row.avg) * row.qty, 0);
  const move = data.todayMove ?? { beforeOpen: false, label: "today", amount: 0, pct: null, note: null };
  const todayPnl = move.amount;
  const todayPct = move.pct ?? 0;
  const monthPnl = monthMove(data.spark, data.today);
  const dayToday = data.books?.intraday.today ?? 0;
  const dayMonth = data.books?.intraday.month ?? 0;
  const status = homeStatusPill({ status: data.state.status, haltReason: data.state.haltReason, kiteConnected: data.kite.connected, resumedAt: data.state.resumedAt });
  const stopsLive = data.holdings.filter((row) => row.gtt).length;
  const stopsMissing = data.holdings.length > 0 && stopsLive < data.holdings.length;
  const putIn = data.fund ?? data.spark[0]?.value ?? swingCapital;
  const lossUsed = data.books?.intraday.dayLossUsed ?? 0;
  const lossLimit = data.books?.intraday.dayLossLimit ?? 0;
  const lossPct = lossLimit > 0 ? Math.min(100, (lossUsed / lossLimit) * 100) : 0;
  const breakerPct = data.state.breakerPct > 0 ? Math.min(100, (data.state.drawdown / data.state.breakerPct) * 100) : 0;
  const activity = data.activity.filter((row) => {
    if (filter === "orders") return row.side === "BUY" || row.side === "SELL";
    if (filter === "skipped") return row.outcome === "skipped" || /skip/i.test(row.detail);
    return true;
  });

  return (
    <section className="page">
      <h1 className="page-title">Today <span className="when">{shortDay(data.today)}</span></h1>
      {data.longtermProposal ? <LongtermProposalBanner proposal={data.longtermProposal} onDone={() => void load()} /> : null}
      {status.connect && <p className="sub">Kite is not logged in, so new orders wait.</p>}

      {data.needsYou.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          {data.needsYou.map((row) => (
            <div className="act-line" key={row.id}>
              <b>{row.side === "BUY" ? "Approve buy" : "Approve sell"} · {row.symbol}</b>
              <span className="muted" style={{ flex: 1 }}>{row.text}</span>
              <button type="button" className="btn" disabled={pending != null} onClick={() => act(row.id, "skip")}>Reject</button>
              <button type="button" className="btn primary" disabled={pending != null} onClick={() => act(row.id, "approve")}>Approve</button>
            </div>
          ))}
        </div>
      )}

      <article className="card hero-card" style={{ marginTop: 16 }}>
        <p className="lbl">Account value</p>
        <div className="big n">{inr(both)}</div>
        {move.note && <p className="sub">{move.note}</p>}
        <span className={`chg-pill ${todayPnl >= 0 ? "up" : "down"}`}>{move.beforeOpen ? `Yesterday ${signed(todayPnl)}` : `${signed(todayPnl)} · ${todayPct >= 0 ? "+" : "−"}${Math.abs(todayPct).toFixed(2)}%`}</span>
        <div className="split" aria-hidden="true">
          <i className="swing" style={{ width: intradayOff ? "100%" : `${swingShare}%` }} />
          {!intradayOff && <i className="intraday" style={{ width: `${100 - swingShare}%` }} />}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink3)", fontSize: 13 }}>
          <span>Swing {inr(swingValue)}</span>
          {!intradayOff && <span>{planned ? `Intraday ${inr(dayCapital)} planned` : `Intraday ${inr(dayValue)}`}</span>}
        </div>
        <Spark points={data.spark} putIn={putIn} />
        <div className="figure-row">
          <div><span className="lbl">Free to invest <Info label="What a new buy can spend right now, after the cash reserve." /></span><b className="n">{inr(data.engineCanUse)}</b></div>
          <div><span className="lbl">Open positions</span><b className={`n ${openPnl >= 0 ? "up" : "down"}`}>{signed(openPnl)}</b></div>
          <div><span className="lbl">This month</span><b className={`n ${monthPnl >= 0 ? "up" : "down"}`}>{signed(monthPnl)}</b></div>
          <div>
            <span className="lbl">Breaker</span>
            <b className="n">{data.state.drawdown.toFixed(1)}%</b>
            <div className="meter" aria-hidden="true"><i style={{ width: `${breakerPct}%` }} /></div>
          </div>
        </div>
      </article>

      <div className="book-row">
        <article className="card book-card swing">
          <div className="book-top">
            <p className="lbl"><span className="book-dot swing" /> Swing</p>
            <Link href="/live-trade-mansel/swing">Open</Link>
          </div>
          <div className={`book-pnl n ${todayPnl >= 0 ? "up" : "down"}`}>{signed(todayPnl)}</div>
          <p className="sub">{move.beforeOpen ? "Yesterday · Market not open yet" : `today · ${data.holdings.length} open`}</p>
          <div className="trio">
            <div><span className="lbl">Open positions</span><b className={openPnl >= 0 ? "up" : "down"}>{signed(openPnl)}</b></div>
            <div><span className="lbl">This month</span><b className={monthPnl >= 0 ? "up" : "down"}>{signed(monthPnl)}</b></div>
            <div><span className="lbl">Buys today</span><b className="n">{data.trades.buys} of {data.trades.maxBuys}</b></div>
          </div>
        </article>
        {!intradayOff && <article className="card book-card intraday">
          <div className="book-top">
            <p className="lbl"><span className="book-dot intraday" /> Intraday</p>
            <Link href="/live-trade-mansel/intraday">Open</Link>
          </div>
          <div className={`book-pnl n ${dayToday >= 0 ? "up" : "down"}`}>{signed(dayToday)}</div>
          <p className="sub">{planned ? `${inr(dayCapital)} planned` : data.books?.intraday.waiting ? "The book starts after a strategy passes the bar." : `today · ${data.books?.intraday.open ?? 0} open`}</p>
          <div className="trio">
            <div><span className="lbl">Trades today</span><b className="n">{data.books?.intraday.tradesToday ?? 0} of {data.books?.intraday.maxTrades ?? 4}</b></div>
            <div><span className="lbl">This month</span><b className={dayMonth >= 0 ? "up" : "down"}>{signed(dayMonth)}</b></div>
            <div>
              <span className="lbl">Day loss limit used</span>
              <b className="n">{inr(lossUsed)} of {inr(lossLimit)}</b>
              <div className="meter" aria-hidden="true"><i style={{ width: `${lossPct}%` }} /></div>
            </div>
          </div>
        </article>}
      </div>

      <div className="today-lower">
        <article className="card" style={{ overflow: "auto" }}>
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2>Holdings</h2>
            <span className={`chip ${stopsMissing ? "loss" : ""}`}>{data.holdings.length === 0 ? "No holdings" : `${stopsLive} of ${data.holdings.length} stops in Kite`}</span>
          </div>
          {data.holdings.length === 0 ? (
            <p className="sub">No open positions.</p>
          ) : (
            <table className="sheet">
              <thead>
                <tr><th>Stock</th><th className="r">Qty</th><th className="r">Avg</th><th className="r">Last</th><th className="r">Stop</th><th className="r">Room above stop</th><th className="r">P&L</th></tr>
              </thead>
              <tbody>
                {data.holdings.map((row) => {
                  const last = prices[row.symbol];
                  const pnl = ((last ?? row.avg) - row.avg) * row.qty;
                  const room = row.stop > 0 && last ? ((last - row.stop) / row.stop) * 100 : null;
                  const width = room == null ? 0 : Math.max(0, Math.min(100, room));
                  return (
                    <tr key={row.symbol}>
                      <td><b>{row.symbol}</b><div className="muted">{row.since ? `since ${shortDay(row.since)}` : ""}</div></td>
                      <td className="r n">{row.qty}</td>
                      <td className="r n">{inr(row.avg, 2)}</td>
                      <td className="r n">{last ? inr(last, 2) : "—"}</td>
                      <td className="r n">{row.stop ? inr(row.stop, 2) : "—"}</td>
                      <td className="r">
                        {room == null ? "—" : (
                          <span className="room"><i><span className={room < 0 ? "down" : ""} style={{ width: `${width}%` }} /></i><span className="n">{room.toFixed(1)}%</span></span>
                        )}
                      </td>
                      <td className="r"><span className={`pnl-chip ${pnl >= 0 ? "up" : "down"}`}>{signed(pnl)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>
        <article className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2>Activity</h2>
            <div className="seg">
              {(["all", "orders", "skipped"] as const).map((item) => (
                <button key={item} type="button" data-tone={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "orders" ? "Orders" : "Skipped"}</button>
              ))}
            </div>
          </div>
          {activity.length === 0 && <p className="sub">Nothing yet today.</p>}
          {activity.slice(0, 8).map((row, index) => (
            <div className="act-line" key={`${row.symbol}-${row.date}-${index}`}>
              <time>{row.date ? shortDay(row.date) : ""}</time>
              <span className={`chip ${row.side === "BUY" ? "bought" : row.side === "SELL" ? "sold" : "dead"}`}>{row.side === "BUY" ? "Bought" : row.side === "SELL" ? "Sold" : "Skipped"}</span>
              <b>{row.symbol}</b>
              <span className="muted">{row.detail}</span>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
