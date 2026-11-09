"use client";

import { useEffect, useRef } from "react";
import type { PnlTrade } from "@/lib/mlive/pnl";
import { chargeGroups, formatInr, REASON_LABEL } from "./pnl-ui";

function money(value: number): string {
  return formatInr(value);
}

function signed(value: number): string {
  return formatInr(value, { sign: true });
}

export function TradePanel({ trade, onClose }: { trade: PnlTrade | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!trade) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    node?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [trade]);

  if (!trade) return null;
  const marks = [
    { label: "Stop", value: trade.currentStop ?? trade.initialStop },
    { label: "Entry", value: trade.entryAvg },
    { label: "Exit", value: trade.exitAvg },
    { label: "Best", value: trade.mfe == null ? null : trade.entryAvg * (1 + trade.mfe / 100) },
    { label: "Worst", value: trade.mae == null ? null : trade.entryAvg * (1 + trade.mae / 100) },
  ].filter((mark): mark is { label: string; value: number } => mark.value != null && Number.isFinite(mark.value));
  const low = Math.min(...marks.map((mark) => mark.value));
  const high = Math.max(...marks.map((mark) => mark.value));
  const span = high - low || 1;

  return (
    <div className="drawer-back" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${trade.symbol} trade`}
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chart-head">
          <div>
            <h2>{trade.symbol}</h2>
            <p className="sub">
              <span className={`chip ${trade.strategy}`}>{trade.strategy === "rs" ? "RS" : "EMA"}</span>{" "}
              <span className="chip">{trade.status === "open" ? "Open" : "Closed"}</span>
              {trade.boughtBelowStop && <span className="chip pick">Bought below stop</span>}
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <p className={`big n ${trade.net >= 0 ? "up" : "down"}`}>{signed(trade.net)}</p>
        <div className="scale" aria-hidden="true">
          <div className="scale-track" />
          {marks.map((mark) => (
            <span key={mark.label} className="scale-mark" style={{ left: `${((mark.value - low) / span) * 100}%` }} title={`${mark.label} ${money(mark.value)}`}>
              <i />
              <b>{mark.label}</b>
            </span>
          ))}
        </div>
        <h3>Fills</h3>
        <table>
          <thead><tr><th>Time</th><th>Side</th><th>Qty</th><th className="r">Price</th></tr></thead>
          <tbody>
            {trade.fills.map((fill) => (
              <tr key={fill.id}>
                <td>{fill.ts.slice(0, 16).replace("T", " ")}</td>
                <td>{fill.side}</td>
                <td className="n">{fill.qty}</td>
                <td className="r n">{money(fill.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {trade.fills.length === 0 && <p className="note">No fills recorded.</p>}
        <h3>Charges</h3>
        <table>
          <thead><tr><th>Type</th><th className="r">₹</th></tr></thead>
          <tbody>
            {chargeGroups(trade.charges).map((group) => (
              <tr key={group.id}>
                <td>{group.label}{group.id === "unclassified" ? " · Not split yet" : ""}</td>
                <td className="r n">{money(group.total)}</td>
              </tr>
            ))}
            <tr><td>Total</td><td className="r n">{money(trade.charges.total)}</td></tr>
          </tbody>
        </table>
        {trade.chargeRows.filter((row) => row.source === "adjustment").length > 0 && <p className="note">An adjustment row corrected the booked charges.</p>}
        <h3>Stops</h3>
        {trade.stops.length === 0 && <p className="note">No stop history.</p>}
        <ul className="stop-list">
          {trade.stops.map((row, index) => (
            <li key={`${row.at ?? index}`}>{row.at?.slice(0, 16).replace("T", " ") ?? "Stop"} · {row.stop == null ? "—" : money(row.stop)}{row.trigger == null ? "" : ` · Kite ${money(row.trigger)}`}</li>
          ))}
        </ul>
        <h3>Decision</h3>
        <p>{trade.decision ?? "No decision sentence."}</p>
        {trade.sizing && <p className="muted">{trade.sizing}</p>}
        {trade.exitReason && <p className="muted">Exit: {REASON_LABEL[trade.exitReason]}</p>}
        <h3>Audit</h3>
        {trade.auditIds.length === 0 && <p className="note">No audit rows in this trade window.</p>}
        <p>
          {trade.auditIds.map((id) => (
            <a key={id} href={`/live-trade-mansel/reports?tab=audit&symbol=${encodeURIComponent(trade.symbol)}#audit-${id}`}>Audit {id}</a>
          ))}
        </p>
      </div>
    </div>
  );
}
