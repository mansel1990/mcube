"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { greeting, inr, longDay, signed } from "./format";

type Home = {
  today: string;
  displayName: string;
  state: { status: string; mode: string; dryRun: boolean; drawdown: number; breakerPct: number };
  kite: { connected: boolean; at: string | null; checkedAt: string | null; matches: boolean };
  fund: number;
  tradingLimit: number;
  kiteCash: number | null;
  engineCanUse: number;
  cashNote: string;
  cash: number;
  invested: number;
  account: number;
  started: string | null;
  change: number;
  trades: { buys: number; sells: number; maxBuys: number; maxSells: number; waiting: number };
  fundUsed: number;
  needsYou: { id: number; side: string; symbol: string; text: string; raw?: string; sizing: { qty?: number; limit?: number } }[];
  holdings: { id: number; symbol: string; strategy: string; qty: number; avg: number; stop: number; high: number; gtt: boolean; sellProposed: boolean; since: string | null; frozen: boolean }[];
  ideas: { total: number; passed: number; picked: number; rows: { symbol: string; strategy: string; result: string; reason: string; raw?: string }[] };
  cashSkipped: boolean;
  kiteCashUnknown: boolean;
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string; qty: number; price: number }[];
  spark: { date: string | null; value: number }[];
};

const MODE: Record<string, string> = { approve: "Approve each", auto: "Fully automatic", paused: "Paused" };
const STATUS: Record<string, string> = {
  active: "Engine active",
  paused_by_user: "Paused",
  paused_by_breaker: "Breaker paused",
  halted_today: "Halted today",
};

export function HomeView() {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [recheckNote, setRecheckNote] = useState("");
  const [recheckBusy, setRecheckBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/mlive/home");
    if (!res.ok) {
      setError("The live book could not be loaded. Run the mlive migration if this is the first open.");
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

  async function markSold(symbol: string) {
    await fetch("/api/mlive/positions/sold", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    await load();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function act(id: number, action: "approve" | "skip") {
    await fetch("/api/mlive/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision_id: id, action }),
    });
    await load();
  }

  async function recheck() {
    setRecheckBusy(true);
    setRecheckNote("Asked the engine. It picks this up within a minute.");
    const res = await fetch("/api/mlive/recheck", { method: "POST" });
    const body = (await res.json().catch(() => null)) as { id?: number } | null;
    if (!res.ok || body?.id == null) {
      setRecheckNote("Could not ask for a re-check.");
      setRecheckBusy(false);
      return;
    }
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const poll = await fetch(`/api/mlive/recheck?id=${body.id}`);
      const status = (await poll.json().catch(() => null)) as { done?: boolean; doneAt?: string | null; rechecked?: number } | null;
      if (status?.done) {
        const at = status.doneAt
          ? new Date(status.doneAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" })
          : "";
        await load();
        setRecheckNote(`Re-checked at ${at}. ${status.rechecked ?? 0} ideas revived.`);
        setRecheckBusy(false);
        return;
      }
    }
    setRecheckNote("The engine hasn't picked it up yet. Check Reports → Audit.");
    setRecheckBusy(false);
  }

  async function pause() {
    await fetch("/api/mlive/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pause: true }),
    });
    await load();
  }

  if (error) return <p className="page">{error}</p>;
  if (!data) return <p className="page">Loading the book…</p>;
  const up = data.change >= 0;

  return (
    <section className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="lbl">{longDay(data.today)} · Market closes 15:30</p>
          <h1 style={{ marginTop: 6 }}>{greeting()}, {data.displayName}</h1>
        </div>
        <div className="pills">
          <span className="pill"><span className={data.state.status === "active" ? "dot live" : "dot"} /> <b>{STATUS[data.state.status] ?? data.state.status}</b></span>
          <span className="pill">Mode <b>{MODE[data.state.mode] ?? data.state.mode}</b></span>
          <span className="pill">Kite <b>{data.kite.connected ? `connected ${data.kite.at ?? ""}` : "not connected"}</b></span>
          <span className="pill">Breaker <b className="n">{data.state.drawdown.toFixed(1)}% / {data.state.breakerPct}%</b></span>
          {data.state.dryRun && <span className="pill">Dry run <b>on</b></span>}
          {data.state.status === "active" && <button type="button" className="btn" onClick={pause}>Pause</button>}
        </div>
      </div>

      <div className="hero">
        <div className="card main">
          <p className="lbl">Account value</p>
          <div className="big n">{inr(data.account)}</div>
          <div className={up ? "up" : "down"} style={{ marginTop: 10, fontWeight: 600 }}>
            {signed(data.change)}{data.fund ? ` · ${((data.change / data.fund) * 100).toFixed(2)}%` : ""} since start{data.started ? ` · ${data.started}` : ""}
          </div>
          <Spark values={data.spark.map((point) => point.value)} up={up} />
        </div>
        <div className="stats">
          <div className="card stat"><p className="lbl">Cash in Kite</p><div className="v n">{data.kiteCash == null ? "—" : inr(data.kiteCash)}</div><div className="h">{data.cashNote || "Live available equity cash"}</div></div>
          <div className="card stat"><p className="lbl">Trading limit</p><div className="v n">{inr(data.tradingLimit)}</div><div className="h">Grows with profit. The engine never uses more than this.</div></div>
          <div className="card stat"><p className="lbl">Engine can use now</p><div className="v n">{inr(data.engineCanUse)}</div><div className="h">{data.holdings.length} holdings · reserve held back</div></div>
          <div className="card stat"><p className="lbl">Trades today</p><div className="v n">{data.trades.buys}/{data.trades.maxBuys} · {data.trades.sells}/{data.trades.maxSells}</div><div className="h">{data.trades.waiting} waiting for you</div></div>
        </div>
      </div>

      {data.needsYou.length > 0 && (
        <div className="card actions">
          <div className="head">
            <h2>Needs you</h2>
            <span className="count">{data.needsYou.length}</span>
            <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>Nothing is sent until you approve</span>
          </div>
          {data.needsYou.map((row) => (
            <div className="act" key={row.id}>
              <span className={`side-tag ${row.side === "BUY" ? "buy" : "sell"}`}>{row.side}</span>
              <div className="what">
                <b>{row.symbol} · {row.sizing.qty ?? "—"} shares{row.sizing.limit ? ` @ ${inr(row.sizing.limit, 2)}` : ""}</b>
                <div className="muted" title={row.raw || undefined}>{row.text}</div>
                {data.state.dryRun && <div className="dry-tag">DRY RUN · no real orders</div>}
              </div>
              <button type="button" className="btn" onClick={() => act(row.id, "skip")}>Skip</button>
              <button type="button" className="btn primary" onClick={() => act(row.id, "approve")}>Approve</button>
            </div>
          ))}
        </div>
      )}

      <div className="sec">
        <div className="sec-h">
          <div>
            <h2>What we hold</h2>
            <p className="sub">Every holding has a GTT stop in Kite. Sold when the trend breaks on a daily close.</p>
          </div>
          <span className="pill"><span className={data.kite.matches ? "dot live" : "dot"} />{data.kite.matches ? "Matches Kite" : "Mismatch"}{data.kite.checkedAt ? ` · ${data.kite.checkedAt}` : ""}</span>
        </div>
        {data.holdings.length === 0 ? (
          <p className="muted">No system positions yet.</p>
        ) : (
          <div className="hold-grid">
            {data.holdings.map((row) => {
              const ltp = prices[row.symbol] ?? row.avg;
              const pnl = (ltp - row.avg) * row.qty;
              const pct = row.avg ? (ltp / row.avg - 1) * 100 : 0;
              const hi = Math.max(row.high, ltp, row.stop, row.avg);
              const lo = Math.min(row.stop || ltp, ltp, row.avg) * 0.99;
              const span = hi - lo || 1;
              const x = (value: number) => Math.max(0, Math.min(100, ((value - lo) / span) * 100));
              const above = row.stop ? ((ltp - row.stop) / ltp) * 100 : 0;
              return (
                <article className="card hold" key={row.symbol}>
                  <div className="t">
                    <div>
                      <div className="sym">{row.symbol}</div>
                      <div className="strat"><i style={{ background: row.strategy === "ema" ? "var(--ema)" : "var(--rs)" }} />{row.strategy === "ema" ? "EMA Pullback" : "RS Resilience"}{row.since ? ` · since ${row.since}` : ""}</div>
                    </div>
                    <div className="pnl">
                      <div className={`v n ${pnl >= 0 ? "up" : "down"}`}>{signed(pnl)}</div>
                      <div className={`p n ${pnl >= 0 ? "up" : "down"}`}>{pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="kv">
                    <div>Qty<b className="n">{row.qty}</b></div>
                    <div>Avg<b className="n">{inr(row.avg, 2)}</b></div>
                    <div>LTP<b className="n">{prices[row.symbol] ? inr(ltp, 2) : "—"}</b></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink3)" }}><span>Trend stop</span><span>52-wk high</span></div>
                    <div className="range" aria-label="Price between trend stop and 52-week high">
                      <div className="track" />
                      <div className="fill" style={{ left: `${x(row.stop)}%`, width: `${Math.max(0, x(ltp) - x(row.stop))}%`, background: ltp >= row.stop ? "var(--up)" : "var(--down)" }} />
                      <div className="mk" style={{ left: `${x(ltp)}%` }} />
                      <div className="ends n"><span>{row.stop ? inr(row.stop, 0) : "—"}</span><span>{hi ? inr(hi, 0) : "—"}</span></div>
                    </div>
                  </div>
                  {row.frozen ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn" onClick={() => markSold(row.symbol)}>Mark as sold manually</button>
                      <Link className="btn" href={`/live-trade-mansel/reports?symbol=${row.symbol}`}>Investigate</Link>
                    </div>
                  ) : (
                    <span className={row.sellProposed ? "state s-act" : "state s-ok"}>
                      {row.sellProposed ? "Sell proposed · needs you" : row.gtt ? `${above.toFixed(1)}% above stop · GTT active` : "GTT missing"}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="sec two">
        <div className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>What we bought & sold</h2>
            <Link href="/live-trade-mansel/reports">All activity →</Link>
          </div>
          <div style={{ padding: "0 20px 12px" }}>
            {data.activity.length === 0 && <p className="muted">Nothing bought or sold yet.</p>}
            {data.activity.map((row, i) => (
              <div key={`${row.symbol}-${row.date}-${i}`} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <span className="muted">{row.date}</span>
                <div><b>{row.symbol}</b><div className="muted">{row.detail}</div></div>
                <span className="n">{row.price ? inr(row.price, 2) : ""}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2>Last night&apos;s ideas</h2>
              <p className="sub">Copied from the paper scan. The engine decides.</p>
              <p className="sub" role="status">{recheckNote}</p>
            </div>
            {(data.cashSkipped || data.kiteCashUnknown) && (
              <button type="button" className="btn" onClick={recheck} disabled={recheckBusy} aria-busy={recheckBusy}>
                {recheckBusy && <span className="spin" aria-hidden="true" />}
                {recheckBusy ? "Re-checking…" : "Re-check cash now"}
              </button>
            )}
          </div>
          <div className="funnel">
            <div className="fstep"><div className="lbl">Ideas</div><div className="v n" style={{ fontSize: 22, fontWeight: 700 }}>{data.ideas.total}</div></div>
            <div className="fstep"><div className="lbl">Passed rules</div><div className="v n" style={{ fontSize: 22, fontWeight: 700 }}>{data.ideas.passed}</div></div>
            <div className="fstep"><div className="lbl">Picked</div><div className="v n" style={{ fontSize: 22, fontWeight: 700, color: "var(--brand)" }}>{data.ideas.picked}</div></div>
          </div>
          <table>
            <thead><tr><th>Stock</th><th>From</th><th>Result</th></tr></thead>
            <tbody>
              {data.ideas.rows.map((row) => (
                <tr key={`${row.strategy}-${row.symbol}`}>
                  <td><b>{row.symbol}</b></td>
                  <td><span className="strat"><i style={{ background: row.strategy === "ema" ? "var(--ema)" : "var(--rs)" }} />{row.strategy === "ema" ? "EMA" : "RS"}</span></td>
                  <td>
                    <span className={`chip ${row.result === "proposed" || row.result === "sent" ? "pick" : ""}`} title={row.raw || undefined}>{row.reason || row.result}</span>
                    {row.raw && <details><summary className="muted">Sizing</summary><div className="muted">{row.raw}</div></details>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 400;
    const y = 100 - ((value - min) / span) * 84;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join("L")}`;
  const colour = up ? "var(--up)" : "var(--down)";
  return (
    <svg className="spark" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L400,110L0,110Z`} fill={colour} opacity="0.16" />
      <path d={line} fill="none" stroke={colour} strokeWidth="2" />
    </svg>
  );
}
