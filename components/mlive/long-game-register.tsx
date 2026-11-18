"use client";

import { useState } from "react";

const ETFS = ["NIFTYBEES", "MID150BEES", "JUNIORBEES", "GOLDBEES", "LIQUIDBEES"];

export function LongGameRegister() {
  const [pocket, setPocket] = useState("core");
  const [symbol, setSymbol] = useState("NIFTYBEES");
  const [units, setUnits] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [acquiredOn, setAcquiredOn] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/mlive/long-game/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pocket, symbol, units: Number(units), averagePrice: Number(averagePrice), acquiredOn }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; moneyAdded?: number };
    setBusy(false);
    setMessage(res.ok ? `Registered. Money added ₹${body.moneyAdded ?? 0}. Pocket cash stays ₹0.` : body.error || "Could not register.");
  }

  return (
    <form className="card" onSubmit={(event) => void submit(event)} style={{ marginBottom: 16 }}>
      <div className="card-h"><h2>Register existing holding</h2></div>
      <p className="sub">This records an opening lot. It does not move cash, and there is no withdrawal button.</p>
      <div className="field">
        <b>Pocket</b>
        <select aria-label="Pocket" value={pocket} onChange={(event) => setPocket(event.target.value)}>
          <option value="core">Core</option>
          <option value="radar">Radar</option>
        </select>
      </div>
      <div className="field">
        <b>ETF</b>
        <select aria-label="ETF" value={symbol} onChange={(event) => setSymbol(event.target.value)}>
          {ETFS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <label className="field">Units<input aria-label="Units" value={units} onChange={(event) => setUnits(event.target.value)} inputMode="numeric" /></label>
      <label className="field">Average price<input aria-label="Average price" value={averagePrice} onChange={(event) => setAveragePrice(event.target.value)} inputMode="decimal" /></label>
      <label className="field">Purchase date<input aria-label="Purchase date" type="date" value={acquiredOn} onChange={(event) => setAcquiredOn(event.target.value)} /></label>
      <button type="submit" className="btn primary" disabled={busy}>Register</button>
      {message && <p className="sub">{message}</p>}
    </form>
  );
}
