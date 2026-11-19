"use client";

import { useCallback, useEffect, useState } from "react";
import { BookStory } from "./book-story";
import { decisionById, retiredStoppedRecords, statusLabel } from "@/lib/mlive/decision-registry";
import { goldContributionNote, longGameComparison, radarDecisionSentence, type VariantMetrics } from "@/lib/mlive/long-game-dossier";
import { tilesForSample, type TileMetrics } from "@/lib/mlive/research-tiles";
import { ReasonHelp } from "./reason-help";
import { PageSkeleton } from "./loading";

export type CanonicalRow = TileMetrics & {
  id: number;
  strategy: string;
  variant: string | null;
  cagrPct: number | null;
  window: string;
};

export function SwingCanonical({ rows }: { rows: CanonicalRow[] }) {
  const decision = decisionById("swing:momentum:M10-6");
  const held = rows.find((row) => row.strategy === "momentum" && (row.variant == null || row.variant === "M10-6")) ?? rows.find((row) => row.strategy === "momentum");
  const tiles = held ? tilesForSample(held, "swing", "heldback") : [];
  return (
    <div className="dossier">
      <article className="card dossier-card swing">
        <header className="dossier-head">
          <div>
            <h2>Momentum M10-6</h2>
            <p>Buys strength and sells on a weekly review. Small size, with the stop rule agreed.</p>
            {decision?.explanation ? (
              <ReasonHelp className="chip pilot-chip" text={decision.explanation} label="Live pilot">
                <span className="pilot-mark" aria-hidden="true" />
                Live pilot
              </ReasonHelp>
            ) : null}
          </div>
          {held?.cagrPct != null && (
            <div className="held-return">
              <b className="n">{held.cagrPct.toFixed(1)}%</b>
              <span>Held-back annual return</span>
            </div>
          )}
        </header>
        {tiles.length > 0 && (
          <div className="test-grid">
            {tiles.map((tile) => (
              <div key={tile.id} className={`test-tile ${tile.passed ? "pass" : "fail"}`}>
                <span className="test-mark" aria-hidden="true">{tile.passed ? "✓" : "✗"}</span>
                <span className="lbl">{tile.label}</span>
                <b>{tile.value}</b>
                <small>{tile.requirement}</small>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

type StoredResult = { variant: string; metrics: Record<string, unknown>; stresses?: Record<string, unknown> };
type LongPayload = {
  results: StoredResult[];
  heldback: { run: { id: number; window: string }; results: StoredResult[] } | null;
  superseded: { label: string; runIds: number[] };
};

function variantOf(rows: StoredResult[] | undefined, name: string): VariantMetrics | undefined {
  const row = rows?.find((item) => item.variant === name);
  if (!row) return undefined;
  return { metrics: row.metrics, stresses: row.stresses ?? null };
}

export function LongGameResearch() {
  const [data, setData] = useState<LongPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [story, setStory] = useState(false);
  const closeStory = useCallback(() => setStory(false), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/long-term/dossier", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) {
          setFailed(true);
          return;
        }
        setData(await res.json() as LongPayload);
      }).catch(() => setFailed(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (failed) return <p className="sub">Long Game research could not be loaded.</p>;
  if (!data) return <PageSkeleton kind="research" label="Loading Long Game research" />;
  const rows = longGameComparison({
    buildingCore: variantOf(data.results, "STATIC-MID"),
    buildingRadar: variantOf(data.results, "RADAR-MID"),
    heldCore: variantOf(data.heldback?.results, "STATIC-MID"),
    heldRadar: variantOf(data.heldback?.results, "RADAR-MID"),
  });
  const heldRadar = variantOf(data.heldback?.results, "RADAR-MID");
  const coreFall = drawdownPct(variantOf(data.heldback?.results, "STATIC-MID"));
  const radarFall = drawdownPct(heldRadar);
  const sentence = radarDecisionSentence(coreFall, radarFall);
  const runId = data.heldback?.run.id;
  const heldWindow = data.heldback?.run.window;
  const scale = Math.max(15, coreFall ?? 0, radarFall ?? 0, 1);
  return (
    <div className="dossier" id="long-game-research">
      <article className="card dossier-card longgame">
        <header className="dossier-band">
          <div>
            <h2>Core vs Radar · Midcap 150</h2>
            <span className="chip loss-pill">Radar did not qualify</span>
            <p>Core remains the fixed 40/20/25/15 Long Game book.</p>
          </div>
          <button type="button" className="story-open" aria-expanded={story} onClick={() => setStory(true)}>The story</button>
        </header>
        <p className="sub">Run {runId ?? "—"}{heldWindow ? ` · Held-back ${heldWindow}` : ""} · Override consumed</p>
        <div className="compare-desk">
          <SampleBand title="Building" rows={rows} coreKey="buildingCore" radarKey="buildingRadar" />
          <SampleBand title="Held-back" rows={rows} coreKey="heldCore" radarKey="heldRadar" held />
        </div>
        <div className="compare-phone">
          {rows.map((row) => (
            <section key={row.metric}>
              <h3>{row.metric}</h3>
              <p><b>Building</b></p>
              <p>Core {row.buildingCore ?? "—"} · Radar {row.buildingRadar ?? "—"}</p>
              <p><b>Held-back</b></p>
              <p>Core {row.heldCore ?? "—"} · Radar {row.heldRadar ?? "—"}</p>
            </section>
          ))}
        </div>
        {coreFall != null && radarFall != null && (
          <div className="fall-bars" aria-label="Worst fall compared with the 15% cap">
            <FallBar label="Core" value={coreFall} scale={scale} solid />
            <FallBar label="Radar" value={radarFall} scale={scale} solid={false} />
            <span className="fall-cap-label">15% cap</span>
          </div>
        )}
        {sentence && <p>{sentence}</p>}
        <details>
          <summary>How this decision was made</summary>
          <p>{decisionById("longterm:RADAR-MID")?.explanation}</p>
          {heldRadar && <p className="sub">{goldContributionNote(heldRadar.metrics)}</p>}
        </details>
        <details>
          <summary>Run provenance</summary>
          <p>Figures are loaded from stored research runs.</p>
        </details>
        <details>
          <summary>Stress tests</summary>
          <p>Stress results stay in the stored run and are not a live order.</p>
        </details>
        <details>
          <summary>Superseded runs {data.superseded.runIds.join(" and ")}</summary>
          <p>{data.superseded.label}</p>
        </details>
      </article>
      <BookStory open={story} onClose={closeStory} />
    </div>
  );
}

function SampleBand({
  title,
  rows,
  coreKey,
  radarKey,
  held = false,
}: {
  title: string;
  rows: { metric: string; buildingCore: string | null; buildingRadar: string | null; heldCore: string | null; heldRadar: string | null }[];
  coreKey: "buildingCore" | "heldCore";
  radarKey: "buildingRadar" | "heldRadar";
  held?: boolean;
}) {
  return (
    <section className={`compare-band${held ? " held" : ""}`}>
      <h3>{title}</h3>
      <div className="band-head"><span>Metric</span><span>Core</span><span>Radar</span></div>
      {rows.map((row) => (
        <div className="band-row" key={row.metric}>
          <span>{row.metric}</span>
          <span className="core-cell">{row[coreKey] ?? "—"}</span>
          <span className="radar-cell">{row[radarKey] ?? "—"}</span>
        </div>
      ))}
    </section>
  );
}

function FallBar({ label, value, scale, solid }: { label: string; value: number; scale: number; solid: boolean }) {
  return (
    <div className="fall-row">
      <span>{label}</span>
      <span className="fall-track">
        <i className={solid ? "core" : "radar"} style={{ width: `${Math.min(100, (value / scale) * 100)}%` }} />
        <em className="fall-cap" style={{ left: `${(15 / scale) * 100}%` }} />
      </span>
      <span className="n">{value.toFixed(1)}%</span>
    </div>
  );
}

function drawdownPct(row: VariantMetrics | undefined): number | null {
  const drawdown = row?.metrics?.maxDrawdown;
  if (!drawdown || typeof drawdown !== "object" || Array.isArray(drawdown)) return null;
  const pct = (drawdown as { pct?: unknown }).pct;
  return typeof pct === "number" ? pct : null;
}

function prettyDate(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function RetiredStopped() {
  const rows = retiredStoppedRecords();
  const intraday = rows.filter((row) => row.book === "intraday");
  const others = rows.filter((row) => row.book !== "intraday");
  const shown = [
    ...(intraday.length > 0 ? [{
      id: "intraday",
      name: "Intraday",
      tone: "retired" as const,
      iso: intraday[0]?.decidedOn ?? "",
      when: prettyDate(intraday[0]?.decidedOn ?? ""),
      facts: intraday.map((row) => ({ key: row.id, label: row.label, value: row.reason })),
      note: "",
    }] : []),
    ...others.map((row) => ({
      id: row.id,
      name: row.label,
      tone: row.status === "retired" ? "retired" as const : "stopped" as const,
      iso: row.decidedOn,
      when: prettyDate(row.decidedOn),
      facts: [] as { key: string; label: string; value: string }[],
      note: row.reason,
    })),
  ];
  return (
    <details className="card retired-block">
      <summary>
        <span>Retired and stopped</span>
        <span className="retired-count">{shown.length}</span>
      </summary>
      <ul className="retired-list">
        {shown.map((row) => (
          <li key={row.id} className={`retired-row ${row.tone}`}>
            <div className="retired-main">
              <b>{row.name}</b>
              <span className={`retired-status ${row.tone}`}>{statusLabel(row.tone)}</span>
            </div>
            <time dateTime={row.iso}>{row.when}</time>
            {row.facts.length > 0 ? (
              <div className="retired-facts">
                {row.facts.map((fact) => (
                  <span key={fact.key} className="retired-fact">
                    <span>{fact.label}</span>
                    <b>{fact.value}</b>
                  </span>
                ))}
              </div>
            ) : (
              <p>{row.note}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
