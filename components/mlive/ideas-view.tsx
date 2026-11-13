"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { applyLivePrices, groupIdeas, summariseIdeas, type BuiltIdea, type IdeaStatus, type IdeaVerdict } from "@/lib/mlive/ideas";
import type { IdeasPayload } from "@/lib/mlive/ideas-load";
import type { PnlModel, PnlTrade } from "@/lib/mlive/pnl";
import { TradePanel } from "./trade-panel";

const STATUS_LABEL: Record<IdeaStatus, string> = {
  waiting_approval: "Waiting for you",
  approved: "Approved",
  working: "Working",
  bought: "Bought",
  skipped: "Skipped",
  not_decided: "Not decided yet",
  expired: "Expired",
};

const VERDICT_LABEL: Record<IdeaVerdict, string> = {
  bought_won: "Won",
  bought_lost: "Lost",
  skipped_dodged: "Dodged",
  skipped_missed: "Missed",
  skipped_neutral: "Neutral",
  too_early: "Too early",
};

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function scanLabel(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEK[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}`;
}

function money(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function tone(status: IdeaStatus): string {
  if (status === "waiting_approval") return "wait";
  if (status === "working" || status === "approved") return "work";
  if (status === "bought") return "bought";
  return "quiet";
}

function verdictClass(verdict: IdeaVerdict | null): string {
  if (verdict === "bought_won" || verdict === "skipped_dodged") return "profit";
  if (verdict === "bought_lost" || verdict === "skipped_missed") return "loss";
  return "quiet";
}

function BestWorst({ idea }: { idea: BuiltIdea }) {
  if (idea.maxUp == null && idea.maxDown == null) return <span className="muted">—</span>;
  return (
    <>
      {signedPct(idea.maxUp)}{" "}
      <span className={idea.maxDown != null && idea.maxDown < 0 ? "loss" : ""}>{signedPct(idea.maxDown)}</span>
    </>
  );
}

function MiniChart({ idea }: { idea: BuiltIdea }) {
  const values = idea.bars.flatMap((bar) => [bar.close, bar.ema20 ?? Number.NaN]).filter((value) => Number.isFinite(value));
  if (idea.stop != null) values.push(idea.stop);
  if (idea.livePrice != null) values.push(idea.livePrice);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const pad = (high - low) * 0.08 || 1;
  if (!idea.bars.length) return <p className="muted idea-chart empty">No price history yet.</p>;
  const last = idea.bars[idea.bars.length - 1]?.date;
  return (
    <div className="idea-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={idea.bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[low - pad, high + pad]} />
          <Line dataKey="close" stroke="var(--ink2)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
          {idea.strategy === "ema" && (
            <Line dataKey="ema20" stroke="var(--ema)" strokeDasharray="4 3" dot={false} strokeWidth={1.2} connectNulls isAnimationActive={false} />
          )}
          {idea.stop != null && <ReferenceLine y={idea.stop} stroke="var(--loss)" strokeDasharray="4 3" />}
          {idea.signalDate && <ReferenceDot x={idea.signalDate} y={idea.signalClose} r={3.5} fill="var(--ink)" stroke="none" />}
          {idea.livePrice != null && last && <ReferenceDot x={last} y={idea.livePrice} r={3.5} fill="var(--open)" stroke="none" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Facts({ idea }: { idea: BuiltIdea }) {
  return (
    <div className="idea-facts">
      {idea.facts.map((fact) => (
        <span key={fact.label} className="chip"><b>{fact.label}</b> {fact.value}</span>
      ))}
    </div>
  );
}

function PriceRow({ idea }: { idea: BuiltIdea }) {
  const risk = idea.riskPct == null ? null : idea.riskPct * 100;
  return (
    <div className="idea-prices">
      <span>signal {money(idea.signalClose)}</span>
      <span>stop {idea.stop == null ? "—" : money(idea.stop)}{risk == null ? "" : ` (−${Math.abs(risk).toFixed(1)}%)`}</span>
      {idea.quote === "pre-open" ? (
        <span>pre-open</span>
      ) : idea.quote === "live" ? (
        <span>live {idea.livePrice == null ? "—" : money(idea.livePrice)} <i>delayed</i></span>
      ) : null}
      {idea.quote === "live" && idea.distanceToStopPct != null && (
        <span className={`chip ${idea.aboveStop ? "bought" : "dead"}`}>
          {idea.aboveStop ? `${idea.distanceToStopPct.toFixed(1)}% above stop` : `${Math.abs(idea.distanceToStopPct).toFixed(1)}% through stop`}
        </span>
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  large,
  pending,
  onAct,
  onTrade,
}: {
  idea: BuiltIdea;
  large?: boolean;
  pending: { id: number; action: "approve" | "skip" } | null;
  onAct: (id: number, action: "approve" | "skip") => void;
  onTrade: (id: number) => void;
}) {
  const busy = pending?.id === idea.decisionId;
  return (
    <article className={`card idea-card ${tone(idea.status)} ${large ? "large" : ""}`}>
      <header className="idea-head">
        <div>
          <div className="symline">
            <b className="sym">{idea.symbol}</b>
            <span className={`chip strat-chip ${idea.strategy}`}>{idea.strategy === "ema" ? "EMA" : "RS"}</span>
            {idea.held && <span className="chip">Held</span>}
          </div>
          <div className="muted">{idea.sector || "—"}</div>
        </div>
        <span className="score n" title="Scanner score">{idea.score.toFixed(2)}</span>
      </header>
      <MiniChart idea={idea} />
      <PriceRow idea={idea} />
      {idea.sizing && (
        <p className="idea-size n">{idea.sizing.qty} shares · {money(idea.sizing.notional)} · risk {money(idea.sizing.risk)}</p>
      )}
      <Facts idea={idea} />
      <footer className="idea-foot">
        <p>{idea.sentence}</p>
        {idea.status === "bought" && idea.positionId != null && (
          <button type="button" className="btn tiny" onClick={() => onTrade(idea.positionId as number)}>See the trade</button>
        )}
      </footer>
      {large && idea.status === "waiting_approval" && idea.decisionId != null && (
        <div className="idea-acts">
          <button type="button" className="btn" disabled={pending != null} onClick={() => onAct(idea.decisionId as number, "skip")}>
            {busy && pending?.action === "skip" ? "Skipping…" : "Skip"}
          </button>
          <button type="button" className="btn primary" disabled={pending != null} onClick={() => onAct(idea.decisionId as number, "approve")}>
            {busy && pending?.action === "approve" && <span className="spin" aria-hidden="true" />}
            {busy && pending?.action === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      )}
    </article>
  );
}

type SortKey = "symbol" | "signal" | "after5" | "after10" | "after20" | "best" | "verdict";

function sortValue(idea: BuiltIdea, key: SortKey): number | string {
  if (key === "symbol") return idea.symbol;
  if (key === "signal") return idea.signalClose;
  if (key === "after5") return idea.after5 ?? -9999;
  if (key === "after10") return idea.after10 ?? -9999;
  if (key === "after20") return idea.after20 ?? -9999;
  if (key === "best") return idea.maxUp ?? -9999;
  return idea.verdict ?? "";
}

function csvOf(ideas: BuiltIdea[]): string {
  const header = ["Scan", "Valid for", "Symbol", "Strategy", "Signal", "Stop", "Status", "Reason", "+5d", "+10d", "+20d", "Best (high)", "Worst (low)", "Verdict"];
  const lines = ideas.map((idea) => [
    idea.scanDate,
    idea.validFor,
    idea.symbol,
    idea.strategy,
    idea.signalClose,
    idea.stop ?? "",
    idea.action,
    idea.reasonCode ?? "",
    idea.after5 ?? "",
    idea.after10 ?? "",
    idea.after20 ?? "",
    idea.maxUp ?? "",
    idea.maxDown ?? "",
    idea.verdict ? VERDICT_LABEL[idea.verdict] : "",
  ].map((cell) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  }).join(","));
  return [header.join(","), ...lines].join("\n");
}

export function IdeasView() {
  const [view, setView] = useState<"today" | "history">("today");
  const [strategy, setStrategy] = useState<"all" | "rs" | "ema">("all");
  const [span, setSpan] = useState<"7" | "30" | "all">("7");
  const [payload, setPayload] = useState<IdeasPayload | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ id: number; action: "approve" | "skip" } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "signal", dir: -1 });
  const [open, setOpen] = useState<number | null>(null);
  const [trade, setTrade] = useState<PnlTrade | null>(null);
  const [pnl, setPnl] = useState<PnlModel | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ view, strategy });
    if (view === "history") params.set("range", span);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/mlive/ideas?${params}`, { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const body = (await res.json()) as IdeasPayload;
          const symbols = [...new Set(body.ideas.filter((idea) => view === "today" || idea.positionOpen).map((idea) => idea.symbol))];
          if (symbols.length) {
            const quotes = await fetch(`/api/stocks/current-price?tickers=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
            if (quotes.ok && !cancelled) {
              const prices = (await quotes.json()) as Record<string, { price?: number; asOf?: string | null } | null>;
              const live: Record<string, { price: number | null; asOf: string | null }> = {};
              for (const symbol of symbols) {
                const quote = prices[symbol];
                const price = quote?.price;
                live[symbol] = {
                  price: price != null && price > 0 ? price : null,
                  asOf: quote?.asOf ?? null,
                };
              }
              body.ideas = applyLivePrices(body.ideas, live, { now: new Date(), today: body.today });
              body.summary = summariseIdeas(body.ideas);
            }
          }
          if (!cancelled) setPayload(body);
        } catch {
          if (!cancelled) setNote("Could not load ideas.");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, strategy, span, tick]);

  const groups = useMemo(() => groupIdeas(payload?.ideas ?? []), [payload]);
  const waiting = (payload?.ideas ?? []).filter((idea) => idea.status === "waiting_approval").sort((a, b) => b.score - a.score);
  const byDate = useMemo(() => {
    const dates = [...new Set((payload?.ideas ?? []).map((idea) => idea.scanDate))].sort((a, b) => b.localeCompare(a));
    return dates.map((date) => {
      const rows = (payload?.ideas ?? []).filter((idea) => idea.scanDate === date);
      const sorted = [...rows].sort((a, b) => {
        const left = sortValue(a, sort.key);
        const right = sortValue(b, sort.key);
        const cmp = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
        return cmp * sort.dir;
      });
      return {
        date,
        rs: rows.filter((idea) => idea.strategy === "rs").length,
        ema: rows.filter((idea) => idea.strategy === "ema").length,
        rows: sorted,
      };
    });
  }, [payload, sort]);

  async function act(id: number, action: "approve" | "skip") {
    if (pending) return;
    setPending({ id, action });
    const res = await fetch("/api/mlive/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision_id: id, action }),
    });
    setPending(null);
    if (res.ok) setTick((value) => value + 1);
    setNote(res.ok ? (action === "approve" ? "Approved. The next engine run sends it." : "Skipped.") : "Could not update that idea.");
  }

  async function openTrade(positionId: number) {
    let model = pnl;
    if (!model) {
      const res = await fetch("/api/mlive/pnl?range=all&strategy=all", { cache: "no-store" });
      if (!res.ok) {
        setNote("Could not open that trade.");
        return;
      }
      model = (await res.json()) as PnlModel;
      setPnl(model);
    }
    const match = model.trades.find((item) => item.id === positionId) ?? null;
    if (!match) {
      setNote("That trade is not in the report yet.");
      return;
    }
    setTrade(match);
  }

  function exportCsv() {
    const ideas = payload?.ideas ?? [];
    const blob = new Blob([csvOf(ideas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mansel-ideas.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "symbol" ? 1 : -1 });
  }

  if (!payload) return <p className="page">{note || "Loading ideas…"}</p>;
  const summary = payload.summary;
  const scanLine = view === "today" && payload.scanDate
    ? `Scan: ${scanLabel(payload.scanDate)} · valid for ${scanLabel(payload.validFor)}`
    : view === "history" && payload.from
      ? `Scans ${scanLabel(payload.from)} – ${scanLabel(payload.to)}`
      : "Every scan on record";

  return (
    <section className="page ideas-page">
      <div className="ideas-top">
        <div>
          <h1>Ideas</h1>
          <p className="sub">From last night&apos;s RS Resilience and EMA Pullback scans. The engine decides; you approve.</p>
          <p className="sub">{scanLine}</p>
          {note && <p className="sub" role="status">{note}</p>}
        </div>
        <div className="ideas-controls">
          <div className="seg" role="group" aria-label="Idea window">
            <button type="button" aria-pressed={view === "today"} onClick={() => setView("today")}>Today</button>
            <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>History</button>
          </div>
          <div className="seg" role="group" aria-label="Strategy">
            {(["all", "rs", "ema"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={strategy === item} onClick={() => setStrategy(item)}>
                {item === "all" ? "All" : item === "rs" ? "RS" : "EMA"}
              </button>
            ))}
          </div>
          {view === "history" && (
            <div className="seg" role="group" aria-label="Date range">
              {(["7", "30", "all"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={span === item} onClick={() => setSpan(item)}>
                  {item === "7" ? "7 days" : item === "30" ? "30 days" : "All"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === "today" && (
        <>
          <div className="idea-stats">
            <div className="card stat"><p className="lbl">Ideas</p><div className="v n">{summary.ideas}</div><div className="h">RS {summary.rs} · EMA {summary.ema}</div></div>
            <div className="card stat"><p className="lbl">Waiting for you</p><div className="v n">{summary.waiting}</div><div className="h">Proposed, not sent</div></div>
            <div className="card stat"><p className="lbl">Bought</p><div className="v n">{summary.bought}</div><div className="h">{summary.working} still working</div></div>
            <div className="card stat"><p className="lbl">Skipped</p><div className="v n">{summary.skipped}</div><div className="h">{summary.notDecided} not decided yet</div></div>
          </div>
          {waiting.length > 0 && (
            <div className="sec">
              <div className="sec-h"><h2>Waiting for you</h2></div>
              <div className="idea-wait">
                {waiting.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} large pending={pending} onAct={act} onTrade={(id) => void openTrade(id)} />
                ))}
              </div>
            </div>
          )}
          {payload.ideas.length === 0 ? (
            <div className="card idea-empty">
              <p>No ideas for today. The scanner found nothing that passed RS Resilience or EMA Pullback last night.</p>
              {payload.lastScan && <p className="muted">Last scan with ideas: {scanLabel(payload.lastScan.scanDate)}, valid for {scanLabel(payload.lastScan.validFor)}.</p>}
            </div>
          ) : (
            <div className="sec">
              <div className="sec-h"><h2>All ideas</h2></div>
              {groups.map((group) => (
                <div key={group.status} className="idea-group">
                  <h3>{STATUS_LABEL[group.status]} <span className="muted">{group.ideas.length}</span></h3>
                  <div className="idea-grid">
                    {group.ideas.map((idea) => (
                      <IdeaCard key={idea.id} idea={idea} pending={pending} onAct={act} onTrade={(id) => void openTrade(id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "history" && (
        <>
          <div className="idea-stats">
            <div className="card stat"><p className="lbl">Ideas</p><div className="v n">{summary.ideas}</div><div className="h">RS {summary.rs} · EMA {summary.ema}</div></div>
            <div className="card stat"><p className="lbl">Bought</p><div className="v n">{summary.bought}</div><div className="h">{summary.winRate == null ? "No closed result yet" : `${Math.round(summary.winRate * 100)}% won`}</div></div>
            <div className="card stat"><p className="lbl">Skipped</p><div className="v n">{summary.skipped}</div><div className="h">{summary.dodged} dodged · {summary.missed} missed · {summary.neutral} neutral</div></div>
            <div className="card stat">
              <p className="lbl">10 days later</p>
              <div className="v n">{summary.avgAfter10Bought == null ? "—" : signedPct(summary.avgAfter10Bought)}</div>
              <div className="h">Bought average. Skipped {summary.avgAfter10Skipped == null ? "—" : signedPct(summary.avgAfter10Skipped)}.</div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-h idea-table-h">
              <div>
                <h2>What happened next</h2>
                <p className="sub">A skip that fell is a dodge. A skip that ran is a miss.</p>
              </div>
              <button type="button" className="btn tiny" onClick={exportCsv} disabled={payload.ideas.length === 0}>Export CSV</button>
            </div>
            {payload.ideas.length === 0 && <p className="idea-empty">No ideas in this range.</p>}
            <div className="idea-desk">
              <table className="idea-table">
                <thead>
                  <tr>
                    {([
                      ["symbol", "Stock"],
                      ["signal", "Signal / stop"],
                      ["status", "What we did"],
                      ["after5", "+5d"],
                      ["after10", "+10d"],
                      ["after20", "+20d"],
                      ["best", "Best / worst (high / low)"],
                      ["verdict", "Verdict"],
                    ] as [SortKey | "status", string][]).map(([key, label]) => (
                      <th key={label} className={key === "best" ? "wrap" : undefined}>
                        {key === "status" ? label : (
                          <button type="button" className="sort" onClick={() => toggleSort(key)}>{label}</button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDate.map((group) => (
                    <Fragment key={group.date}>
                      <tr className="idea-day">
                        <td colSpan={8}>{scanLabel(group.date)} <span className="muted">RS {group.rs} · EMA {group.ema}</span></td>
                      </tr>
                      {group.rows.map((idea) => (
                        <Fragment key={idea.id}>
                          <tr className={open === idea.id ? "open" : ""} onClick={() => setOpen(open === idea.id ? null : idea.id)}>
                            <td>
                              <b>{idea.symbol}</b>
                              <span className={`chip strat-chip ${idea.strategy}`}>{idea.strategy === "ema" ? "EMA" : "RS"}</span>
                            </td>
                            <td className="n">{money(idea.signalClose)} <span className="muted">{idea.stop == null ? "—" : money(idea.stop)}</span></td>
                            <td><span className={`chip ${tone(idea.status)}`} title={idea.sentence}>{idea.action}</span></td>
                            <td className={`n ${idea.after5 != null && idea.after5 < 0 ? "loss" : idea.after5 ? "profit" : ""}`}>{signedPct(idea.after5)}</td>
                            <td className={`n ${idea.after10 != null && idea.after10 < 0 ? "loss" : idea.after10 ? "profit" : ""}`}>{signedPct(idea.after10)}</td>
                            <td className={`n ${idea.after20 != null && idea.after20 < 0 ? "loss" : idea.after20 ? "profit" : ""}`}>{signedPct(idea.after20)}</td>
                            <td className="n"><BestWorst idea={idea} /></td>
                            <td>{idea.verdict ? <span className={`chip ${verdictClass(idea.verdict)}`}>{VERDICT_LABEL[idea.verdict]}</span> : "—"}</td>
                          </tr>
                          {open === idea.id && (
                            <tr className="idea-expand">
                              <td colSpan={8}>
                                <MiniChart idea={idea} />
                                <Facts idea={idea} />
                                <p className="muted">{idea.sentence}</p>
                                {idea.positionId != null && (
                                  <button type="button" className="btn tiny" onClick={(event) => { event.stopPropagation(); void openTrade(idea.positionId as number); }}>See the trade</button>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="idea-mobile">
              {byDate.map((group) => (
                <div key={group.date}>
                  <h3>{scanLabel(group.date)} <span className="muted">RS {group.rs} · EMA {group.ema}</span></h3>
                  {group.rows.map((idea) => (
                    <article key={idea.id} className={`card idea-card ${tone(idea.status)}`}>
                      <header className="idea-head">
                        <div className="symline">
                          <b>{idea.symbol}</b>
                          <span className={`chip strat-chip ${idea.strategy}`}>{idea.strategy === "ema" ? "EMA" : "RS"}</span>
                          {idea.held && <span className="chip">Held</span>}
                          <span className={`chip ${tone(idea.status)}`} title={idea.sentence}>{idea.action}</span>
                        </div>
                        {idea.verdict && <span className={`chip ${verdictClass(idea.verdict)}`}>{VERDICT_LABEL[idea.verdict]}</span>}
                      </header>
                      <p className="n">Signal {money(idea.signalClose)} · stop {idea.stop == null ? "—" : money(idea.stop)}</p>
                      <p className="n idea-moves">+5d {signedPct(idea.after5)} · +10d {signedPct(idea.after10)} · +20d {signedPct(idea.after20)}</p>
                      <p className="n">{idea.maxUp == null && idea.maxDown == null ? <span className="muted">—</span> : <>Best / worst <BestWorst idea={idea} /></>}</p>
                      <button type="button" className="btn tiny" onClick={() => setOpen(open === idea.id ? null : idea.id)}>{open === idea.id ? "Hide chart" : "Show chart"}</button>
                      {open === idea.id && (
                        <>
                          <MiniChart idea={idea} />
                          <Facts idea={idea} />
                          <p className="muted">{idea.sentence}</p>
                        </>
                      )}
                      {idea.positionId != null && <button type="button" className="btn tiny" onClick={() => void openTrade(idea.positionId as number)}>See the trade</button>}
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <TradePanel trade={trade} onClose={() => setTrade(null)} />
    </section>
  );
}
