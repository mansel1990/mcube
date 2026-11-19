"use client";

import { useEffect, useState } from "react";
import type { DailyReport } from "@/lib/mlive/daily";
import { NIFTY_REASON_NOTE } from "@/lib/mlive/nifty-reason";
import { inr, signed } from "./format";
import { PageSkeleton } from "./loading";

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function tone(value: number | null): string {
  if (value == null) return "";
  return value >= 0 ? "up" : "down";
}

function sentenceBits(sentence: string): string[] {
  const bits = sentence.split(/(?<=\.)\s+/).map((bit) => bit.trim()).filter(Boolean);
  return bits.length > 0 ? bits : [sentence];
}

function bitTone(bit: string): string {
  if (/^Bought\b/i.test(bit)) return "buy";
  if (/rule did not hold/i.test(bit)) return "bad";
  if (/^Stops\b/i.test(bit)) return "stops";
  if (/Waiting for Kite|Before the open|no buys|No ideas|Nothing to buy|skipped/i.test(bit)) return "skip";
  if (/\bsold\b/i.test(bit)) return "sell";
  return "plain";
}

export function AuditDaily({ day, onDay, onSystem }: { day: string; onDay: (day: string) => void; onSystem: () => void }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setError("");
      void fetch(`/api/mlive/audit/daily?day=${day}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("The report did not load.");
          setReport((await res.json()) as DailyReport);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "The report did not load."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [day]);

  if (error) return <p className="sub" role="status">{error}</p>;
  if (!report) return <PageSkeleton kind="audit" label="Loading the report" />;

  const held = report.rules.filter((rule) => rule.ok !== false).length;
  const niftyNote = report.niftyReason ? NIFTY_REASON_NOTE[report.niftyReason] : null;
  const recentMissing = report.recent.every((item) => item.niftyPct == null);
  return (
    <>
      <div className="recent-row">
        {report.recent.map((item) => (
          <button key={item.day} type="button" className={item.day === report.day ? "day-card on" : "day-card"} onClick={() => onDay(item.day)}>
            <span className="lbl">{dayName(item.day)}</span>
            <b className={tone(item.netPct)}>{pct(item.netPct)}</b>
            <span className="blurb">{item.blurb}</span>
            <span className="nifty-line"><span>Nifty 50</span><b className={tone(item.niftyPct)}>{pct(item.niftyPct)}</b></span>
          </button>
        ))}
      </div>
      {niftyNote && recentMissing && <p className="muted">{niftyNote}</p>}

      <div className="audit-layout">
        <div className="audit-main">
          <article className="card verdict">
            <div>
              <div className="pill-row">
                <span className={`chip ${report.phase === "closed" && report.holiday ? "wait" : ""}`}>{report.pill}</span>
                <span className={`chip ${report.rulesOpen ? "bad" : "ok"}`}>{report.rulesPill}</span>
              </div>
              <div className="verdict-bits">
                {sentenceBits(report.sentence).map((bit) => (
                  <p key={bit} className={`verdict-bit ${bitTone(bit)}`}>{bit}</p>
                ))}
              </div>
              <p className="report-meta">
                <span>{report.reportedAt ? `Report at ${report.reportedAt}` : report.phase === "before" ? "The report is written after the close." : "Report not written yet."}</span>
                {report.closeValue != null && <span className="account">Account {inr(report.closeValue)} at the close</span>}
              </p>
              {!report.kiteConnected && report.phase !== "closed" && <p className="muted">Kite is not logged in. Buys stay held until it is.</p>}
            </div>
            <div className="verdict-stats">
              <div><span className="lbl">{report.netLabel}</span><b className={tone(report.netInr)}>{report.netInr == null ? "—" : signed(report.netInr)}</b><span className="muted">{report.netNote ?? `${pct(report.netPct)} of the previous close`}</span></div>
              <div><span className="lbl">Nifty 50</span><b className={tone(report.niftyPct)}>{pct(report.niftyPct)}</b><span className="muted">{report.niftyPct == null && niftyNote && !recentMissing ? niftyNote : "Price index, same day"}</span></div>
              <div className="audit-counts">
                <div><span className="lbl">Bought</span><b>{report.bought}</b></div>
                <div><span className="lbl">Sold</span><b>{report.sold}</b></div>
                <div><span className="lbl">Skipped</span><b>{report.skipped}</b></div>
              </div>
            </div>
          </article>

          <article className="card">
            <h2>What it decided, and why</h2>
            {report.decisions.length === 0 && <p className="sub">{report.holiday ? "Market closed." : "No decisions recorded for this day."}</p>}
            {report.decisions.length > 0 && (
              <ul className="decide">
                {report.decisions.map((row, index) => (
                  <li key={`${row.time}-${row.symbol}-${index}`}>
                    <span className="when">{row.time}</span>
                    <b>{row.symbol}</b>
                    <span className="chip">{row.pill}</span>
                    <span className="detail">{row.reason}</span>
                  </li>
                ))}
              </ul>
            )}
            {report.heldLeftOut > 0 && <p className="muted">{report.heldLeftOut} idea{report.heldLeftOut === 1 ? "" : "s"} already held {report.heldLeftOut === 1 ? "is" : "are"} left out.</p>}
          </article>

          <article className="card rules">
            <div className="book-top">
              <h2>Rules check</h2>
              <b className={report.rulesOpen ? "bad" : "ok"}>{report.rulesOpen ? report.rulesPill : `${held} of ${report.rules.length} held`}</b>
            </div>
            <ul className="audit-check">
              {report.rules.map((rule) => (
                <li key={rule.label}>
                  <span>{rule.label}</span>
                  <b className={rule.ok === false ? "bad" : rule.ok ? "ok" : ""}>{rule.detail}</b>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <aside className="audit-side">
          <article className="card">
            <div className="book-top">
              <h2>How the day ran</h2>
              <button type="button" className="btn tiny" onClick={onSystem}>System</button>
            </div>
            <ol className="run-line">
              {report.timeline.map((step) => (
                <li key={step.id} className={step.state}>
                  <i className={`dot ${step.state}`} />
                  <div>
                    <b>{step.title}</b>
                    {step.result && <span>{step.result}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </aside>
      </div>
    </>
  );
}
