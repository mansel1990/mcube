"use client";

import { useEffect, useState } from "react";
import { decisionById, RESEARCH_DECISIONS, retiredStoppedRecords, statusLabel } from "@/lib/mlive/decision-registry";
import { goldContributionNote, longGameComparison, radarDecisionSentence, type VariantMetrics } from "@/lib/mlive/long-game-dossier";
import { passedCount, tilesForSample, type TileMetrics } from "@/lib/mlive/research-tiles";
import { ReasonHelp } from "./reason-help";

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
  const passed = passedCount(tiles);
  const others = RESEARCH_DECISIONS.filter((row) => row.book === "swing" && row.id !== "swing:momentum:M10-6");
  return (
    <div className="dossier">
      <article className="card dossier-card swing">
        <header className="dossier-head">
          <div>
            <h2>Momentum M10-6</h2>
            <p>Buys strength and sells on a weekly review. Small size, with the stop rule agreed.</p>
            {decision?.explanation ? <span className="chip">Live pilot <ReasonHelp text={decision.explanation} /></span> : null}
          </div>
          {held?.cagrPct != null && <b className="n">{held.cagrPct.toFixed(1)}%</b>}
        </header>
        {held && <p className="sub">Held-back evidence · Run {held.id} · {held.window}</p>}
        {tiles.length > 0 && (
          <div className="test-grid">
            {tiles.map((tile) => (
              <div key={tile.id} className="test-tile">
                <span>{tile.passed ? "✓" : "✗"} {tile.label}</span>
                <b>{tile.value}</b>
                <small>{tile.requirement}</small>
              </div>
            ))}
          </div>
        )}
        <footer className="dossier-foot">
          {tiles.length > 0 && <span>{passed} of {tiles.length} tests passed</span>}
          <span>Small-size live pilot</span>
          {decision && <span>Owner decision · {decision.decidedOn}</span>}
          <a href="#research-evidence">View evidence</a>
        </footer>
      </article>
      {others.map((row) => (
        <article key={row.id} className="card candidate-card">
          <b>{row.label}</b>
          <span className="chip">{statusLabel(row.status)}{row.explanation ? <> <ReasonHelp text={row.explanation} /></> : null}</span>
          <p className="sub">{row.reason}</p>
          <a href="#research-evidence">View evidence</a>
        </article>
      ))}
    </div>
  );
}

type StoredResult = { variant: string; metrics: Record<string, unknown>; stresses?: Record<string, unknown> };
type LongPayload = {
  run: { id: number } | null;
  results: StoredResult[];
  heldback: { run: { id: number }; results: StoredResult[] } | null;
  superseded: { label: string; runIds: number[] };
};

function variantOf(rows: StoredResult[] | undefined, name: string): VariantMetrics | undefined {
  const row = rows?.find((item) => item.variant === name);
  if (!row) return undefined;
  return { metrics: row.metrics, stresses: row.stresses ?? null };
}

export function LongGameResearch() {
  const [data, setData] = useState<LongPayload | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/long-term", { cache: "no-store" }).then(async (res) => {
        if (res.ok) setData(await res.json() as LongPayload);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const rows = longGameComparison({
    buildingCore: variantOf(data?.results, "STATIC-MID"),
    buildingRadar: variantOf(data?.results, "RADAR-MID"),
    heldCore: variantOf(data?.heldback?.results, "STATIC-MID"),
    heldRadar: variantOf(data?.heldback?.results, "RADAR-MID"),
  });
  const heldRadar = variantOf(data?.heldback?.results, "RADAR-MID");
  const coreFall = drawdownPct(variantOf(data?.heldback?.results, "STATIC-MID"));
  const radarFall = drawdownPct(heldRadar);
  const sentence = radarDecisionSentence(coreFall, radarFall);
  const runId = data?.heldback?.run.id;
  return (
    <div className="dossier" id="long-game-research">
      <article className="card dossier-card longgame">
        <header className="dossier-head">
          <div>
            <h2>Core vs Radar · Midcap 150</h2>
            <span className="chip loss-pill">Radar did not qualify</span>
            <p>Core remains the fixed 40/20/25/15 Long Game book.</p>
          </div>
        </header>
        <p className="sub">Run {runId ?? "—"} · Held-back · Override consumed</p>
        <div className="compare-matrix">
          <div className="compare-row head"><span>Metric</span><span>Building Core</span><span>Building Radar</span><span>Held-back Core</span><span>Held-back Radar</span></div>
          {rows.map((row) => (
            <div className="compare-row" key={row.metric}>
              <span>{row.metric}</span>
              <span>{row.buildingCore ?? "—"}</span>
              <span>{row.buildingRadar ?? "—"}</span>
              <span>{row.heldCore ?? "—"}</span>
              <span>{row.heldRadar ?? "—"}</span>
            </div>
          ))}
        </div>
        {sentence && <p>{sentence}</p>}
        {heldRadar && <p className="sub">{goldContributionNote(heldRadar.metrics)}</p>}
        <details>
          <summary>How this decision was made</summary>
          <p>{decisionById("longterm:RADAR-MID")?.explanation}</p>
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
          <summary>Superseded runs {data?.superseded.runIds.join(" and ") ?? "9 and 10"}</summary>
          <p>{data?.superseded.label ?? "Superseded: Gold BeES 1:100 split not normalized (2019-12-23)"}</p>
        </details>
      </article>
    </div>
  );
}

function drawdownPct(row: VariantMetrics | undefined): number | null {
  const drawdown = row?.metrics?.maxDrawdown;
  if (!drawdown || typeof drawdown !== "object" || Array.isArray(drawdown)) return null;
  const pct = (drawdown as { pct?: unknown }).pct;
  return typeof pct === "number" ? pct : null;
}

export function RetiredStopped() {
  const rows = retiredStoppedRecords();
  return (
    <details className="card retired-block">
      <summary>Retired and stopped ({rows.length})</summary>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.label} — {statusLabel(row.status)} {row.decidedOn} — {row.reason}</li>
        ))}
      </ul>
    </details>
  );
}
