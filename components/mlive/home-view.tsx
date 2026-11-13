"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { activityFace, gttPrices, holdingExit, homeStatusPill } from "@/lib/mlive/rules";
import { greeting, inr, longDay, signed } from "./format";

function sinceLabel(iso: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = iso.split("-");
  const month = months[Number(parts[1]) - 1];
  if (!month || !parts[2]) return iso;
  return `${Number(parts[2])} ${month}`;
}

function markAt(value: number, low: number, high: number): number {
  if (!(high > low)) return 50;
  return Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
}

type Home = {
  today: string;
  displayName: string;
  state: { status: string; mode: string; haltReason: string | null; resumedAt: string | null; dryRun: boolean; drawdown: number; breakerPct: number };
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
  holdings: { id: number; symbol: string; strategy: string; qty: number; avg: number; stop: number; high: number; gtt: boolean; stopReason: string | null; sellProposed: boolean; since: string | null; frozen: boolean }[];
  ideas: { total: number; passed: number; picked: number; rows: { symbol: string; strategy: string; result: string; reason: string; raw?: string }[] };
  cashSkipped: boolean;
  kiteCashUnknown: boolean;
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string; qty: number; price: number }[];
  spark: { date: string | null; value: number }[];
};

const MODE: Record<string, string> = { approve: "Approve each", auto: "Fully automatic", paused: "Paused" };

export function HomeView() {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [recheckNote, setRecheckNote] = useState("");
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [pending, setPending] = useState<{ id: number; action: "approve" | "skip" } | null>(null);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const [actNote, setActNote] = useState("");

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
    if (pending) return;
    const symbol = data?.needsYou.find((row) => row.id === id)?.symbol ?? "that idea";
    setPending({ id, action });
    setActNote(action === "approve" ? `Approving ${symbol}…` : `Skipping ${symbol}…`);
    const res = await fetch("/api/mlive/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision_id: id, action }),
    });
    if (!res.ok) {
      setActNote(action === "approve" ? `Could not approve ${symbol}.` : `Could not skip ${symbol}.`);
      setPending(null);
      return;
    }
    setLeavingId(id);
    setActNote(action === "approve" ? `${symbol} approved.` : `${symbol} skipped.`);
    window.setTimeout(() => {
      setData((current) =>
        current ? { ...current, needsYou: current.needsYou.filter((row) => row.id !== id) } : current
      );
      setLeavingId(null);
      setPending(null);
    }, 280);
    void load();
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
  const statusPill = homeStatusPill({
    status: data.state.status,
    haltReason: data.state.haltReason,
    kiteConnected: data.kite.connected,
    resumedAt: data.state.resumedAt,
  });

  return (
    <section className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="lbl">{longDay(data.today)} · Market closes 15:30</p>
          <h1 style={{ marginTop: 6 }}>{greeting()}, {data.displayName}</h1>
        </div>
        <div className="pills">
          <span className={`pill ${statusPill.connect ? "warn" : ""}`}>
            <span className={data.state.status === "active" && !statusPill.connect ? "dot live" : "dot"} />
            <b>{statusPill.label}</b>
          </span>
          {statusPill.connect && <a className="btn tiny" href="/api/mlive/kite/login">Connect Kite</a>}
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
            <span className="muted" role="status" style={{ marginLeft: "auto", fontSize: 13 }}>{actNote || "Nothing is sent until you approve"}</span>
          </div>
          {data.needsYou.map((row) => {
            const busy = pending?.id === row.id;
            const leaving = leavingId === row.id;
            return (
              <div className={leaving ? "act leaving" : "act"} key={row.id} aria-busy={busy || leaving}>
                <span className={`side-tag ${row.side === "BUY" ? "buy" : "sell"}`}>{row.side}</span>
                <div className="what">
                  <b>{row.symbol} · {row.sizing.qty ?? "—"} shares{row.sizing.limit ? ` @ ${inr(row.sizing.limit, 2)}` : ""}{row.sizing.qty && row.sizing.limit ? ` · ${inr(row.sizing.qty * row.sizing.limit, 2)}` : ""}</b>
                  <div className="muted" title={row.raw || undefined}>{row.text}</div>
                  {data.state.dryRun && <div className="dry-tag">DRY RUN · no real orders</div>}
                </div>
                <button type="button" className="btn" onClick={() => act(row.id, "skip")} disabled={pending != null}>
                  {busy && pending.action === "skip" && <span className="spin" aria-hidden="true" />}
                  {busy && pending.action === "skip" ? "Skipping…" : "Skip"}
                </button>
                <button type="button" className="btn primary" onClick={() => act(row.id, "approve")} disabled={pending != null}>
                  {busy && pending.action === "approve" && <span className="spin" aria-hidden="true" />}
                  {busy && pending.action === "approve" ? "Approving…" : "Approve"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="sec">
        <div className="sec-h">
          <div>
            <h2>What we hold</h2>
          </div>
          <span className="pill"><span className={data.kite.matches ? "dot live" : "dot"} />{data.kite.matches ? "Matches Kite" : "Mismatch"}{data.kite.checkedAt ? ` · ${data.kite.checkedAt}` : ""}</span>
        </div>
        {data.holdings.length === 0 ? (
          <p className="muted">No system positions yet.</p>
        ) : (
          <div className="hold-grid">
            {data.holdings.map((row) => {
              const live = prices[row.symbol] ?? null;
              const ltp = live ?? row.avg;
              const pnl = (ltp - row.avg) * row.qty;
              const pct = row.avg ? (ltp / row.avg - 1) * 100 : 0;
              const up = pnl >= 0;
              const plan = holdingExit({ stop: row.stop, last: live, high52: row.high });
              const dayStop = row.stop > 0 ? gttPrices(row.stop, 0.03).trigger : 0;
              const scale = [dayStop, row.stop, live ?? 0, row.high].filter((value) => value > 0);
              const low = scale.length ? Math.min(...scale) : 0;
              const high = scale.length ? Math.max(...scale) : 0;
              const pad = (high - low) * 0.08;
              const tone = plan.underStop ? "under" : row.sellProposed ? "sell" : row.gtt ? "ok" : "wait";
              return (
                <article className={`card hold ${tone}`} key={row.symbol}>
                  <div className="t">
                    <div>
                      <div className="symline">
                        <span className="sym">{row.symbol}</span>
                        <span className="hold-tag">No target</span>
                      </div>
                      <div className="strat" title={row.strategy === "ema" ? "EMA Pullback" : "RS Resilience"}>
                        <i style={{ background: row.strategy === "ema" ? "var(--ema)" : "var(--rs)" }} />
                        {row.strategy === "ema" ? "EMA" : "RS"}
                        {row.since ? ` · ${sinceLabel(row.since)}` : ""}
                      </div>
                    </div>
                    <div className={`pnl-pill ${up ? "up" : "down"}`}>
                      <div className="v n">{signed(pnl)}</div>
                      <div className="p n">{pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="kv">
                    <div>Qty<b className="n">{row.qty}</b></div>
                    <div>Avg<b className="n">{inr(row.avg, 2)}</b></div>
                  </div>
                  {scale.length > 1 && (
                    <div className="hold-scale" aria-hidden="true">
                      <div className="track" />
                      {dayStop > 0 && <i className="mk day" style={{ left: `${markAt(dayStop, low - pad, high + pad)}%` }} />}
                      {row.stop > 0 && <i className="mk close" style={{ left: `${markAt(row.stop, low - pad, high + pad)}%` }} />}
                      {row.high > 0 && <i className="mk high" style={{ left: `${markAt(row.high, low - pad, high + pad)}%` }} />}
                      {live != null && <i className={`mk now ${live >= row.avg ? "up" : "down"}`} style={{ left: `${markAt(live, low - pad, high + pad)}%` }} />}
                    </div>
                  )}
                  <div className="marks">
                    <div title="Sells during the day"><i className="day" />Kite<b className="n down">{dayStop ? inr(dayStop, 2) : "—"}</b></div>
                    <div title="Sells if the close finishes below this"><i className="close" />Stop<b className={`n ${plan.underStop ? "down" : "warn"}`}>{row.stop ? inr(row.stop, 2) : "—"}</b></div>
                    <div><i className={live != null && live < row.avg ? "day" : "now"} />LTP<b className={`n ${live == null ? "" : live >= row.avg ? "up" : "down"}`}>{live ? inr(live, 2) : "—"}</b></div>
                    <div title="Not a sell price"><i className="high" />52w<b className="n">{row.high ? inr(row.high, 2) : "—"}</b></div>
                  </div>
                  {row.frozen ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn" onClick={() => markSold(row.symbol)}>Mark as sold manually</button>
                      <Link className="btn" href={`/live-trade-mansel/reports?symbol=${row.symbol}`}>Investigate</Link>
                    </div>
                  ) : row.sellProposed ? (
                    <span className="state s-act">Sell waiting</span>
                  ) : row.gtt ? (
                    <span className="state s-ok">Kite stop on</span>
                  ) : (
                    <span className="state s-warn" title={row.stopReason ?? undefined}>Kite stop off</span>
                  )}
                  {!row.frozen && !row.gtt && row.stopReason && <p className="stop-why">{row.stopReason}</p>}
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
          <div className="act-list">
            {data.activity.length === 0 && <p className="muted">Nothing bought or sold yet.</p>}
            {data.activity.map((row, i) => {
              const face = activityFace(row);
              const total = row.qty > 0 && row.price > 0 ? Math.round(row.qty * row.price * 100) / 100 : 0;
              return (
                <div key={`${row.symbol}-${row.date}-${i}`} className={`act ${face.tone}`}>
                  <span className="muted">{row.date}</span>
                  <div>
                    <div className="symline">
                      <b>{row.symbol}</b>
                      <span className={`chip ${face.tone === "buy" ? "bought" : face.tone === "sell" ? "sold" : "dead"}`}>{face.label}</span>
                      {row.outcome === "working" && <span className="state s-work">Working</span>}
                    </div>
                    <div className="muted">{row.detail}</div>
                  </div>
                  <span className="amt n" title={total ? `Total ${inr(total, 2)}` : undefined}>{total ? inr(total, 2) : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2>Last night&apos;s ideas</h2>
              <p className="sub">Copied from the paper scan. The engine decides.</p>
              <p className="sub" role="status">{recheckNote}</p>
              <Link href="/live-trade-mansel/ideas">See all ideas →</Link>
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
