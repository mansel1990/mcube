"use client";

import { useEffect, useId, useRef, useState } from "react";
import { matchKiteUnits, parseTradebookCsv, reconstructFifo } from "@/lib/mlive/tradebook";

export type EligibleHolding = {
  symbol: string;
  units: number;
  averagePrice: number;
  value: number;
};

type LotPreview = { date: string; units: number; price: number };

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function RegisterFromKite({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [rows, setRows] = useState<EligibleHolding[] | null>(null);
  const [symbol, setSymbol] = useState("");
  const [month, setMonth] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/long-game/register", { cache: "no-store" }).then(async (res) => {
        const body = (await res.json()) as { holdings?: EligibleHolding[] };
        const holdings = body.holdings ?? [];
        setRows(holdings);
        if (holdings.length === 1) setSymbol(holdings[0].symbol);
      });
      dialogRef.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, select, a[href]")].filter((item) => !item.hasAttribute("disabled"));
      if (items.length === 0) return;
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
    return () => document.removeEventListener("keydown", onKey);
  });

  function close() {
    if (busy) return;
    onClose();
    trigger.current?.focus();
  }

  if (!open) return null;
  const selected = rows?.find((row) => row.symbol === symbol) ?? null;
  const parsed = fileText && selected ? reconstructFifo(parseTradebookCsv(fileText, selected.symbol)) : [];
  const match = fileText && selected ? matchKiteUnits(parsed, selected.units) : null;
  const lots: LotPreview[] = match?.ok ? match.lots : [];

  async function submit() {
    if (!selected || busy) return;
    if (match && !match.ok) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/mlive/long-game/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: selected.symbol,
        month: fileText ? null : month || null,
        tradebookCsv: fileText || null,
        confirmTradebook: Boolean(fileText),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; average?: number; difference?: number; reconstructed?: number; kite?: number };
    setBusy(false);
    if (!res.ok) {
      if (body.difference != null) {
        setError(`Tradebook has ${body.reconstructed} units. Kite has ${body.kite} unattributed. Difference ${body.difference}. The full trade history may be incomplete.`);
        return;
      }
      setError(body.error || "Could not register.");
      return;
    }
    setMessage(`Added to Core. Gains are counted from ₹${body.average ?? selected.averagePrice}.`);
    setFileText("");
    setFileName("");
  }

  return (
    <div className="modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="card-h">
          <h2 id={titleId}>Register from Kite</h2>
          <button type="button" className="btn" onClick={close}>Close</button>
        </div>
        {rows == null && <p className="sub">Reading Kite…</p>}
        {rows?.length === 0 && (
          <>
            <p>No Long Game ETFs in your Kite yet.</p>
            <p className="sub">Only configured, unattributed Long Game ETFs appear here.</p>
          </>
        )}
        {(rows?.length ?? 0) > 0 && (
          <>
            <ul className="register-list">
              {rows?.map((row) => (
                <li key={row.symbol}>
                  <label>
                    <input type="radio" name="kite-holding" checked={symbol === row.symbol} onChange={() => setSymbol(row.symbol)} />
                    <b>{row.symbol}</b>
                    <span>{row.units} units</span>
                    <span>Avg {inr(row.averagePrice)}</span>
                    <span>{inr(row.value)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="sub">Units and average price come from Kite and cannot be edited.</p>
            <label className="field">
              <b>Bought around</b>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} disabled={Boolean(fileText)} />
              <small>Only used for tax estimates. Kite doesn&apos;t share purchase dates.</small>
            </label>
            <label className="field">
              <b>Upload Console tradebook (CSV)</b>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  void file.text().then((text) => {
                    setFileText(text);
                    setError("");
                  });
                }}
              />
              <small>Console › Reports › Tradebook, filter the ETF, full date range.</small>
            </label>
            {fileName && (
              <button type="button" className="btn" onClick={() => { setFileText(""); setFileName(""); setError(""); }}>
                Remove {fileName}
              </button>
            )}
            {match && !match.ok && (
              <p className="sub">
                Tradebook has {match.reconstructed} units. Kite has {match.kite} unattributed. Difference {match.difference}. The full trade history may be incomplete. Remove the file to use the month instead.
              </p>
            )}
            {match?.ok && (
              <div>
                <p>Confirm these lots before they are added to Core. Weighted average {inr(match.average)}. Kite average {selected ? inr(selected.averagePrice) : ""}.</p>
                <ul>
                  {lots.map((lot) => <li key={`${lot.date}-${lot.price}`}>{lot.date} · {lot.units} units · {inr(lot.price)}</li>)}
                </ul>
              </div>
            )}
            {error && <p className="sub">{error}</p>}
            {message && <p>{message}</p>}
            <button type="button" className="btn primary" disabled={!selected || busy || (match != null && !match.ok)} onClick={() => void submit()}>
              Add {selected?.units ?? ""} units to Core
            </button>
          </>
        )}
      </div>
    </div>
  );
}
