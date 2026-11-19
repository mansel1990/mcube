"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { istMinutes } from "@/lib/mlive/calendar";
import { useIntradayRetired } from "./capabilities";
import { LongGameResearch, RetiredStopped, SwingCanonical, type CanonicalRow } from "./research-dossier";
import { LoadError, PageSkeleton } from "./loading";
import { decisionById } from "@/lib/mlive/decision-registry";
import { ReasonHelp } from "./reason-help";
import { byQuarter, RESEARCH_STRATEGIES, type ResearchBook, type ResearchSample } from "@/lib/mlive/research-bar";
import {
  aboutGist,
  barFor,
  changeNote,
  dayMonth,
  duplicateBlock,
  heldbackQueueBlock,
  identityFromRun,
  makeIdentity,
  PARKED_RESEARCH,
  researchCardStatus,
  overlapPairs,
  runClock,
  sampleSpan,
  passRows,
  progressLine,
  queueBlock,
  rebaseToCapital,
  RESEARCH_RUNTIME,
  researchStartLine,
  readResearchSample,
  resultBand,
  storedHalfYears,
  robustnessLabel,
  runSummary,
  sortStrategies,
  strategyIdea,
  strategyName,
  variantName,
  type StoredRun,
} from "@/lib/mlive/research-page";

type Run = {
  id: number;
  book: string;
  sample: string;
  status: string;
  requestedAt: string | null;
  finishedAt: string | null;
  params: Record<string, unknown>;
  data: Record<string, unknown>;
  error: string;
  note: string;
  engineSha: string;
};

type Result = {
  strategy: string;
  params: Record<string, unknown>;
  paramsKey: string;
  isDefault: boolean;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  avgNetPct: number | null;
  worstDrawdownPct: number | null;
  halfYearsPct: number | null;
  cagrPct: number | null;
  passed: boolean;
  failReasons: string[];
  monthly: Record<string, unknown>;
  equity: unknown;
};

type Trade = {
  symbol: string;
  side: string;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  qty: number;
  net: number;
  netPct: number;
  exitReason: string;
};

type Payload = {
  engineSha: string;
  lastCandle: string;
  benchmark: { date: string; close: number }[];
  runs: Run[];
  run: Run | null;
  results: Result[];
  overlap: { a: string; b: string; overlap: number }[];
  live: { strategy: string; trades: number; avgNet: number | null; since: string | null }[];
  building: { strategy: string; avgNetPct: number | null }[];
  heldback: { strategy: string; at: string | null }[];
  strategiesEnabled: string[];
  canonical?: CanonicalRow[];
  retiredIntraday?: string | null;
  error?: string;
};

function swingEvidence(payload: Payload): CanonicalRow[] {
  const listed = payload.canonical ?? [];
  if (listed.some((row) => row.strategy === "momentum")) return listed;
  if (payload.run?.sample !== "heldback") return listed;
  const momentum = payload.results.find((row) => row.strategy === "momentum");
  if (!momentum || !payload.run) return listed;
  const variant = typeof momentum.params.variant === "string" ? momentum.params.variant : "M10-6";
  return [...listed, {
    id: payload.run.id,
    strategy: momentum.strategy,
    variant,
    profitFactor: momentum.profitFactor,
    trades: momentum.trades,
    halfYearsPct: momentum.halfYearsPct,
    worstDrawdownPct: momentum.worstDrawdownPct,
    avgNetPct: momentum.avgNetPct,
    cagrPct: momentum.cagrPct,
    window: "",
  }];
}

export function ResearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const intradayOff = useIntradayRetired();
  const requested = params.get("book");
  const product: "swing" | "longterm" = requested === "longterm" ? "longterm" : "swing";
  const book: ResearchBook = product === "longterm" ? "swing" : (!intradayOff && requested === "intraday" ? "intraday" : "swing");
  const runRaw = params.get("run");
  const runId = runRaw && Number.isFinite(Number(runRaw)) ? Number(runRaw) : null;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([...RESEARCH_STRATEGIES.swing]);
  const [sample, setSample] = useState<ResearchSample>("building");
  const [confirmHeldback, setConfirmHeldback] = useState(false);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [reasons, setReasons] = useState<{ reason: string; n: number }[]>([]);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState("");
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPicked([...RESEARCH_STRATEGIES[book]]);
    setSample("building");
    setConfirmHeldback(false);
    setGrid(true);
    setStrategy(null);
    setOpen(false);
    setMenu(false);
  }, [book]);

  useEffect(() => {
    if (product === "longterm") {
      setRunLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ book, benchmark: "1" });
      if (runId) query.set("run", String(runId));
      void fetch(`/api/mlive/research?${query}`)
        .then(async (res) => {
          if (cancelled) return;
          const body = (await res.json()) as Payload;
          if (!res.ok) {
            setError(body.error || "Research could not be loaded.");
            setPayload(null);
            setRunLoading(false);
            return;
          }
          setError(null);
          if (!runId) {
            const preferred = body.runs.find((run) => run.status === "ok") ?? body.run;
            if (preferred && body.run && preferred.id !== body.run.id) {
              setRunLoading(true);
              router.replace(`/live-trade-mansel/research?book=${book}&run=${preferred.id}`, { scroll: false });
              return;
            }
          }
          setPayload(body);
          setRunLoading(false);
          if (body.run && (!runId || !body.runs.some((run) => run.id === runId))) {
            setRunLoading(true);
            router.replace(`/live-trade-mansel/research?book=${book}&run=${body.run.id}`, { scroll: false });
          }
        })
        .catch(() => {
          if (cancelled) return;
          setError("Research could not be loaded.");
          setRunLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [product, book, runId, tick, router]);

  const active = (payload?.runs ?? []).find((run) => run.status === "queued" || run.status === "running") ?? null;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [active]);

  const variantRun = stringsOf(payload?.run?.params.variants).length > 0;
  const defaults = variantRun ? (payload?.results ?? []) : (payload?.results ?? []).filter((row) => row.isDefault);
  const selected = defaults.find((row) => resultKey(row) === strategy) ?? null;
  const settings = selected ? (payload?.results ?? []).filter((row) => row.strategy === selected.strategy) : [];
  const runSample = readResearchSample(payload?.run?.sample);
  const bar = barFor(book, payload?.run ? runSample : "building");
  const span = paramsWindow(payload?.run?.params);
  const quarters = span ? byQuarter(book, span.from, span.to) : book === "intraday";
  const held = new Map((payload?.heldback ?? []).map((row) => [row.strategy, row.at]));
  const cards = sortStrategies(defaults.map((row) => ({
    ...row,
    name: typeof row.params.variant === "string" ? variantName(row.params.variant) : strategyName(row.strategy),
    variantId: typeof row.params.variant === "string" ? row.params.variant : null,
    band: resultBand(row.passed, row.failReasons.length),
  })));
  const enabled = payload?.strategiesEnabled ?? [];
  const stored = storedRuns(payload?.runs ?? []);
  const proposal = payload
    ? makeIdentity({ book, sample, strategies: picked, grid, engineSha: payload.engineSha, lastCandle: payload.lastCandle })
    : null;
  const duplicate = proposal ? duplicateBlock(proposal, stored, false) : null;
  const queuedSame = proposal ? queueBlock(proposal, stored) : null;
  const changed = proposal && !duplicate ? changeNote(proposal, stored) : null;
  const blockReason = duplicate || queuedSame || (picked.length === 0 ? "Pick at least one strategy." : null) || heldbackQueueBlock(sample, confirmHeldback);
  const minutes = istMinutes();
  const moving = active ? progressLine(active.status, progressOf(active.data), minutes) : null;
  const noCandles = payload?.run?.status === "ok" && Number(payload.run.data.symbols ?? 0) === 0;
  const showCards = Boolean(payload && payload.runs.length > 0 && !noCandles && payload.run?.status === "ok" && cards.length > 0);

  useEffect(() => {
    if (!payload?.run || !selected) return;
    const query = new URLSearchParams({
      run: String(payload.run.id),
      strategy: selected.strategy,
      params: selected.paramsKey,
      page: String(page),
    });
    if (symbol.trim()) query.set("symbol", symbol.trim().toUpperCase());
    if (result) query.set("result", result);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/research/trades?${query}`).then(async (res) => {
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as { rows: Trade[]; total: number; reasons: { reason: string; n: number }[] };
        setTrades(body.rows ?? []);
        setTradeTotal(body.total ?? 0);
        setReasons(body.reasons ?? []);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload?.run, selected, page, symbol, result]);

  const closeDetail = useCallback(() => setStrategy(null), []);

  useEffect(() => {
    if (!menu) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function chooseBook(next: "swing" | "longterm") {
    if (next === product) return;
    if (next === "swing") setRunLoading(true);
    const query = new URLSearchParams();
    query.set("book", next);
    if (next === "swing" && runId) query.set("run", String(runId));
    router.replace(`/live-trade-mansel/research?${query}`, { scroll: false });
  }

  function onTabs(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    chooseBook(product === "swing" ? "longterm" : "swing");
  }

  function chooseRun(id: number) {
    if (id === payload?.run?.id) {
      setMenu(false);
      return;
    }
    setStrategy(null);
    setPage(1);
    setMenu(false);
    setRunLoading(true);
    router.replace(`/live-trade-mansel/research?book=${book}&run=${id}`, { scroll: false });
  }

  function chooseSample(next: ResearchSample) {
    setSample(next);
    if (next === "heldback") {
      setConfirmHeldback(false);
      setPicked((current) => current.filter((name) => !held.has(name)));
      return;
    }
    setConfirmHeldback(false);
  }

  async function startRun() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mlive/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book, strategies: picked, sample, grid, confirmHeldback: sample === "heldback" && confirmHeldback }),
    });
    const body = (await res.json()) as { error?: string; id?: number };
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "The backtest was not queued.");
      return;
    }
    setOpen(false);
    if (body.id) chooseRun(body.id);
    else setTick((value) => value + 1);
  }

  const summary = payload?.run
    ? runSummary({
        id: payload.run.id,
        at: payload.run.finishedAt ?? payload.run.requestedAt,
        from: span?.from ?? null,
        to: span?.to ?? null,
        sample: payload.run.sample,
        symbols: Number(payload.run.data.symbols ?? 0),
      })
    : "";

  return (
    <section className="page">
      <div className="page-head">
        <h1>Research</h1>
        <div className="research-tabs" role="tablist" aria-label="Research book" onKeyDown={onTabs}>
          <button type="button" role="tab" id="research-tab-swing" aria-selected={product === "swing"} aria-controls="research-panel" onClick={() => chooseBook("swing")}><i className="book-dot swing" aria-hidden="true" /> Swing</button>
          <button type="button" role="tab" id="research-tab-longterm" aria-selected={product === "longterm"} aria-controls="research-panel" onClick={() => chooseBook("longterm")}><i className="book-dot longgame" aria-hidden="true" /> Long Game</button>
        </div>
      </div>

      {product === "swing" && !payload && !error && <PageSkeleton kind="research" label="Loading research" />}
      {product === "swing" && !payload && error && <LoadError message={error} onRetry={() => { setError(null); setTick((value) => value + 1); }} />}

      <div className="research-stack">
      <div id="research-panel" role="tabpanel" aria-labelledby={product === "swing" ? "research-tab-swing" : "research-tab-longterm"}>
        {product === "longterm" ? <LongGameResearch /> : payload ? <SwingCanonical rows={swingEvidence(payload)} /> : null}
      </div>
      {product === "swing" && payload && (
      <>
      <article className="card research-archive">
        <header className="archive-bar">
          <div className="archive-title">
            <h2>Research archive</h2>
            {(payload.runs.length ?? 0) > 0 && (
              <span className="earlier-wrap" ref={menuRef}>
                <button type="button" className="earlier" aria-expanded={menu} aria-haspopup="listbox" disabled={runLoading} onClick={() => setMenu((value) => !value)}>
                  <span className="kicker">Earlier runs</span>
                  <span>Run {payload.run?.id}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                {menu && (
                  <div className="earlier-menu" role="listbox" aria-label="Earlier runs">
                    {payload.runs.map((run) => {
                      const option = runOption(run);
                      return (
                        <button type="button" key={run.id} role="option" disabled={runLoading} aria-selected={run.id === payload.run?.id} className={run.id === payload.run?.id ? "on" : undefined} onClick={() => chooseRun(run.id)}>
                          <span className="row">
                            <b>Run {run.id}</b>
                            <span className={`chip ${option.tone}`}>{option.status}</span>
                          </span>
                          <span className="detail">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </span>
            )}
          </div>
          {summary && <p className="sub">{summary}</p>}
          <div className="archive-tools">
            {payload.run?.status === "ok" && (
              <button type="button" className={`chip about-chip${about ? " on" : ""}`} aria-expanded={about} onClick={() => { setAbout((value) => !value); setOpen(false); }}>About this run</button>
            )}
            <button type="button" className={`btn new-run${open ? " on" : ""}`} aria-expanded={open} disabled={Boolean(active) || busy} title={moving ?? undefined} onClick={() => { setOpen((value) => !value); setAbout(false); setMenu(false); }}>New run</button>
          </div>
        </header>
        {about && payload.run?.status === "ok" && (
          <div className="about-pop">
            {aboutGist({
              book,
              sample: runSample,
              window: span,
              strategies: stringsOf(payload.run.params.strategies),
              capital: objectOf(payload.run.params.capital),
            }).map((bit) => (
              <div key={bit.id} className={`about-bit ${bit.id.toLowerCase()}`}>
                <span className="tag">{bit.label}</span>
                <span>{bit.text}</span>
              </div>
            ))}
          </div>
        )}
        {moving && <p className="sub research-progress">{moving}</p>}
      {intradayOff && payload?.retiredIntraday && (
        <details className="card" style={{ marginTop: 16 }}>
          <summary>Retired</summary>
          <p>{payload.retiredIntraday}</p>
        </details>
      )}

      {runLoading && <p className="run-switch-status" role="status">Reading the selected run…</p>}

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal run-sheet" role="dialog" aria-modal="true" aria-labelledby="new-run-title" onClick={(event) => event.stopPropagation()}>
            <header className="run-sheet-head">
              <div>
                <h2 id="new-run-title">New run</h2>
                <p>Choose the sample, then the strategies to test.</p>
              </div>
              <button type="button" className="story-close" onClick={() => setOpen(false)}>Close</button>
            </header>
            <div className="sample-picks">
              <button type="button" aria-pressed={sample === "building"} onClick={() => chooseSample("building")}>
                <b>Building</b>
                <span>Try an idea before a sealed test.</span>
              </button>
              <button type="button" aria-pressed={sample === "heldback"} onClick={() => chooseSample("heldback")}>
                <b>Held-back</b>
                <span>One sealed sample. Confirm it before it runs.</span>
              </button>
            </div>
            {sample === "heldback" && (
              <label className="held-confirm">
                <input type="checkbox" checked={confirmHeldback} onChange={() => setConfirmHeldback((value) => !value)} />
                Confirm held-back
              </label>
            )}
            <p className="run-label">Strategies</p>
            <div className="strategy-picks">
              {RESEARCH_STRATEGIES[book].map((name) => {
                const used = sample === "heldback" ? held.get(name) : undefined;
                const on = picked.includes(name);
                return (
                  <button
                    type="button"
                    key={name}
                    className={on ? "on" : undefined}
                    aria-pressed={on}
                    disabled={Boolean(used)}
                    onClick={() => setPicked((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])}
                  >
                    <b>{strategyName(name)}</b>
                    <span>{used ? `Held-back used on ${dayMonth(used)}` : on ? "Included" : "Leave out"}</span>
                  </button>
                );
              })}
            </div>
            {[...held.entries()]
              .filter(([name]) => !(RESEARCH_STRATEGIES[book] as readonly string[]).includes(name))
              .map(([name, at]) => (
                <p key={name} className="sub">{variantName(name)} · Held-back used on {dayMonth(at)}</p>
              ))}
            <label className="held-confirm">
              <input type="checkbox" checked={grid} onChange={() => setGrid((value) => !value)} />
              Settings range
            </label>
            <p className="sub">{researchStartLine(minutes)}. {RESEARCH_RUNTIME}</p>
            {changed && <p className="sub">{changed}</p>}
            {blockReason && <p className="run-block">{blockReason}</p>}
            <div className="approval-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={busy || Boolean(blockReason) || Boolean(active)} onClick={() => void startRun()}>
                {busy ? "Queuing…" : "Queue run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="sub" style={{ color: "var(--down)" }}>{error}</p>}
      {noCandles && <p className="sub">No candles for this series. The backtest did not call Kite.</p>}
      {payload?.run?.status === "error" && <p className="sub" style={{ color: "var(--down)" }}>{payload.run.error || "The run failed."}</p>}
      </article>

      {showCards && (
        <div className="research-grid">
          {cards.map((row) => {
            const fund = Number(objectOf(payload?.run?.params.capital).fund);
            const halves = span ? storedHalfYears(equityPoints(row.equity), fund, span.from, span.to) : null;
            const status = researchCardStatus(book, row.strategy, row.variantId, enabled);
            const diagnostic = runSample === "diagnostic";
            const tests = passRows({
              profitFactor: row.profitFactor,
              trades: row.trades,
              halfYearsPct: halves ? halves.pct : row.halfYearsPct,
              halfYearLabel: halves?.label,
              worstDrawdownPct: row.worstDrawdownPct,
              avgNetPct: row.avgNetPct,
              bar,
              quarters,
            });
            const others = (payload?.results ?? []).filter((item) => item.strategy === row.strategy && !item.isDefault).map((item) => item.profitFactor);
            return (
              <article
                key={resultKey(row)}
                className={`card research-card${strategy === resultKey(row) ? " on" : ""}`}
                role="button"
                tabIndex={0}
                aria-expanded={strategy === resultKey(row)}
                onClick={() => { setStrategy(resultKey(row)); setPage(1); setSymbol(""); setResult(""); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setStrategy(resultKey(row));
                  setPage(1);
                }}
              >
                <div className="card-top">
                  <div>
                    <b>{row.name}</b>
                    {row.variantId && <div className="muted">{row.variantId}</div>}
                    {runSample === "heldback" && (payload?.run?.finishedAt || payload?.run?.requestedAt) && (
                      <div className="muted">Held-back used on {dayMonth(payload.run.finishedAt ?? payload.run.requestedAt)}</div>
                    )}
                    <div className="idea">{strategyIdea(row.strategy)}</div>
                  </div>
                  <div className="research-pills">
                    {diagnostic ? <span className="chip quiet">Diagnostic</span> : status === "Live pilot" ? (
                      <ReasonHelp className="chip pilot-chip" text={decisionById("swing:momentum:M10-6")?.explanation ?? ""} label="Live pilot">
                        <span className="pilot-mark" aria-hidden="true" />
                        Live pilot
                      </ReasonHelp>
                    ) : status ? <span className={`chip ${status === PARKED_RESEARCH ? "wait" : "live"}`}>{status}</span> : (
                      <span className={`chip ${row.band === "passed" ? "ok" : row.band === "close" ? "wait" : "bad"}`}>
                        {row.band === "passed" ? "Passed" : row.band === "close" ? "Close" : "Failed"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="pass-rows">
                  {diagnostic ? <div>No official pass or fail. A good diagnostic result is not evidence for live trading.</div> : tests.map((test) => <div key={test.id} className={test.pass ? "ok" : "fail"}>{test.text}</div>)}
                </div>
                {halves?.incomplete && <span className="muted">{halves.incomplete}</span>}
                <div>
                  <span className="lbl">Annualized backtest return (CAGR)</span>
                  <div className={`research-cagr n ${row.cagrPct != null && row.cagrPct < 0 ? "down" : ""}`}>{row.cagrPct == null ? "—" : `${row.cagrPct.toFixed(1)}%`}</div>
                  <span className="muted">Starting capital ₹80,000 · Avg net {row.avgNetPct == null ? "—" : `${row.avgNetPct.toFixed(2)}%`} · {row.trades} trades</span>
                </div>
                <Spark points={equityPoints(row.equity)} />
                <span className="muted">{robustnessLabel(row.profitFactor, others, bar.profitFactor)}</span>
              </article>
            );
          })}
        </div>
      )}

      {showCards && !variantRun && (
        <OverlapBlock rows={cards.map((row) => ({ strategy: row.strategy, name: row.name, band: row.band }))} cells={payload?.overlap ?? []} />
      )}

      {selected && payload?.run && (
        <StrategyDetail
          row={selected}
          grid={settings}
          series={rebaseToCapital(equityPoints(selected.equity), payload.benchmark ?? [], Number(objectOf(payload.run.params.capital).fund) || 80000)}
          monthly={monthlyPoints(selected.monthly)}
          trades={trades}
          reasons={reasons}
          total={tradeTotal}
          page={page}
          symbol={symbol}
          result={result}
          liveNote={liveSentence(selected.strategy, payload.live.find((item) => item.strategy === selected.strategy), payload.building.find((item) => item.strategy === selected.strategy)?.avgNetPct ?? null)}
          onSymbol={setSymbol}
          onResult={(value) => { setResult(value); setPage(1); }}
          onPage={setPage}
          onClose={closeDetail}
          csvHref={`/api/mlive/research/trades?run=${payload.run.id}&strategy=${selected.strategy}&params=${encodeURIComponent(selected.paramsKey)}&format=csv`}
        />
      )}
      </>
      )}
      <div id="research-evidence">
        <RetiredStopped />
      </div>
      </div>
    </section>
  );
}

function OverlapBlock({ rows, cells }: { rows: { strategy: string; name: string; band: "passed" | "close" | "failed" }[]; cells: { a: string; b: string; overlap: number }[] }) {
  const pairs = overlapPairs(rows, cells);
  if (pairs.length === 0) return null;
  return (
    <article className="card gist">
      <div className="gist-head">
        <h2>Do they lose on the same days?</h2>
        <span className="gist-note">Under 50% is better for a pair.</span>
      </div>
      <div className="pair-list">
        {pairs.map((pair) => (
          <div key={`${pair.left}-${pair.right}`} className={`pair ${pair.high <= 50 ? "ok" : "warn"}`}>
            <span className="names">{pair.left} <span className="x">and</span> {pair.right}</span>
            <span className="share n">{pair.share}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function StrategyDetail(props: {
  row: Result;
  grid: Result[];
  series: { date: string; portfolio: number; nifty: number | null }[];
  monthly: { month: string; value: number }[];
  trades: Trade[];
  reasons: { reason: string; n: number }[];
  total: number;
  page: number;
  symbol: string;
  result: string;
  liveNote: string | null;
  onSymbol: (value: string) => void;
  onResult: (value: string) => void;
  onPage: (value: number) => void;
  onClose: () => void;
  csvHref: string;
}) {
  const { onClose } = props;
  const variantId = typeof props.row.params.variant === "string" ? props.row.params.variant : null;
  const title = variantId ? variantName(variantId) : strategyName(props.row.strategy);
  const pages = Math.max(1, Math.ceil(props.total / 40));
  const hasNifty = props.series.some((point) => point.nifty != null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="drawer-back" onClick={props.onClose}>
      <div className="drawer research-detail" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="chart-head">
          <div>
            <h2>{title}</h2>
            {variantId && <p className="sub">{variantId}</p>}
            <p className="sub">{strategyIdea(props.row.strategy)}</p>
          </div>
          <button type="button" className="btn" onClick={props.onClose}>Close</button>
        </div>
        {props.liveNote && <p className="sub">{props.liveNote}</p>}
        {props.series.length > 1 && (
          <>
            <div className="chart-legend">
              <span><i className="swatch profit" /> Portfolio</span>
              {hasNifty && <span><i className="swatch nifty" /> Nifty 50</span>}
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={props.series}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="var(--ink)" dot={false} strokeWidth={2} />
                  {hasNifty && <Line type="monotone" dataKey="nifty" name="Nifty 50" stroke="var(--nifty)" dot={false} strokeWidth={2} strokeDasharray="4 4" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        {props.monthly.length > 0 && (
          <>
            <h3>Monthly returns</h3>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={props.monthly}>
                  <XAxis dataKey="month" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="value" name="Return %">
                    {props.monthly.map((point) => <Cell key={point.month} fill={point.value >= 0 ? "var(--up)" : "var(--down)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        <h3>Settings</h3>
        <div style={{ overflow: "auto" }}>
          <table className="sheet">
            <thead>
              <tr><th>Parameters</th><th className="r">Profit factor</th><th className="r">Avg net</th><th className="r">Trades</th><th className="r">Drawdown</th><th>Result</th></tr>
            </thead>
            <tbody>
              {props.grid.map((row) => (
                <tr key={row.paramsKey} className={row.isDefault ? "is-default" : undefined}>
                  <td>
                    {typeof row.params.variant === "string"
                      ? `${variantName(row.params.variant)} (${row.params.variant})`
                      : row.isDefault
                        ? "Default"
                        : row.paramsKey}
                  </td>
                  <td className="r n">{row.profitFactor == null ? "—" : row.profitFactor.toFixed(2)}</td>
                  <td className="r n">{row.avgNetPct == null ? "—" : `${row.avgNetPct.toFixed(2)}%`}</td>
                  <td className="r n">{row.trades}</td>
                  <td className="r n">{row.worstDrawdownPct == null ? "—" : `${row.worstDrawdownPct.toFixed(1)}%`}</td>
                  <td>{row.passed ? "Pass" : "Fail"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {props.reasons.length > 0 && <p className="sub">Exits: {props.reasons.map((row) => `${row.reason} ${row.n}`).join(" · ")}</p>}
        <h3>Trades</h3>
        <div className="sheet-tools">
          <input value={props.symbol} onChange={(event) => props.onSymbol(event.target.value)} placeholder="Symbol" aria-label="Symbol" style={{ height: 44, borderRadius: 10, border: "1px solid var(--line)", padding: "0 12px" }} />
          <div className="seg">
            <button type="button" data-tone="all" aria-pressed={props.result === ""} onClick={() => props.onResult("")}>All</button>
            <button type="button" data-tone="won" aria-pressed={props.result === "won"} onClick={() => props.onResult("won")}>Won</button>
            <button type="button" data-tone="lost" aria-pressed={props.result === "lost"} onClick={() => props.onResult("lost")}>Lost</button>
          </div>
          <a className="btn" href={props.csvHref}>CSV</a>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="sheet">
            <thead>
              <tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th className="r">Net</th><th className="r">Net %</th><th>Exit</th></tr>
            </thead>
            <tbody>
              {props.trades.length === 0 && <tr><td colSpan={7}>No trades for this filter.</td></tr>}
              {props.trades.map((trade) => (
                <tr key={`${trade.symbol}-${trade.entryTs}`}>
                  <td>{trade.symbol}</td>
                  <td>{trade.side}</td>
                  <td className="n">{trade.entryTs.slice(0, 16)}</td>
                  <td className="n">{trade.exitTs.slice(0, 16)}</td>
                  <td className={`r n ${trade.net >= 0 ? "up" : "down"}`}>{trade.net.toFixed(0)}</td>
                  <td className={`r n ${trade.netPct >= 0 ? "up" : "down"}`}>{trade.netPct.toFixed(2)}%</td>
                  <td>{trade.exitReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn tiny" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>Previous</button>
            <span className="muted">{props.page} of {pages}</span>
            <button type="button" className="btn tiny" disabled={props.page >= pages} onClick={() => props.onPage(props.page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Spark({ points }: { points: { value: number }[] }) {
  if (points.length < 2) return null;
  const width = 280;
  const height = 48;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 2 - ((value - min) / span) * (height - 6);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className="research-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="2" />
    </svg>
  );
}

function liveSentence(
  strategy: string,
  live: { trades: number; avgNet: number | null; since: string | null } | undefined,
  backtest: number | null,
): string | null {
  if (strategy !== "rs" && strategy !== "ema") return null;
  const count = live?.trades ?? 0;
  const avg = live?.avgNet == null ? "—" : `${(live.avgNet * 100).toFixed(2)}%`;
  const back = backtest == null ? "—" : `${backtest.toFixed(2)}%`;
  const since = live?.since ? dayMonth(live.since) : null;
  if (!since && count === 0) return "Trading live. No closed trades yet.";
  return `Trading live since ${since ?? "the first fill"}: ${count} trades, avg net ${avg} vs backtest ${back}`;
}

function storedRuns(runs: Run[]): StoredRun[] {
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    finishedAt: run.finishedAt,
    identity: identityFromRun({
      book: run.book,
      sample: run.sample,
      params: run.params,
      engineSha: run.engineSha,
      dataLast: typeof run.data.last === "string" ? run.data.last : null,
    }),
  }));
}

function progressOf(data: Record<string, unknown>): { done: number; total: number } | null {
  const row = objectOf(data.progress);
  const done = Number(row.done);
  const total = Number(row.total);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return { done, total };
}

function paramsWindow(params: Record<string, unknown> | undefined): { from: string; to: string } | null {
  const window = objectOf(params?.window);
  if (typeof window.from !== "string" || typeof window.to !== "string") return null;
  return { from: window.from, to: window.to };
}

function objectOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function resultKey(row: Result): string {
  return `${row.strategy}|${row.paramsKey}`;
}

function equityPoints(value: unknown): { date: string; value: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const row = point as { date?: unknown; value?: unknown };
    const amount = typeof row.value === "number" ? row.value : Number(row.value);
    if (typeof row.date !== "string" || !Number.isFinite(amount)) return [];
    return [{ date: row.date, value: amount }];
  });
}

function monthlyPoints(monthly: Record<string, unknown>): { month: string; value: number }[] {
  return Object.entries(monthly)
    .flatMap(([month, value]) => {
      const amount = typeof value === "number" ? value : Number(value);
      return Number.isFinite(amount) ? [{ month, value: amount }] : [];
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

function runOption(run: Run): { detail: string; status: string; tone: string } {
  const at = runClock(run.finishedAt ?? run.requestedAt);
  const window = paramsWindow(run.params);
  const span = window ? sampleSpan(window.from, window.to) : "";
  const sample = run.sample === "heldback" ? "Held-back" : "Building";
  const stocks = Number(run.data.symbols ?? 0);
  const detail = [at, span, sample, stocks > 0 ? `${stocks} stocks` : ""].filter(Boolean).join(" · ");
  if (run.status === "ok") return { detail, status: "Finished", tone: "ok" };
  if (run.status === "running") return { detail, status: "Running", tone: "work" };
  if (run.status === "queued") return { detail, status: "Queued", tone: "wait" };
  return { detail, status: "Failed", tone: "bad" };
}
