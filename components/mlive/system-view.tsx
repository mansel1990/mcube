"use client";

import { useEffect, useState } from "react";
import { NIFTY_REASON_NOTE } from "@/lib/mlive/nifty-reason";
import type { SystemStatus, SystemStep } from "@/lib/mlive/system-status";

const PILL: Record<SystemStep["mark"], string> = {
  done: "Done",
  next: "Next up",
  planned: "Planned",
  late: "Ran late",
  failed: "Failed",
  skipped: "Skipped",
};

export function SystemView({ onReport }: { onReport?: (day: string) => void }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/system", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("System status did not load.");
          setStatus((await res.json()) as SystemStatus);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "System status did not load."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (error) return <p className="sub" role="status">{error}</p>;
  if (!status) return <p className="muted" role="status">Loading system status…</p>;

  return (
    <div className="audit-layout">
      <div className="audit-main">
        <p className={`status-banner ${status.banner.tone}`} role="status">{status.banner.line}</p>
        {status.groups.map((group) => (
          <section key={group.id} className="card">
            <h2>{group.label}</h2>
            <ul className="schedule">
              {group.steps.map((step) => (
                <li key={step.kind} className={step.mark === "next" ? "next" : ""}>
                  <button type="button" className="step" onClick={() => setOpen(open === step.kind ? null : step.kind)}>
                    <span className="when">{step.time}</span>
                    <span>
                      <b>{step.title}</b>
                      <span className="muted">{step.description}{step.count > 1 ? ` · ${step.count} runs${step.errors ? `, ${step.errors} errors` : ""}` : ""}</span>
                    </span>
                    <span className={`chip ${step.mark}`}>{PILL[step.mark]}</span>
                  </button>
                  {open === step.kind && (
                    <div className="step-log">
                      {step.runs.length === 0 && <p className="muted">No runs yet.</p>}
                      {step.runs.map((run, index) => (
                        <p key={`${run.at}-${index}`}><b>{run.at || "Running"} · {run.status}</b> {run.summary}</p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <aside className="audit-side">
        <article className="card">
          <h2>Health</h2>
          <ul className="audit-check">
            <li><span>Server</span><b>{status.health.server}</b></li>
            <li><span>Kite session</span><b>{status.health.kite}</b></li>
            <li><span>Price feed</span><b>{status.health.prices}</b></li>
            <li><span>Candles</span><b>{status.health.candles}</b></li>
            <li><span>Main database</span><b>{status.health.mainDb}</b></li>
            <li><span>Market database</span><b>{status.health.marketDb}</b></li>
          </ul>
          {status.health.niftyReason && <p className="muted">{NIFTY_REASON_NOTE[status.health.niftyReason]}</p>}
        </article>
        <article className="card">
          <h2>Yesterday</h2>
          <p>{status.yesterday.line}</p>
          <button type="button" className="btn tiny" onClick={() => onReport?.(status.yesterday.day)}>Open that report</button>
        </article>
        <article className="card">
          <h2>Last deploy</h2>
          <p>{status.deploy ? `${status.deploy.commit} at ${status.deploy.at}` : "Not reporting yet"}</p>
        </article>
      </aside>
    </div>
  );
}
