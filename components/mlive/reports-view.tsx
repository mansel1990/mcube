"use client";

import { useEffect, useState } from "react";
import { inr } from "./format";

type Ledger = { tiles: { closed: number; winRate: number; realised: number; charges: number }; rows: { date: string | null; text: string; value: number | null }[] };
type AlertRow = { id: number; ts: string; level: string; message: string; seen: boolean };
type AuditRow = { id: number; ts: string; actor: string; action: string; symbol: string | null; reason: string };

export function ReportsView() {
  const [symbol, setSymbol] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSymbol(new URLSearchParams(window.location.search).get("symbol") ?? "");
      void fetch("/api/mlive/reports/ledger").then(async (res) => res.ok && setLedger(await res.json()));
      void fetch("/api/mlive/reports/alerts").then(async (res) => res.ok && setAlerts(await res.json()));
      void fetch("/api/mlive/reports/audit").then(async (res) => res.ok && setAudit(await res.json()));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function seen(id: number) {
    await fetch(`/api/mlive/alerts/${id}/seen`, { method: "POST" });
    setAlerts((rows) => rows.map((row) => (row.id === id ? { ...row, seen: true } : row)));
  }

  return (
    <section className="page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Reports</h1>
          <p className="sub">The engine&apos;s daily ledger, including the days it did nothing, plus alerts and the audit.</p>
        </div>
        <a className="btn" href="/api/mlive/reports/csv">Download CSV</a>
      </div>
      {ledger && (
        <>
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="card stat"><p className="lbl">Closed trades</p><div className="v n">{ledger.tiles.closed}</div></div>
            <div className="card stat"><p className="lbl">Win rate</p><div className="v n">{ledger.tiles.winRate}%</div></div>
            <div className="card stat"><p className="lbl">Realised</p><div className="v n">{inr(ledger.tiles.realised)}</div></div>
            <div className="card stat"><p className="lbl">Charges</p><div className="v n">{inr(ledger.tiles.charges)}</div></div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Date</th><th>What happened</th><th className="r">Value</th></tr></thead>
              <tbody>
                {ledger.rows.map((row) => (
                  <tr key={row.date}><td>{row.date}</td><td>{row.text}</td><td className="r n">{row.value == null ? "—" : inr(row.value)}</td></tr>
                ))}
              </tbody>
            </table>
            {ledger.rows.length === 0 && <p style={{ padding: 20 }} className="muted">No daily reports yet.</p>}
          </div>
        </>
      )}
      <div className="card sec">
        <div className="card-h"><h2>Alerts</h2><p className="sub">Needs you, problem, and done.</p></div>
          {alerts.length === 0 && <p style={{ padding: 20 }} className="muted">No alerts.</p>}
          {alerts.map((row) => (
            <div className="act" key={row.id}>
              <div className="what"><b>{row.level}</b><div className="muted">{row.message}</div></div>
              {!row.seen && <button type="button" className="btn" onClick={() => seen(row.id)}>Mark seen</button>}
            </div>
          ))}
        </div>
      <div className="card sec">
        <div className="card-h"><h2>Audit log</h2><p className="sub">{symbol ? `Filtered to ${symbol}. ` : ""}Rows are never edited or deleted.</p></div>
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Stock</th><th>Reason</th></tr></thead>
            <tbody>
              {(symbol ? audit.filter((row) => row.symbol === symbol) : audit).map((row) => (
                <tr key={row.id}><td>{new Date(row.ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{row.actor}</td><td>{row.action}</td><td>{row.symbol ?? ""}</td><td>{row.reason}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
    </section>
  );
}
