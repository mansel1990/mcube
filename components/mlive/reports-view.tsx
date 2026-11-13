"use client";

import { useEffect, useRef, useState } from "react";
import { alertBody, alertSections, auditLabel, collapseAlerts, groupAuditByDay, ENGINE_GROUPS, type AuditView, type EngineGroupId } from "@/lib/mlive/rules";
import { notifyAlertsChanged } from "./alert-count";
import { inr } from "./format";
import { ReportsPnl, TradesTable } from "./reports-pnl";
import { TradePanel } from "./trade-panel";
import type { PnlModel, PnlTrade } from "@/lib/mlive/pnl";

type Ledger = {
  tiles: { closed: number; winRate: number; realised: number; charges: number };
  rows: { date: string | null; label: string; tone: "buy" | "sell" | "wait" | "none"; text: string; items: { symbol: string; sentence: string }[]; value: number | null }[];
};
type AlertRow = { id: number; ts: string; level: string; code: string; message: string; symbol?: string | null; seen: boolean };
type AuditRow = { id: number; ts: string; actor: string; action: string; symbol: string | null; side: "BUY" | "SELL" | null; reason: string; repeat: number };
type AuditPage = { rows: AuditRow[]; page: number; pageSize: number; total: number; groups: { id: EngineGroupId; count: number }[] };

const TABS = [
  { id: "pnl", label: "P&L" },
  { id: "trades", label: "Trades" },
  { id: "ledger", label: "Ledger" },
  { id: "alerts", label: "Alerts" },
  { id: "audit", label: "Audit" },
] as const;

function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const VIEWS: { id: AuditView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "working", label: "Working" },
  { id: "bought", label: "Bought" },
  { id: "sold", label: "Sold" },
  { id: "engine", label: "Engine" },
  { id: "you", label: "You" },
];

export function ReportsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pnl");
  const [pnl, setPnl] = useState<PnlModel | null>(null);
  const [trade, setTrade] = useState<PnlTrade | null>(null);
  const [view, setView] = useState<AuditView>("all");
  const [group, setGroup] = useState<EngineGroupId>("all");
  const [page, setPage] = useState(0);
  const [symbol, setSymbol] = useState("");
  const [ready, setReady] = useState(false);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [audit, setAudit] = useState<AuditPage | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const auditRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const querySymbol = params.get("symbol") ?? "";
      setSymbol(querySymbol);
      const requested = params.get("tab");
      if (querySymbol || requested === "audit") setTab("audit");
      else if (requested === "alerts" || requested === "ledger" || requested === "trades" || requested === "pnl") setTab(requested);
      setReady(true);
      void fetch("/api/mlive/pnl?range=all&strategy=all", { cache: "no-store" }).then(async (res) => {
        if (res.ok) setPnl((await res.json()) as PnlModel);
      });
      void fetch("/api/mlive/reports/ledger").then(async (res) => res.ok && setLedger(await res.json()));
      void fetch("/api/mlive/reports/alerts?open=1").then(async (res) => res.ok && setAlerts(await res.json()));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const request = ++auditRequest.current;
    setAuditBusy(true);
    const params = new URLSearchParams({ page: String(page), view });
    if (view === "engine" && group !== "all") params.set("group", group);
    if (symbol) params.set("symbol", symbol);
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/reports/audit?${params}`)
        .then(async (res) => {
          if (auditRequest.current !== request || !res.ok) return;
          setAudit((await res.json()) as AuditPage);
        })
        .finally(() => {
          if (auditRequest.current === request) setAuditBusy(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, page, view, group, symbol]);

  async function seen(ids: number[]) {
    const res = await fetch(`/api/mlive/alerts/${ids[0]}/seen`, { method: "POST" });
    if (!res.ok) return;
    setAlerts((rows) => rows.map((row) => (ids.includes(row.id) ? { ...row, seen: true } : row)));
    notifyAlertsChanged();
  }

  async function seenAll() {
    const res = await fetch("/api/mlive/alerts/seen", { method: "POST" });
    if (!res.ok) return;
    setAlerts((rows) => rows.map((row) => ({ ...row, seen: true })));
    notifyAlertsChanged();
  }

  const groups = collapseAlerts(alerts);
  const sections = alertSections(groups);
  const viewLabel = VIEWS.find((item) => item.id === view)?.label ?? "Audit";
  const groupLabel = view === "engine" && group !== "all" ? ENGINE_GROUPS.find((item) => item.id === group)?.label : "";
  const auditPlace = `${groupLabel ? `${viewLabel} · ${groupLabel}` : viewLabel}${page > 0 ? `, page ${page + 1}` : ""}`;
  const auditRows = audit?.rows ?? [];
  const auditDays = groupAuditByDay(auditRows);
  const pageSize = audit?.pageSize ?? 25;
  const total = audit?.total ?? 0;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const engineGroups = (audit?.groups ?? []).filter((item) => item.id === "all" || item.count > 0);

  return (
    <section className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Reports</h1>
          <p className="sub">Profit and loss, the trades, the daily ledger, alerts, and the audit.</p>
        </div>
        {tab === "ledger" && <a className="btn" href="/api/mlive/reports/csv">Download CSV</a>}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "pnl" && (pnl ? <ReportsPnl pnl={pnl} onOpen={setTrade} /> : <p className="muted" role="status">Loading P&L…</p>)}
      {tab === "trades" && (pnl ? <TradesTable pnl={pnl} onOpen={setTrade} /> : <p className="muted" role="status">Loading trades…</p>)}

      {tab === "ledger" && ledger && (
        <>
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="card stat"><p className="lbl">Closed trades</p><div className="v n">{ledger.tiles.closed}</div></div>
            <div className="card stat"><p className="lbl">Win rate</p><div className="v n">{ledger.tiles.winRate}%</div></div>
            <div className="card stat"><p className="lbl">Realised</p><div className="v n">{inr(ledger.tiles.realised)}</div></div>
            <div className="card stat"><p className="lbl">Charges</p><div className="v n">{inr(ledger.tiles.charges)}</div></div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Day</th><th>Decision</th><th>What happened</th><th className="r">At close</th></tr></thead>
              <tbody>
                {ledger.rows.map((row) => {
                  const sentences = new Set(row.items.map((item) => item.sentence));
                  return (
                    <tr key={row.date}>
                      <td><b>{row.date ? dayLabel(row.date) : ""}</b></td>
                      <td><span className={`chip ${row.tone === "buy" || row.tone === "sell" ? "bought" : ""} ${row.tone === "wait" ? "pick" : ""}`}>{row.label}</span></td>
                      <td>
                        {row.text}
                        {row.items.length > 0 && (
                          <details>
                            <summary className="muted">{row.items.length === 1 ? row.items[0].symbol : `${row.items.length} names`}</summary>
                            {sentences.size === 1 ? (
                              <div className="muted">{row.items.map((item) => item.symbol).join(", ")}</div>
                            ) : (
                              row.items.map((item) => (
                                <div key={`${item.symbol}-${item.sentence}`}><b>{item.symbol}</b> <span className="muted">{item.sentence}</span></div>
                              ))
                            )}
                          </details>
                        )}
                      </td>
                      <td className="r n">{row.value == null ? <span className="muted">Not closed</span> : inr(row.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ledger.rows.length === 0 && <p style={{ padding: 20 }} className="muted">No daily reports yet.</p>}
          </div>
        </>
      )}

      {tab === "alerts" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2>Alerts</h2>
              <p className="sub">Needs you, a problem, or done. The same message is shown once.</p>
            </div>
            {groups.some((row) => !row.seen) && (
              <button type="button" className="btn" onClick={() => void seenAll()}>Mark all as read</button>
            )}
          </div>
          {sections.length === 0 && <p style={{ padding: 20 }} className="muted">No alerts.</p>}
          {sections.map((section) => (
            <div key={section.level} className="alert-sec">
              <div className="card-h" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <h2>{section.label}</h2>
                <span className="muted">{section.rows.length}</span>
              </div>
              {section.rows.map((row) => (
                <div className="alert-row" key={row.ids.join("-")}>
                  <div className="what">{alertBody(row)}</div>
                  {!row.seen && <button type="button" className="btn tiny" onClick={() => void seen(row.ids)}>Mark seen</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="card" style={{ marginTop: 16 }} aria-busy={auditBusy}>
          <div className="card-h">
            <h2>Audit log</h2>
            <p className="sub">{symbol ? `Filtered to ${symbol}. ` : ""}Rows are never edited or deleted.</p>
          </div>
          <div className="filters" role="group" aria-label="Audit filter">
            {VIEWS.map((item) => (
              <button key={item.id} type="button" className={view === item.id ? "chip pick" : "chip"} onClick={() => { setView(item.id); setPage(0); }}>
                {item.label}
              </button>
            ))}
          </div>
          {view === "engine" && (
            <div className="filters" role="group" aria-label="Engine groups">
              {(engineGroups.length ? engineGroups : ENGINE_GROUPS.map((item) => ({ id: item.id, count: 0 }))).map((item) => (
                <button key={item.id} type="button" className={group === item.id ? "chip pick" : "chip"} onClick={() => { setGroup(item.id); setPage(0); }}>
                  {ENGINE_GROUPS.find((entry) => entry.id === item.id)?.label ?? item.id}
                  {item.count > 0 ? ` · ${item.count}` : ""}
                </button>
              ))}
            </div>
          )}
          {view === "engine" && !auditBusy && (
            <p className="sub" style={{ padding: "10px 20px 0" }}>Same stock and same detail on one day is one line. The number is how many times it was written.</p>
          )}
          {auditBusy ? (
            <p className="muted" role="status" aria-live="polite" style={{ padding: 20 }}>
              <span className="spin" aria-hidden="true" />
              Loading {auditPlace}…
            </p>
          ) : (
            <>
              {auditDays.map((bucket) => (
                <div key={bucket.day}>
                  <div className="card-h"><b>{dayLabel(bucket.day)}</b></div>
                  <table>
                    <thead><tr><th>When</th><th>Who</th><th>What</th><th>Stock</th><th>Detail</th></tr></thead>
                    <tbody>
                      {bucket.rows.map((row) => (
                        <tr key={row.id} id={`audit-${row.id}`}>
                          <td>{new Date(row.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</td>
                          <td>{row.actor}</td>
                          <td>{auditLabel(row.action, row.side)}{row.repeat > 1 ? ` ×${row.repeat}` : ""}</td>
                          <td>{row.symbol ?? ""}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {auditRows.length === 0 && <p style={{ padding: 20 }} className="muted">Nothing in {auditPlace} yet.</p>}
            </>
          )}
          <div className="field">
            <button type="button" className="btn" disabled={auditBusy || page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Newer</button>
            <span className="muted" role="status">{auditBusy ? `Loading ${auditPlace}…` : total === 0 ? "No rows" : `${auditPlace} · ${from}–${to} of ${total}`}</span>
            <button type="button" className="btn" disabled={auditBusy || to >= total} onClick={() => setPage((current) => current + 1)}>Older</button>
          </div>
        </div>
      )}
      <TradePanel trade={trade} onClose={() => setTrade(null)} />
    </section>
  );
}
