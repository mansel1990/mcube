"use client";

import { useState } from "react";

export type LongtermProposalView = {
  id: number;
  variant: string;
  reason: string;
  signalDate?: string;
  currentWeights: Record<string, number>;
  targetWeights: Record<string, number>;
  trades: { side: string; symbol: string; qty: number; limit: number }[];
  costsInr: number;
  taxInr: number;
  eventsUsed: number;
  eventsCap: number;
  expiresOn: string;
};

export function LongtermProposalBanner({ proposal, onDone }: { proposal: LongtermProposalView; onDone?: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError("");
    try {
      const res = await fetch("/api/mlive/long-term/proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: proposal.id, action, note }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error || "Could not record that.");
        return;
      }
      onDone?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card long-proposal" role="status">
      <div className="card-h">
        <h2>Long Game change needs approval</h2>
        <p className="sub">{proposal.eventsUsed} of {proposal.eventsCap} approved changes used this year. Expires {proposal.expiresOn}. {proposal.variant}.</p>
      </div>
      <p>{proposal.reason}</p>
      <div className="long-weight-row">
        <span><b>Now</b> {weightLine(proposal.currentWeights)}</span>
        <span><b>Target</b> {weightLine(proposal.targetWeights)}</span>
      </div>
      <ul className="long-events">
        {proposal.trades.map((trade) => (
          <li key={`${trade.side}-${trade.symbol}`}>
            <time>{trade.side === "SELL" ? "Sell" : "Buy"}</time>
            <div><b>{trade.symbol}</b><p>{trade.qty} at limit ₹{trade.limit.toLocaleString("en-IN")}</p></div>
          </li>
        ))}
      </ul>
      <p className="sub">Estimated costs ₹{Math.round(proposal.costsInr).toLocaleString("en-IN")}. Estimated tax ₹{Math.round(proposal.taxInr).toLocaleString("en-IN")}, using the frozen long-term rate on the sold amount. Sells go out before buys.</p>
      <label className="field">
        <div><b>Note</b><small>Optional</small></div>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </label>
      {error && <p className="down">{error}</p>}
      <div className="long-proposal-actions">
        <button type="button" className="btn" disabled={busy != null} onClick={() => void act("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</button>
        <button type="button" className="btn primary" disabled={busy != null} onClick={() => void act("approve")}>{busy === "approve" ? "Approving…" : "Approve"}</button>
      </div>
    </article>
  );
}

function weightLine(weights: Record<string, number>): string {
  const names: Record<string, string> = { nifty50: "Nifty 50", secondary: "Next or Mid", gold: "Gold", liquid: "Liquid" };
  return Object.entries(weights)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${names[key] ?? key} ${Math.round(value * 1000) / 10}%`)
    .join(" · ");
}
