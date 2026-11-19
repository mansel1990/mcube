"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { istMinutes, isTradingDay } from "@/lib/mlive/calendar";
import { decisionState, sendWindowState, type DecisionMode, type DecisionSide } from "@/lib/mlive/decision-state";
import { auditPhrase, comingUp, failedJobs, indexedReturns, marketLine, relativeLabel, type PlannedDecision } from "@/lib/mlive/today-board";
import { CORE_SLEEVES } from "@/lib/mlive/core-sleeves";
import { inr, signed } from "./format";
import { ReasonHelp } from "./reason-help";
import type { LongtermProposalView } from "./longterm-proposal-banner";
import { LongtermProposalBanner } from "./longterm-proposal-banner";

type Holding = {
  symbol: string;
  strategy: string;
  qty: number;
  avg: number;
  stop: number;
  since: string | null;
  sellProposed: boolean;
};
type Need = { id: number; side: string; symbol: string; text: string; sizing: { qty?: number; limit?: number } };
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
  needsYou: Need[];
  holdings: Holding[];
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string }[];
  spark: { date: string | null; value: number }[];
  longtermProposal?: LongtermProposalView | null;
};
type Bench = { periods?: { id: string; oursPct: number | null; niftyPct: number | null; diffPp: number | null }[] };
type SystemBody = { groups?: { steps: { mark: string }[] }[] };
type Book = { core: boolean; value: number; gain: number; moneyAdded: number; pending: { expiresOn: string | null } | null; nextCheck: string; holdings: { symbol: string; units: number; value: number }[] };
type AuditRow = { action: string; ts: string; symbol: string | null };

function toneClass(tone: string): string {
  if (tone === "loss") return "loss-pill";
  if (tone === "swing") return "swing-pill";
  if (tone === "profit") return "profit-pill";
  return "";
}

function headingDate(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function daysHeld(since: string | null, today: string): string {
  if (!since) return "—";
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  return String(Math.max(0, Math.round((end - start) / 86400000)));
}

export function TodayBoard({
  data,
  prices,
  pending,
  intradayOff,
  onAct,
}: {
  data: Home;
  prices: Record<string, number>;
  pending: { id: number; action: "approve" | "skip" } | null;
  intradayOff: boolean;
  onAct: (id: number, action: "approve" | "skip") => void;
}) {
  const [range, setRange] = useState<"1M" | "3M" | "All">("All");
  const [bench, setBench] = useState<Bench | null>(null);
  const [jobs, setJobs] = useState<SystemBody | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [nifty, setNifty] = useState<{ date: string; close: number }[]>([]);
  const [marketPhase, setMarketPhase] = useState<string | null>(null);

  useEffect(() => {
    const first = data.spark.find((point) => point.date)?.date;
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/benchmark?book=swing").then(async (res) => { if (res.ok) setBench(await res.json() as Bench); });
      void fetch("/api/mlive/audit/daily").then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { phase?: string };
        setMarketPhase(body.phase ?? null);
      });
      void fetch("/api/mlive/system").then(async (res) => { if (res.ok) setJobs(await res.json() as SystemBody); });
      void fetch("/api/mlive/long-game/book").then(async (res) => { if (res.ok) setBook(await res.json() as Book); });
      void fetch("/api/mlive/reports/audit?page=1").then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { rows?: AuditRow[] };
        setAudit((body.rows ?? []).slice(0, 5));
      });
      if (first) {
        void fetch(`/api/mlive/nifty?from=${first}&to=${data.today}`).then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as { closes?: { date: string; close: number }[] };
          setNifty(body.closes ?? []);
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data.spark, data.today]);

  const mode: DecisionMode = data.state.status.startsWith("paused") ? "paused" : data.state.mode === "auto" ? "auto" : "approve";
  const minutes = istMinutes();
  const trading = marketPhase == null ? isTradingDay(data.today, new Set()) : marketPhase === "before" || marketPhase === "session";
  const start = bench?.periods?.find((row) => row.id === "start");
  const month = bench?.periods?.find((row) => row.id === "month");
  const swingValue = data.account ?? data.books?.swing.capital ?? data.tradingLimit;
  const longValue = book?.core ? book.value : 0;
  const combined = swingValue + longValue;
  const move = data.todayMove ?? { beforeOpen: false, amount: 0, pct: null, note: null };
  const from = range === "1M" ? shift(data.today, 1) : range === "3M" ? shift(data.today, 3) : null;
  const chart = indexedReturns([
    { id: "swing", points: data.spark.flatMap((point) => point.date ? [{ date: point.date, value: point.value }] : []) },
    { id: "nifty", points: nifty.map((point) => ({ date: point.date, value: point.close })) },
  ], from);
  const plans: PlannedDecision[] = data.needsYou.map((row) => ({
    side: row.side === "SELL" ? "SELL" : "BUY",
    symbol: row.symbol,
    qty: row.sizing.qty ?? 0,
    reason: row.text,
    auto: mode === "auto",
  }));
  const upcoming = comingUp({ minutes, decisions: plans, longGameOn: book?.core === true });
  const failed = failedJobs((jobs?.groups ?? []).flatMap((group) => group.steps));
  const invested = data.holdings.reduce((sum, row) => sum + row.avg * row.qty, 0);
  const investedPct = data.tradingLimit > 0 ? Math.min(100, (invested / data.tradingLimit) * 100) : 0;

  return (
    <section className="page today-board">
      <header className="today-head">
        <div>
          <h1>{headingDate(data.today)}</h1>
          <p>{marketLine({ trading, minutes, nextSession: book?.nextCheck ?? "" })}</p>
          {move.note && <p className="sub">{move.note}</p>}
        </div>
        <div className="health-pills">
          <span className="chip">{data.kite.connected ? "Kite connected" : "Kite: log in"}</span>
          <span className="chip">{mode === "auto" ? "Auto mode" : mode === "paused" ? "Paused" : "Approve mode"}</span>
          {failed > 0 ? <Link className="chip loss-pill" href="/live-trade-mansel/audit">{failed} jobs failed</Link> : <span className="chip">Last night&apos;s jobs ok</span>}
        </div>
      </header>
      {data.longtermProposal ? <LongtermProposalBanner proposal={data.longtermProposal} onDone={() => window.location.reload()} /> : null}
      {data.needsYou.length > 0 && (
        <div className="card">
          {data.needsYou.map((row) => {
            const view = decisionState({
              mode,
              side: (row.side === "SELL" ? "SELL" : "BUY") as DecisionSide,
              outcome: "proposed",
              sendWindow: sendWindowState(row.side === "SELL" ? "SELL" : "BUY", minutes),
              reason: row.text,
              ordered: row.sizing.qty,
            });
            return (
              <div className="act-line" key={row.id}>
                <span className={`chip ${toneClass(view.tone)}`}>{view.label}</span>
                <b>{row.symbol}</b>
                <ReasonHelp text={view.explanation} />
                {view.allowApproval && (
                  <>
                    <button type="button" className="btn" disabled={pending != null} onClick={() => onAct(row.id, "skip")}>Reject</button>
                    <button type="button" className="btn primary" disabled={pending != null} onClick={() => onAct(row.id, "approve")}>Approve</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="summary-tiles">
        <article className="summary ink">
          <p className="lbl">All books</p>
          <b className="n">{inr(combined)}</b>
          {start?.oursPct != null && <p>{`${start.oursPct >= 0 ? "+" : ""}${start.oursPct.toFixed(1)}%`} since start</p>}
        </article>
        <article className="summary">
          <p className="lbl">Today</p>
          <b className={move.amount >= 0 ? "up" : "down"}>{signed(move.amount)}{move.pct != null ? ` · ${move.pct.toFixed(1)}%` : ""}</b>
        </article>
        <article className="summary">
          <p className="lbl">This month</p>
          <b>{month?.oursPct == null ? "—" : `${month.oursPct >= 0 ? "+" : ""}${month.oursPct.toFixed(1)}%`}</b>
          {month?.niftyPct != null && <p className="sub">Nifty {month.niftyPct.toFixed(1)}%</p>}
        </article>
        <article className="summary">
          <p className="lbl">vs Nifty 50 since start</p>
          <b>{relativeLabel(start?.diffPp ?? null) ?? "—"}</b>
          {start?.oursPct != null && start.niftyPct != null && <p className="sub">Us {start.oursPct.toFixed(1)}% · Nifty {start.niftyPct.toFixed(1)}%</p>}
        </article>
      </div>
      <div className="growth-row">
        <article className="card">
          <div className="card-h">
            <h2>Growth since start</h2>
            <div className="seg" role="group" aria-label="Chart range">
              {(["1M", "3M", "All"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
          </div>
          <GrowthChart lines={chart.lines} />
        </article>
        <article className="card">
          <div className="card-h"><h2>Coming up</h2></div>
          {upcoming.length === 0 ? null : upcoming.map((row) => (
            <div className="act-line coming" key={`${row.when}-${row.text}`}><time>{row.when}</time><span>{row.text}</span></div>
          ))}
        </article>
      </div>
      <article className="card book-card swing">
        <div className="card-h">
          <h2>Swing positions <span className="chip">{data.holdings.length} open</span></h2>
          <Link href="/live-trade-mansel/swing">Open Swing</Link>
        </div>
        {data.holdings.length === 0 ? null : (
          <div className="positions">
            {data.holdings.map((row) => {
              const last = prices[row.symbol];
              const pnl = ((last ?? row.avg) - row.avg) * row.qty;
              const pct = row.avg > 0 ? ((last ?? row.avg) / row.avg - 1) * 100 : 0;
              const sell = data.needsYou.find((item) => item.side === "SELL" && item.symbol === row.symbol);
              const next = row.sellProposed ? decisionState({ mode, side: "SELL", outcome: "proposed", sendWindow: sendWindowState("SELL", minutes), reason: sell?.text }) : null;
              return (
                <div className="position-row" key={row.symbol}>
                  <b>{row.symbol}</b>
                  <span className="desk">{row.strategy}</span>
                  <span className="desk n">{row.qty}</span>
                  <span className="desk n">{inr(row.avg, 2)}</span>
                  <span className="desk n">{last ? inr(last, 2) : "—"}</span>
                  <span className={pnl >= 0 ? "up" : "down"}>{signed(pnl)} · {pct.toFixed(1)}%</span>
                  <span className="desk">{row.stop ? inr(row.stop, 2) : "—"}</span>
                  <span className="desk">{daysHeld(row.since, data.today)}</span>
                  <span className="phone">{row.qty} × {last ? inr(last, 2) : "—"} · stop {row.stop ? inr(row.stop, 2) : "—"}</span>
                  {next && <span className={`chip ${toneClass(next.tone)}`}>{next.label}<ReasonHelp text={next.explanation} /></span>}
                </div>
              );
            })}
          </div>
        )}
      </article>
      <div className="today-lower">
        <article className="card">
          <h2>Swing limits</h2>
          <p>Invested {investedPct.toFixed(0)}% · {inr(invested)}</p>
          <div className="meter"><i style={{ width: `${investedPct}%` }} /></div>
          <p>Free cash {inr(data.engineCanUse)}</p>
          <p>Open positions {data.holdings.length}</p>
          <p>Buys today {data.trades.buys} of {data.trades.maxBuys}</p>
          <div className="meter"><i style={{ width: `${data.trades.maxBuys ? Math.min(100, (data.trades.buys / data.trades.maxBuys) * 100) : 0}%` }} /></div>
        </article>
        {book && (book.value > 0 || book.core) && (
          <article className="card book-card longgame">
            <h2>Long Game</h2>
            <p>{inr(book.value)} · {signed(book.gain)}</p>
            {CORE_SLEEVES.map((sleeve) => {
              const held = book.holdings.find((row) => row.symbol === sleeve.symbol);
              const now = book.value > 0 && held ? (held.value / book.value) * 100 : 0;
              return (
                <p key={sleeve.symbol}>{sleeve.name} {now.toFixed(0)}% / {sleeve.target}%</p>
              );
            })}
            {book.pending ? <Link href="/live-trade-mansel/long-term/suggestion">Review</Link> : <p className="sub">Next check {book.nextCheck}</p>}
          </article>
        )}
        <article className="card">
          <h2>Recent activity</h2>
          {audit.slice(0, 5).map((row, index) => (
            <div className="act-line" key={`${row.action}-${index}`}>
              <span className="chip">{row.symbol ?? "system"}</span>
              <span>{auditPhrase(row.action)}</span>
            </div>
          ))}
          {audit.length === 0 && data.activity.slice(0, 5).map((row, index) => (
            <div className="act-line" key={`${row.symbol}-${index}`}>
              <span className="chip">{row.symbol}</span>
              <span>{row.detail}</span>
            </div>
          ))}
        </article>
      </div>
      {!intradayOff && <p className="sub">Intraday stays on its own page.</p>}
    </section>
  );
}

function shift(iso: string, months: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 - months, date)).toISOString().slice(0, 10);
}

function GrowthChart({ lines }: { lines: { id: string; points: { date: string; pct: number }[] }[] }) {
  const width = 640;
  const height = 180;
  const all = lines.flatMap((line) => line.points);
  if (all.length < 2) return null;
  const min = Math.min(...all.map((point) => point.pct), 0);
  const max = Math.max(...all.map((point) => point.pct), 0);
  const span = max - min || 1;
  const dates = [...new Set(all.map((point) => point.date))].sort();
  return (
    <svg className="growth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Growth since the common start">
      {lines.map((line) => {
        const coords = line.points.map((point) => {
          const index = Math.max(0, dates.indexOf(point.date));
          const x = (index / Math.max(1, dates.length - 1)) * width;
          const y = height - ((point.pct - min) / span) * (height - 16) - 8;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const dash = line.id === "nifty" ? "6 4" : undefined;
        const colour = line.id === "nifty" ? "#B8B3A8" : "var(--swing)";
        return <polyline key={line.id} points={coords.join(" ")} fill="none" stroke={colour} strokeWidth="3" strokeDasharray={dash} />;
      })}
    </svg>
  );
}
