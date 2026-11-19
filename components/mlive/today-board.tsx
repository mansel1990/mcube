"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { istMinutes, isTradingDay } from "@/lib/mlive/calendar";
import { homeStatusPill } from "@/lib/mlive/rules";
import { decisionState, sendWindowState, type DecisionMode, type DecisionSide } from "@/lib/mlive/decision-state";
import { activityMark, auditPhrase, comingUp, failedJobs, indexedReturns, marketLine, relativeLabel, relativeTime, type PlannedDecision } from "@/lib/mlive/today-board";
import { CORE_SLEEVES } from "@/lib/mlive/core-sleeves";
import { inr, signed } from "./format";
import { ActionPill, ReasonHelp } from "./reason-help";
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
  maxOpen?: number;
  needsYou: Need[];
  holdings: Holding[];
  activity: { date: string | null; side: string; symbol: string; outcome: string; detail: string }[];
  spark: { date: string | null; value: number }[];
  longtermProposal?: LongtermProposalView | null;
};
type Bench = { periods?: { id: string; oursPct: number | null; niftyPct: number | null; diffPp: number | null; gainInr?: number | null }[] };
type SystemBody = { groups?: { steps: { mark: string }[] }[] };
type Book = { core: boolean; value: number; gain: number; moneyAdded: number; cash?: number; pending: { expiresOn: string | null } | null; nextCheck: string; holdings: { symbol: string; units: number; value: number }[] };
type Market = { phase?: string; nextSession?: string; niftyPct?: number | null };
type AuditRow = { action: string; ts: string; symbol: string | null };

function headingDate(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function shortWhen(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function niftyMove(closes: { date: string; close: number }[]): { close: number; pct: number | null } | null {
  const ordered = [...closes].filter((row) => row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const last = ordered.at(-1);
  const prev = ordered.at(-2);
  if (!last) return null;
  const pct = prev && prev.close > 0 ? (last.close / prev.close - 1) * 100 : null;
  return { close: last.close, pct };
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
  const [nextSession, setNextSession] = useState("");
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const first = data.spark.find((point) => point.date)?.date;
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/benchmark?book=swing").then(async (res) => { if (res.ok) setBench(await res.json() as Bench); });
      void fetch("/api/mlive/audit/daily").then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as Market;
        setMarketPhase(body.phase ?? null);
        setNextSession(body.nextSession ?? "");
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

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const apply = () => setPhone(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const mode: DecisionMode = data.state.status.startsWith("paused") ? "paused" : data.state.mode === "auto" ? "auto" : "approve";
  const kiteHealth = homeStatusPill({
    status: data.state.status,
    haltReason: data.state.haltReason,
    kiteConnected: data.kite.connected,
    resumedAt: null,
  });
  const minutes = istMinutes();
  const trading = marketPhase == null ? isTradingDay(data.today, new Set()) : marketPhase === "before" || marketPhase === "session";
  const sessionLabel = nextSession ? shortWhen(nextSession) : "";
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
  const index = niftyMove(nifty);
  const dayName = shortWhen(data.today).split(",")[0] || shortWhen(data.today);
  const ownerDecisions = mode === "auto" ? [] : data.needsYou;
  const activity = phone ? audit.slice(0, 3) : audit.slice(0, 5);
  const openCap = data.maxOpen && data.maxOpen > 0 ? data.maxOpen : null;

  return (
    <section className="page today-board">
      <header className="today-head">
        <div>
          <h1>{headingDate(data.today)}</h1>
          <p>{marketLine({ trading, minutes, nextSession: sessionLabel })}</p>
          {index && <p className="sub">Nifty {inr(index.close, 0)}{index.pct != null ? ` · ${index.pct >= 0 ? "+" : ""}${index.pct.toFixed(1)}%` : ""}</p>}
          {move.note && <p className="sub">{move.note}</p>}
        </div>
        <div className="health-capsules" aria-label="System health">
          {data.kite.connected ? (
            <span className="health-cap ok"><i aria-hidden="true" />{phone ? "Kite" : "Kite connected"}</span>
          ) : (
            <a className="health-cap bad" href="/api/mlive/kite/login">{kiteHealth.connect ? "Waiting for Kite login" : phone ? "Kite" : "Kite: log in"}</a>
          )}
          <span className={`health-cap ${mode === "auto" ? "auto" : mode === "paused" ? "paused" : "approve"}`}>
            {mode === "auto" ? <span aria-hidden="true">↻</span> : null}
            {mode === "auto" ? "Auto" : mode === "paused" ? "Paused" : "Approve"}
          </span>
          {jobs && failed > 0 ? <Link className="health-cap bad" href="/live-trade-mansel/audit">{`! ${failed} ${failed === 1 ? "job failed" : "jobs failed"}`}</Link> : null}
        </div>
      </header>
      {data.longtermProposal ? <LongtermProposalBanner proposal={data.longtermProposal} onDone={() => window.location.reload()} /> : null}
      {ownerDecisions.length > 0 && (
        <div className="card approval-card">
          {ownerDecisions.map((row) => {
            const view = decisionState({
              mode,
              side: (row.side === "SELL" ? "SELL" : "BUY") as DecisionSide,
              outcome: "proposed",
              sendWindow: sendWindowState(row.side === "SELL" ? "SELL" : "BUY", minutes),
              reason: row.text,
              ordered: row.sizing.qty,
            });
            const when = row.side === "SELL" ? "09:15" : "09:40";
            return (
              <div className={`approval-row ${view.tone}`} key={row.id}>
                <div>
                  <b>{row.symbol}</b>
                  <span>{row.sizing.qty ?? "—"} · {when}</span>
                  <p>{row.text}</p>
                </div>
                {view.explanation && view.explanation !== row.text ? <ReasonHelp text={view.explanation} label="Decision detail" /> : null}
                {view.allowApproval && (
                  <div className="approval-actions">
                    <button type="button" className="btn" disabled={pending != null} onClick={() => onAct(row.id, "skip")}>Reject</button>
                    <button type="button" className="btn primary" disabled={pending != null} onClick={() => onAct(row.id, "approve")}>Approve</button>
                  </div>
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
          {start?.gainInr != null && <p className={start.gainInr >= 0 ? "on-profit" : "on-loss"}>{signed(start.gainInr)} since start</p>}
          {start?.oursPct != null && <p className="since">{`${start.oursPct >= 0 ? "+" : ""}${start.oursPct.toFixed(1)}%`} since start</p>}
        </article>
        <div className="summary-scroll">
          <article className={`summary ${move.amount >= 0 ? "soft-profit" : "soft-loss"}`}>
            <p className="lbl">Today</p>
            <b className={move.amount >= 0 ? "up" : "down"}>{signed(move.amount)}{move.pct != null ? <span className="pct"> {move.pct >= 0 ? "+" : ""}{move.pct.toFixed(1)}%</span> : null}</b>
            {index?.pct != null && <p className="bench-line">Nifty {index.pct >= 0 ? "+" : ""}{index.pct.toFixed(1)}%</p>}
          </article>
          {month?.gainInr != null && (
            <article className={`summary ${month.gainInr >= 0 ? "soft-profit" : "soft-loss"}`}>
              <p className="lbl">This month</p>
              <b className={month.gainInr >= 0 ? "up" : "down"}>{signed(month.gainInr)}</b>
              {month.oursPct != null && <p>{`${month.oursPct >= 0 ? "+" : ""}${month.oursPct.toFixed(1)}%`}</p>}
              {month.niftyPct != null && <p className="bench-line">Nifty {month.niftyPct >= 0 ? "+" : ""}{month.niftyPct.toFixed(1)}%</p>}
            </article>
          )}
          {start?.diffPp != null && (
            <article className="summary bench">
              <p className="lbl">Versus Nifty 50</p>
              <b className={start.diffPp >= 0 ? "up" : "down"}>{relativeLabel(start.diffPp)}</b>
              {start.oursPct != null && start.niftyPct != null && <p className="bench-line">Us {start.oursPct.toFixed(1)}% · Nifty {start.niftyPct.toFixed(1)}%</p>}
            </article>
          )}
        </div>
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
          <div className="chart-legend">
            {chart.lines.map((line) => {
              const last = line.points.at(-1)?.pct;
              const name = line.id === "nifty" ? "Nifty" : line.id === "longgame" ? "Long Game" : "Swing";
              return <span key={line.id}><i className={`swatch ${line.id}`} />{name}{last != null ? ` ${last >= 0 ? "+" : ""}${last.toFixed(1)}%` : ""}</span>;
            })}
          </div>
        </article>
        {upcoming.length > 0 && (
          <article className="card">
            <div className="card-h"><h2>Coming up</h2></div>
            {upcoming.map((row) => (
              <div className="act-line coming" key={`${row.when}-${row.text}`}><time>{dayName} {row.when}</time><span>{row.text}</span></div>
            ))}
          </article>
        )}
      </div>
      <article className="card book-card swing">
        <div className="card-h">
          <h2>Swing positions <span className="chip">{data.holdings.length} open</span></h2>
          <Link href="/live-trade-mansel/swing">Open Swing</Link>
        </div>
        {data.holdings.length === 0 ? null : (
          <div className="positions">
            <div className="position-row position-head">
              <span>Stock</span><span>Strategy</span><span>Qty</span><span>Avg</span><span>Last</span><span>P&L</span><span>Stop</span><span>Days</span><span>Next</span>
            </div>
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
                  {next && <ActionPill label={next.label} text={next.explanation} tone={next.tone} />}
                </div>
              );
            })}
          </div>
        )}
      </article>
      <div className="today-lower">
        <SwingLimits invested={invested} free={data.engineCanUse} fund={data.fund && data.fund > 0 ? data.fund : data.tradingLimit} open={data.holdings.length} openCap={openCap} buys={data.trades.buys} maxBuys={data.trades.maxBuys} />
        {book && (book.value > 0 || book.core) && (
          <article className="card book-card longgame">
            <h2>Long Game</h2>
            <p>Money added {inr(book.moneyAdded)}</p>
            <p>{inr(book.value)} · <span className={book.gain >= 0 ? "up" : "down"}>{signed(book.gain)}</span></p>
            {CORE_SLEEVES.map((sleeve) => {
              const held = book.holdings.find((row) => row.symbol === sleeve.symbol);
              const now = book.value > 0 && held ? (held.value / book.value) * 100 : 0;
              return (
                <div key={sleeve.symbol} className="sleeve-row">
                  <span>{sleeve.name} {now.toFixed(0)}% / {sleeve.target}%</span>
                  <span className="alloc" aria-hidden="true"><i style={{ width: `${Math.min(100, now)}%` }} /><em style={{ left: `${sleeve.target}%` }} /></span>
                </div>
              );
            })}
            {book.pending ? <Link className="btn" href="/live-trade-mansel/long-term/suggestion">Review</Link> : <p className="sub">Next check {shortWhen(book.nextCheck)}</p>}
          </article>
        )}
        <article className="card activity-card">
          <h2>Recent activity</h2>
          {activity.map((row, index) => (
            <div className="act-line" key={`${row.action}-${row.ts}-${index}`}>
              <i className={`mark ${activityMark(row.action)}`} aria-hidden="true" />
              <span>{auditPhrase(row.action)}</span>
              <time>{relativeTime(row.ts)}</time>
            </div>
          ))}
          {audit.length === 0 && data.activity.slice(0, phone ? 3 : 5).map((row, index) => (
            <div className="act-line" key={`${row.symbol}-${index}`}>
              <i className={`mark ${row.side === "SELL" ? "loss" : "swing"}`} aria-hidden="true" />
              <span>{row.detail}</span>
            </div>
          ))}
        </article>
      </div>
      {!intradayOff && <p className="sub">Intraday stays on its own page.</p>}
    </section>
  );
}

function meterState(current: number, max: number | null): "open" | "cap" | "over" {
  if (max == null || max <= 0) return "open";
  if (current > max) return "over";
  if (current === max) return "cap";
  return "open";
}

function SwingLimits({
  invested,
  free,
  fund,
  open,
  openCap,
  buys,
  maxBuys,
}: {
  invested: number;
  free: number;
  fund: number;
  open: number;
  openCap: number | null;
  buys: number;
  maxBuys: number;
}) {
  const share = fund > 0 ? Math.min(100, (invested / fund) * 100) : null;
  const fundState = meterState(Math.round(invested), fund > 0 ? Math.round(fund) : null);
  const openState = meterState(open, openCap);
  const buyState = meterState(buys, maxBuys > 0 ? maxBuys : null);
  return (
    <article className="card swing-limits">
      <div className="card-h limit-head">
        <h2>Swing limits</h2>
        <b className="n">{inr(free)} free</b>
      </div>
      <p className="limit-invested"><b className="n">{inr(invested)} invested</b></p>
      {share != null && <p className="sub">{share.toFixed(0)}% of {inr(fund)} Swing fund</p>}
      {share != null && (
        <div className={`limit-meter ${fundState}`} role="meter" aria-valuemin={0} aria-valuemax={fund} aria-valuenow={Math.round(invested)} aria-label={`${inr(invested)} invested of ${inr(fund)} Swing fund`}>
          <i style={{ width: `${share}%` }} />
        </div>
      )}
      <div className="limit-tiles">
        <CapacityTile label="Open positions" current={open} max={openCap} state={openState} />
        <CapacityTile label="Buys today" current={buys} max={maxBuys > 0 ? maxBuys : null} state={buyState} />
      </div>
    </article>
  );
}

function CapacityTile({ label, current, max, state }: { label: string; current: number; max: number | null; state: "open" | "cap" | "over" }) {
  const width = max && max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const text = max == null ? String(current) : `${current} of ${max}`;
  return (
    <div className="limit-tile">
      <span>{label}</span>
      <b className="n">{text}</b>
      {max != null && (
        <div className={`limit-meter thin ${state}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} aria-label={`${label} ${text}`}>
          <i style={{ width: `${width}%` }} />
        </div>
      )}
    </div>
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
        const colour = line.id === "nifty" ? "var(--nifty)" : line.id === "longgame" ? "var(--longgame)" : "var(--swing)";
        return <polyline key={line.id} points={coords.join(" ")} fill="none" stroke={colour} strokeWidth="3" strokeDasharray={dash} />;
      })}
    </svg>
  );
}
