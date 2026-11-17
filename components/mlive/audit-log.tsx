"use client";

import { useEffect, useState } from "react";
import { alertBody, alertSections, auditLabel, collapseAlerts, groupAuditByDay } from "@/lib/mlive/rules";
import { notifyAlertsChanged } from "./alert-count";

type AuditRow = { id: number; ts: string; actor: string; action: string; symbol: string | null; side: "BUY" | "SELL" | null; reason: string; repeat: number };
type AuditPage = { rows: AuditRow[]; page: number; pageSize: number; total: number };
type AlertRow = { id: number; ts: string; level: string; code: string; message: string; symbol?: string | null; seen: boolean };

const TYPES = [
  { id: "decisions", label: "Decisions" },
  { id: "orders", label: "Orders" },
  { id: "stops", label: "Stops" },
  { id: "you", label: "You" },
  { id: "alerts", label: "Alerts" },
  { id: "everything", label: "Everything" },
] as const;

function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function whoLabel(actor: string): string {
  if (actor === "engine" || actor === "kite" || actor === "system") return "Engine";
  return "You";
}

export function AuditLog({
  type, who, book, q, from, to, page, onChange,
}: {
  type: string;
  who: string;
  book: string;
  q: string;
  from: string;
  to: string;
  page: number;
  onChange: (next: Record<string, string>) => void;
}) {
  const [audit, setAudit] = useState<AuditPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBusy(true);
      setFailed(false);
      const query = new URLSearchParams({ page: String(page), view: "all", type, who, book });
      if (q) query.set("q", q);
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      void fetch(`/api/mlive/reports/audit?${query}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("log");
          setAudit((await res.json()) as AuditPage);
        })
        .catch(() => setFailed(true))
        .finally(() => setBusy(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [page, type, who, book, q, from, to]);

  useEffect(() => {
    void fetch("/api/mlive/reports/alerts?open=1").then(async (res) => {
      if (!res.ok) return;
      const rows = (await res.json()) as AlertRow[];
      setUnread(rows.filter((row) => !row.seen).length);
      if (type === "alerts") setAlerts(rows);
    });
  }, [type]);

  async function seen(ids: number[]) {
    const res = await fetch(`/api/mlive/alerts/${ids[0]}/seen`, { method: "POST" });
    if (!res.ok) return;
    setAlerts((rows) => rows.map((row) => (ids.includes(row.id) ? { ...row, seen: true } : row)));
    setUnread((count) => Math.max(0, count - 1));
    notifyAlertsChanged();
  }

  async function seenAll() {
    const res = await fetch("/api/mlive/alerts/seen", { method: "POST" });
    if (!res.ok) return;
    setAlerts((rows) => rows.map((row) => ({ ...row, seen: true })));
    setUnread(0);
    notifyAlertsChanged();
  }

  const rows = audit?.rows ?? [];
  const days = groupAuditByDay(rows);
  const total = audit?.total ?? 0;
  const pageSize = audit?.pageSize ?? 25;
  const fromRow = total === 0 ? 0 : page * pageSize + 1;
  const toRow = Math.min(total, (page + 1) * pageSize);
  const sections = alertSections(collapseAlerts(alerts));

  return (
    <>
      <div className="filter-row log-filters">
        <div className="seg" role="group" aria-label="Type">
          {TYPES.map((item) => (
            <button key={item.id} type="button" aria-pressed={type === item.id} onClick={() => onChange({ type: item.id })}>
              {item.label}{item.id === "alerts" && unread > 0 ? ` ${unread}` : ""}
            </button>
          ))}
        </div>
        <input className="search" value={q} onChange={(event) => onChange({ q: event.target.value })} placeholder="Search stock or detail" aria-label="Search the log" />
        <button type="button" className="icon-btn" aria-expanded={more} aria-pressed={Boolean(from || to || who !== "everyone" || book !== "all")} aria-label="More filters" title="More filters" onClick={() => setMore((open) => !open)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></svg>
        </button>
      </div>
      {more && (
        <div className="filter-row more-filters">
          <input type="date" value={from} onChange={(event) => onChange({ from: event.target.value })} aria-label="From" />
          <input type="date" value={to} onChange={(event) => onChange({ to: event.target.value })} aria-label="To" />
          <div className="seg" role="group" aria-label="Who">
            {([["everyone", "Everyone"], ["engine", "Engine"], ["you", "You"]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={who === id} onClick={() => onChange({ who: id })}>{label}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Book">
            {(["all", "swing", "intraday"] as const).map((item) => (
              <button key={item} type="button" data-tone={item} aria-pressed={book === item} onClick={() => onChange({ book: item })}>{item === "all" ? "All" : item === "swing" ? "Swing" : "Intraday"}</button>
            ))}
          </div>
        </div>
      )}
      {type !== "everything" && <p className="muted log-note">Engine runs and other routine rows are hidden. Choose Everything to see them.</p>}

      {type === "alerts" ? (
        <div className="card">
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2>Alerts</h2>
            {alerts.some((row) => !row.seen) && <button type="button" className="btn" onClick={() => void seenAll()}>Mark all as read</button>}
          </div>
          {sections.length === 0 && <p className="sub">No alerts.</p>}
          {sections.map((section) => (
            <div key={section.level}>
              <h2>{section.label}</h2>
              {section.rows.map((row) => (
                <div className="alert-row" key={row.ids.join("-")}>
                  <div className="what">{alertBody(row)}</div>
                  {!row.seen && <button type="button" className="btn tiny" onClick={() => void seen(row.ids)}>Mark seen</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card audit-log" aria-busy={busy}>
          {busy && <p className="muted" role="status">Loading the log…</p>}
          {failed && <p className="sub" role="status">The log did not load.</p>}
          {!busy && !failed && days.length === 0 && <p className="sub">Nothing in this view yet.</p>}
          {days.length > 0 && (
            <div className="audit-scroll">
              <table className="audit-table">
                <thead>
                  <tr><th>Time</th><th>Who</th><th>Action</th><th>Stock</th><th>Detail</th></tr>
                </thead>
                {days.map((bucket) => (
                  <tbody key={bucket.day}>
                    <tr className="day"><td colSpan={5}>{dayLabel(bucket.day)}</td></tr>
                    {bucket.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="when">{new Date(row.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</td>
                        <td className="who">{whoLabel(row.actor)}</td>
                        <td className="what"><span className="chip">{auditLabel(row.action, row.side)}{row.repeat > 1 ? ` ×${row.repeat}` : ""}</span></td>
                        <td className="sym">{row.symbol ? <b>{row.symbol}</b> : ""}</td>
                        <td className="detail">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <footer className="audit-pager">
            <p>Rows are never edited or deleted.{total === 0 ? "" : ` ${fromRow}–${toRow} of ${total}.`}</p>
            <div>
              <button type="button" className="btn tiny" disabled={busy || page === 0} onClick={() => onChange({ page: String(Math.max(0, page - 1)) })}>Newer</button>
              <button type="button" className="btn tiny" disabled={busy || toRow >= total} onClick={() => onChange({ page: String(page + 1) })}>Older</button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}
