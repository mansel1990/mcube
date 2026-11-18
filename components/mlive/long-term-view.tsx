"use client";

import { useEffect, useMemo, useState } from "react";
import { LongtermProposalBanner, type LongtermProposalView } from "./longterm-proposal-banner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Run = {
  id: number;
  status: string;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  params: Record<string, unknown>;
  data: Record<string, unknown>;
  note: string;
  engineSha: string;
};

type Result = {
  variant: string;
  controlVariant: string | null;
  metrics: Record<string, unknown>;
  equity: unknown[];
  allocations: unknown[];
  events: unknown[];
  stresses: Record<string, unknown>;
  provenance: unknown[];
  passed: boolean;
  failReasons: string[];
};

type HeldbackStatus = { variant: string; label: string; detail: string };

type SampleBundle = { run: Run | null; results: Result[]; comparisons?: Comparison[] };

type Payload = {
  run: Run | null;
  results: Result[];
  comparisons?: Comparison[];
  heldback?: SampleBundle | null;
  heldbackStatus?: HeldbackStatus[];
  superseded?: { label: string; runIds: number[]; correctedRunId: number | null };
  live?: boolean;
  proposal?: LongtermProposalView | null;
  locked: boolean;
  error?: string;
};

type Comparison = {
  radar: string;
  benchmark: string;
  checks: Record<string, boolean>;
  qualified: boolean;
  details: Record<string, unknown>;
};

const COLORS: Record<string, string> = {
  "STATIC-NEXT": "#8B8792",
  "RADAR-NEXT": "#C8430D",
  "STATIC-MID": "#4050C4",
  "RADAR-MID": "#0B7472",
};

const CHECK_NAMES: Record<string, string> = {
  drawdownReduction: "15% lower maximum drawdown",
  cagrGap: "Pre-tax CAGR within 2 points",
  afterTaxCagrGap: "After-tax CAGR within 2 points",
  positiveFiveYearWindows: "80% positive five-year windows",
  fasterRecovery: "Faster drawdown recovery",
  eventsPerYear: "No more than 12 events a year",
  stressDrawdownAdvantage: "Drawdown edge survives stress",
  diversifiedProfit: "Returns are diversified",
};

const SLEEVE_NAMES: Record<string, string> = {
  nifty50: "Nifty 50",
  secondary: "Next 50 / Midcap 150",
  gold: "Gold",
  liquid: "Liquid",
};

export function LongTermView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [sample, setSample] = useState<"building" | "heldback">("building");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/mlive/long-term", { cache: "no-store" });
        const body = await response.json() as Payload;
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error || "Long Game research could not be loaded.");
          return;
        }
        setPayload(body);
        setError(null);
        setSelected((current) => current || body.results.find((row) => row.variant === "RADAR-NEXT")?.variant || body.results[0]?.variant || "");
      } catch {
        if (!cancelled) setError("Long Game research could not be loaded.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = sample === "heldback" && payload?.heldback ? payload.heldback : null;
  const shownResults = useMemo(
    () => (shown?.results?.length ? shown.results : payload?.results ?? []),
    [shown, payload],
  );
  const shownRun = shown?.run ?? payload?.run ?? null;
  const result = shownResults.find((row) => row.variant === selected) ?? shownResults[0] ?? null;
  const storedComparisons = arrayOf((shown?.run ?? payload?.run)?.data.comparisons).map(comparisonOf).filter((row): row is Comparison => row !== null);
  const comparisons = shown?.comparisons?.length
    ? shown.comparisons
    : payload?.comparisons?.length
      ? payload.comparisons
      : storedComparisons;
  const freshness = freshnessOf(shownRun, result);
  const equity = useMemo(() => combineSeries(shownResults, "equity", "value"), [shownResults]);
  const drawdowns = useMemo(() => combineSeries(shownResults, "equity", "drawdownPct"), [shownResults]);
  const allocations = useMemo(() => allocationSeries(result), [result]);

  return (
    <section className="page long-game">
      <header className="long-head">
        <div>
          <div className="long-title-row">
            <h1>Long Game</h1>
            {payload?.live ? <span className="chip ok">Live</span> : <span className="chip long-research">Research only · not activated</span>}
          </div>
          <p className="sub">Long-term ETF and gold opportunities</p>
        </div>
        <button type="button" className="btn long-holdings" disabled>
          Holdings
          <small>Available after a strategy passes held-back</small>
        </button>
      </header>

      {payload?.live ? null : (
        <div className="status-banner wait long-lock" role="status">
          <b>No live recommendation. Long Game is still being researched.</b>
          <span>Building-sample results cannot place orders or change the live book.</span>
        </div>
      )}
      {payload?.proposal ? <LongtermProposalBanner proposal={payload.proposal} onDone={() => window.location.reload()} /> : null}

      {error ? <StateCard title="Could not load Long Game" detail={error} /> : !payload ? (
        <StateCard title="Loading Long Game…" detail="Reading the latest research run." loading />
      ) : !shownRun ? (
        <>
          <StateCard title="No research run yet" detail="Run the frozen Long Game building sample to populate this page." />
          <SupersededNote correctedRunId={payload.superseded?.correctedRunId ?? null} />
        </>
      ) : (
        <>
          <div className={`long-fresh ${freshness.stale ? "stale" : ""}`}>
            <span><b>Data through</b> {freshness.dataDate}</span>
            <span><b>Research run</b> {freshness.runDate}</span>
            <span><b>Status</b> {runStatus(shownRun.status)}</span>
            {freshness.stale && <strong>Stale research — refresh the source data and run again before drawing conclusions.</strong>}
          </div>
          <div className="long-variants" aria-label="Choose a sample">
            <button type="button" aria-pressed={sample === "building"} onClick={() => setSample("building")}>Building</button>
            <button type="button" aria-pressed={sample === "heldback"} onClick={() => setSample("heldback")} disabled={!payload.heldback}>Held-back</button>
          </div>

          {shownResults.length === 0 ? (
            <StateCard
              title={shownRun.status === "queued" || shownRun.status === "running" ? "Research is in progress" : "No saved results"}
              detail={shownRun.status === "queued" || shownRun.status === "running"
                ? "Results will appear after the active run completes."
                : "The latest valid run for this sample has no Long Game result rows."}
              loading={shownRun.status === "queued" || shownRun.status === "running"}
            />
          ) : (
            <>
              <section className="card long-target">
                <div>
                  <span className="lbl">Balanced target</span>
                  <h2>60 / 25 / 15</h2>
                  <p className="sub">Equity / gold / liquid. Equity is split 40% Nifty 50 and 20% Next 50 or Midcap 150.</p>
                </div>
                <div className="long-target-bar" aria-label="Balanced target: 60 percent equity, 25 percent gold, 15 percent liquid">
                  <i className="equity" style={{ width: "60%" }} />
                  <i className="gold" style={{ width: "25%" }} />
                  <i className="liquid" style={{ width: "15%" }} />
                </div>
                <div className="long-target-legend">
                  <span><i className="equity" />Equity 60%</span>
                  <span><i className="gold" />Gold 25%</span>
                  <span><i className="liquid" />Liquid 15%</span>
                </div>
              </section>

              <section className="sec">
                <div className="sec-h">
                  <div><h2>Variant comparison</h2><p className="sub">Latest valid run for this sample. Returns are not forecasts.</p></div>
                </div>
                <div id="corrected-run" className="long-pairs">
                  {PAIRS.map(([radar, control]) => (
                    <div className="long-pair" key={radar}>
                      {[control, radar].map((name) => {
                        const row = shownResults.find((item) => item.variant === name);
                        if (!row) return null;
                        return (
                          <VariantCard
                            key={name}
                            row={row}
                            comparison={comparisons.find((item) => item.radar === radar) ?? null}
                            heldback={payload.heldbackStatus?.find((item) => item.variant === name) ?? null}
                            selected={row.variant === result?.variant}
                            onSelect={() => setSelected(row.variant)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>

              <section className="long-chart-grid">
                <ChartCard title="Growth of ₹100" note="All variants, normalized at the first session.">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={equity}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={36} />
                      <YAxis domain={["auto", "auto"]} width={44} />
                      <Tooltip />
                      {shownResults.map((row) => <Line key={row.variant} dataKey={row.variant} stroke={COLORS[row.variant]} dot={false} strokeWidth={row.variant.startsWith("RADAR") ? 2.4 : 1.4} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title={`${variantLabel(result?.variant ?? "")} allocation`} note="Portfolio weights through the building sample.">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                    <AreaChart data={allocations}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={36} />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={40} />
                      <Tooltip />
                      <Area type="monotone" dataKey="nifty50" stackId="weights" stroke="#4050C4" fill="#4050C4" />
                      <Area type="monotone" dataKey="secondary" stackId="weights" stroke="#0B7472" fill="#0B7472" />
                      <Area type="monotone" dataKey="gold" stackId="weights" stroke="#C89B16" fill="#C89B16" />
                      <Area type="monotone" dataKey="liquid" stackId="weights" stroke="#8B8792" fill="#8B8792" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Drawdown" note="Decline from each variant's prior peak.">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={drawdowns}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={36} />
                      <YAxis tickFormatter={(value) => `${value}%`} width={44} />
                      <Tooltip />
                      {shownResults.map((row) => <Line key={row.variant} dataKey={row.variant} stroke={COLORS[row.variant]} dot={false} strokeWidth={row.variant.startsWith("RADAR") ? 2.4 : 1.4} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </section>

              <Acceptance comparisons={comparisons} results={shownResults} />
              {result && shownRun && <ResearchDetail result={result} run={shownRun} />}
              <SupersededNote correctedRunId={payload.superseded?.correctedRunId ?? shownRun.id} />
            </>
          )}
        </>
      )}
    </section>
  );
}

const PAIRS = [
  ["RADAR-NEXT", "STATIC-NEXT"],
  ["RADAR-MID", "STATIC-MID"],
] as const;

function SupersededNote({ correctedRunId }: { correctedRunId: number | null }) {
  return (
    <details className="card long-superseded">
      <summary>Superseded: Gold BeES 1:100 split not normalized (2019-12-23)</summary>
      <p className="sub">Runs 9 and 10. {correctedRunId ? <a href="#corrected-run">Open corrected run {correctedRunId}</a> : "The corrected run is not loaded yet."}</p>
    </details>
  );
}

function VariantCard({
  row,
  comparison,
  heldback,
  selected,
  onSelect,
}: {
  row: Result;
  comparison: Comparison | null;
  heldback: HeldbackStatus | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const drawdown = objectAt(row.metrics, "maxDrawdown");
  const asset = comparison ? numberAt(comparison.details, "largestAssetProfitSharePct") : shareOf(row, "asset");
  const year = comparison ? numberAt(comparison.details, "largestPositiveYearSharePct") : shareOf(row, "year");
  const recovery = numberAt(drawdown, "daysUnderwater");
  return (
    <button type="button" className={`card long-variant ${selected ? "on" : ""}`} onClick={onSelect}>
      <span className="long-variant-top">
        <b>{variantLabel(row.variant)}</b>
        <span className={`chip ${heldback?.label === "qualifies for live design" ? "ok" : "bad"}`}>{heldback?.label ?? "not run"}</span>
      </span>
      <span><small>CAGR pre-tax</small><strong>{percent(numberAt(row.metrics, "cagrPct"))}</strong></span>
      <span><small>After-tax CAGR</small><strong>{percent(numberAt(objectAt(row.stresses, "currentTax"), "cagrPct"))}</strong></span>
      <span><small>Max drawdown</small><strong className="down">{percent(numberAt(drawdown, "pct"))}</strong><small>{formatDate(String(drawdown.peakDate ?? ""))} to {formatDate(String(drawdown.troughDate ?? ""))}</small></span>
      <span><small>Recovery days</small><strong>{drawdown.recoveryDate ? String(Math.round(recovery)) : "not recovered"}</strong></span>
      <span><small>Events per year</small><strong>{decimal(numberAt(row.metrics, "eventsPerYear"), 1)}</strong></span>
      <span><small>Largest asset / year</small><strong>{percent(asset)} / {percent(year)}</strong></span>
      <ul className="long-card-checks">
        {comparison ? Object.entries(comparison.checks).map(([name, passed]) => (
          <li key={name}><span>{CHECK_NAMES[name] ?? words(name)}</span><b className={passed ? "up" : "down"}>{passed ? "Pass" : "Fail"}</b></li>
        )) : <li><span>Checks</span><b>Unavailable</b></li>}
      </ul>
      {heldback?.detail ? <p className="sub">{heldback.detail}</p> : null}
    </button>
  );
}

function shareOf(row: Result, kind: "asset" | "year"): number {
  if (kind === "year") {
    const years = Object.values(objectAt(row.metrics, "calendarYearReturns")).map((value) => Math.max(0, Number(value) || 0));
    const total = years.reduce((sum, value) => sum + value, 0);
    return total > 0 ? (Math.max(...years) / total) * 100 : 0;
  }
  const contribution = objectAt(row.metrics, "contributionApprox");
  const values = Object.values(contribution).map((value) => Math.max(0, Number(value) || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? (Math.max(...values, 0) / total) * 100 : 0;
}

function StateCard({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return (
    <div className="card long-state" role={loading ? "status" : "alert"}>
      <h2>{loading && <span className="spin" />}{title}</h2>
      <p className="sub">{detail}</p>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <article className="card chart-card long-chart">
      <div className="card-h"><h2>{title}</h2><p className="sub">{note}</p></div>
      <div className="plot-box">{children}</div>
    </article>
  );
}

function Acceptance({ comparisons, results }: { comparisons: Comparison[]; results: Result[] }) {
  return (
    <section className="sec">
      <div className="sec-h"><div><h2>Acceptance checks</h2><p className="sub">A RADAR variant must pass every check before held-back data can be considered.</p></div></div>
      {comparisons.length ? (
        <div className="long-check-grid">
          {comparisons.map((comparison) => (
            <article className="card long-checks" key={comparison.radar}>
              <div className="card-top">
                <div><h2>{variantLabel(comparison.radar)}</h2><p className="sub">Compared with {variantLabel(comparison.benchmark)}</p></div>
                <span className={`chip ${comparison.qualified ? "ok" : "bad"}`}>{comparison.qualified ? "Passed all" : "Did not qualify"}</span>
              </div>
              <ul>
                {Object.entries(comparison.checks).map(([name, passed]) => (
                  <li key={name}><span>{CHECK_NAMES[name] ?? words(name)}</span><b className={passed ? "up" : "down"}>{passed ? "Pass" : "Fail"}</b></li>
                ))}
              </ul>
              {comparison.checks.diversifiedProfit === false && (
                <p className="down">Known weakness: profit concentrated in {String(comparison.details.concentratedSleeve || "one sleeve")}.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="card long-state">
          <h2>Comparison details are unavailable</h2>
          <p className="sub">{results.some((row) => row.variant.startsWith("RADAR") && row.failReasons.length)
            ? "Saved variant outcomes exist, but this run did not include the full acceptance comparison."
            : "Complete both RADAR and matching static variants to calculate acceptance checks."}</p>
        </div>
      )}
    </section>
  );
}

function ResearchDetail({ result, run }: { result: Result; run: Run }) {
  const stress = result.stresses;
  const events = result.events.map(recordOf).filter((row) => Object.keys(row).length).slice(-8).reverse();
  const sample = objectAt(result.metrics, "sample");
  const identity = objectAt(result.metrics, "runIdentity");
  const assumptions = arrayOf(identity.assumptions).map(String);
  const years = objectAt(result.metrics, "calendarYearReturns");
  const drawdown = objectAt(result.metrics, "maxDrawdown");
  const conclusion = typeof result.metrics.conclusion === "string" ? result.metrics.conclusion : "";

  return (
    <>
      <section className="sec">
        <div className="sec-h"><div><h2>Stress tests</h2><p className="sub">{variantLabel(result.variant)} under harsher assumptions.</p></div></div>
        <div className="long-stress-grid">
          {[
            ["Double costs", objectAt(stress, "doubledCosts")],
            ["Double tracking drag", objectAt(stress, "doubledDrag")],
            ["Current tax model", objectAt(stress, "currentTax")],
          ].map(([label, values]) => {
            const row = values as Record<string, unknown>;
            return (
              <article className="card" key={label as string}>
                <span className="lbl">{label as string}</span>
                <strong>{percent(numberAt(row, "cagrPct"))} <small>Backtest CAGR</small></strong>
                <p>Max drawdown {percent(numberAt(objectAt(row, "maxDrawdown"), "pct"))}</p>
                <p>Ending value {money(numberAt(row, "endingValue"))}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <article className="card">
          <div className="card-h"><h2>Yearly returns</h2><p className="sub">{conclusion || "Calendar-year returns for this variant."} Drawdown {formatDate(String(drawdown.peakDate ?? ""))} to {formatDate(String(drawdown.troughDate ?? ""))}, recovery {drawdown.recoveryDate ? formatDate(String(drawdown.recoveryDate)) : "not recovered"}.</p></div>
          {Object.keys(years).length ? <ul className="long-events">
            {Object.entries(years).map(([year, value]) => (
              <li key={year}><time>{year}</time><div><b>{percent(Number(value) || 0)}</b></div></li>
            ))}
          </ul> : <p className="sub">No calendar-year returns were saved.</p>}
        </article>
      </section>

      <section className="sec">
        <article className="card">
          <div className="card-h"><h2>Recent research events</h2><p className="sub">Signals and simulated executions only.</p></div>
          {events.length ? <ul className="long-events">
            {events.map((event, index) => (
              <li key={`${String(event.executionDate)}-${index}`}>
                <time>{formatDate(String(event.executionDate ?? event.signalDate ?? ""))}</time>
                <div><b>{words(String(event.action ?? "Event"))} · {SLEEVE_NAMES[String(event.sleeve)] ?? words(String(event.sleeve ?? "portfolio"))}</b><p>{String(event.reason ?? "No event note.")}</p></div>
              </li>
            ))}
          </ul> : <p className="sub">No simulated events were saved.</p>}
        </article>
      </section>

      <details className="card about-run long-about">
        <summary>About this data</summary>
        <div className="about-bits">
          <div className="about-bit sample"><span className="tag">Sample</span><span>{String(sample.from ?? "—")} to {String(sample.to ?? "—")} · initial capital {money(numberAt(sample, "initialCapital"))}</span></div>
          <div className="about-bit universe"><span className="tag">Universe</span><span>Nifty 50, Next 50 or Midcap 150, Gold BeES NAV, and a liquid-rate series.</span></div>
          <div className="about-bit costs"><span className="tag">Costs</span><span>Transaction costs, slippage, investable-product drag, whole-unit effects, and tax stress are modeled.</span></div>
          <div className="about-bit rules"><span className="tag">Run</span><span>#{run.id} · engine {run.engineSha || "not recorded"} · {run.note || "No run note."}</span></div>
          {assumptions.length > 0 && <div className="about-bit capital"><span className="tag">Assumptions</span><span>{assumptions.join(" ")}</span></div>}
        </div>
      </details>
    </>
  );
}

function combineSeries(results: Result[], field: "equity", key: "value" | "drawdownPct"): Record<string, number | string>[] {
  const dates = new Map<string, Record<string, number | string>>();
  for (const result of results) {
    const points = sample(result[field].map(recordOf).filter((row) => typeof row.date === "string"), 360);
    const first = numberAt(points[0] ?? {}, "value") || 1;
    for (const point of points) {
      const date = String(point.date);
      const row = dates.get(date) ?? { date };
      row[result.variant] = key === "value" ? (numberAt(point, key) / first) * 100 : numberAt(point, key);
      dates.set(date, row);
    }
  }
  return [...dates.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function allocationSeries(result: Result | null): Record<string, number | string>[] {
  if (!result) return [];
  return sample(result.allocations.map(recordOf).filter((row) => typeof row.date === "string"), 360).map((point) => {
    const weights = objectAt(point, "weights");
    return {
      date: String(point.date),
      nifty50: numberAt(weights, "nifty50") * 100,
      secondary: numberAt(weights, "secondary") * 100,
      gold: numberAt(weights, "gold") * 100,
      liquid: numberAt(weights, "liquid") * 100,
    };
  });
}

function freshnessOf(run: Run | null, result: Result | null) {
  const sample = objectAt(result?.metrics ?? {}, "sample");
  const dataDate = String(run?.data.last ?? sample.to ?? "not recorded");
  const provenanceDates = (result?.provenance ?? []).map(recordOf).map((row) => Date.parse(String(row.retrievedAt ?? ""))).filter(Number.isFinite);
  const runDate = run?.finishedAt ?? run?.startedAt ?? run?.requestedAt;
  const checkedAt = provenanceDates.length ? Math.max(...provenanceDates) : Date.parse(runDate ?? "");
  return {
    dataDate: formatDate(dataDate),
    runDate: runDate ? formatDate(runDate) : "not recorded",
    stale: !Number.isFinite(checkedAt) || Date.now() - checkedAt > 45 * 86_400_000,
  };
}

function comparisonOf(value: unknown): Comparison | null {
  const row = recordOf(value);
  if (!row.radar || !row.benchmark) return null;
  const checks = objectAt(row, "checks");
  return {
    radar: String(row.radar),
    benchmark: String(row.benchmark),
    checks: Object.fromEntries(Object.entries(checks).map(([key, passed]) => [key, passed === true])),
    qualified: row.qualified === true,
    details: objectAt(row, "details"),
  };
}

function sample<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const step = (rows.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => rows[Math.round(index * step)]);
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectAt(row: Record<string, unknown>, key: string): Record<string, unknown> {
  return recordOf(row[key]);
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberAt(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function percent(value: number): string {
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function variantLabel(value: string): string {
  const [kind, sleeve] = value.split("-");
  if (!kind) return "Variant";
  return `${kind === "RADAR" ? "RADAR" : "Static"} · ${sleeve === "MID" ? "Midcap 150" : "Next 50"}`;
}

function words(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortDate(value: string): string {
  return value?.slice(0, 7) ?? "";
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function runStatus(status: string): string {
  if (status === "ok") return "Complete";
  if (status === "running") return "Running";
  if (status === "queued") return "Queued";
  return words(status);
}
