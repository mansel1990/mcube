"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { inr } from "./format";

type Settings = Record<string, unknown>;
type Payload = {
  settings: Settings;
  nextReview: string;
  state: { status?: string; mode?: string } | null;
  kite: { connected: boolean; connectedAt: string | null; kiteUserId: string | null } | null;
  kiteFunds: { connected: boolean; cash: number | null; error?: string | null };
  tradingLimit: number;
  engineCanUse: number;
  cashNote: string;
  engine: { kind?: string; status?: string; finished_at?: string } | null;
};

function enabled(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return ["rs", "ema"];
}

function val(settings: Settings, key: string): string {
  const raw = settings[key];
  if (raw == null) return "";
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="switch" aria-pressed={on} aria-label={`${label}, ${on ? "on" : "off"}`} onClick={onClick}>
      <span className="word">{on ? "On" : "Off"}</span>
      <span className="knob" aria-hidden="true" />
    </button>
  );
}

const NUMBER_FIELDS: { key: string; label: string; help: string }[] = [
  { key: "risk_pct", label: "Risk per trade", help: "Fraction of the trading limit. 0.01 is 1%." },
  { key: "max_order_pct", label: "Max of the trading limit per order", help: "0.25 is a quarter of the trading limit." },
  { key: "min_order_inr", label: "Minimum order, ₹", help: "Skip a name that would be smaller than this." },
  { key: "cash_reserve_inr", label: "Cash reserve, ₹", help: "Held back for a sell's charges and the next idea." },
  { key: "max_buys_per_day", label: "Max buys a day", help: "Send cap. Includes partial fills of the same order as one." },
  { key: "max_new_buys_per_day", label: "New buys a day", help: "Pacing. Default 2. The lower of this and the send cap wins." },
  { key: "max_buys_per_strategy_per_day", label: "Buys per strategy a day", help: "Default 2. RS and EMA are counted apart." },
  { key: "max_open_per_strategy", label: "Open positions per strategy", help: "Default 4." },
  { key: "max_daily_deploy_pct", label: "Daily deploy", help: "0.5 means new buys may use half of Engine can use now, measured at the first buy step." },
  { key: "max_sells_per_day", label: "Max sells a day", help: "A GTT stop does not use this slot." },
  { key: "max_open_positions", label: "Max open positions", help: "One position per symbol." },
  { key: "max_per_sector", label: "Max per sector", help: "Same Nifty 500 industry." },
  { key: "breaker_pct", label: "Breaker drawdown", help: "0.25 pauses new trades at a 25% drop from peak." },
  { key: "chase_pct", label: "Do not chase above", help: "0.03 skips a buy more than 3% above the signal close." },
];

export function SettingsView() {
  const kiteFlag = useSearchParams().get("kite");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [note, setNote] = useState("");
  const [limitOpen, setLimitOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const kiteNote = kiteFlag === "connected"
    ? "Kite is connected for today."
    : kiteFlag === "error"
      ? "Kite login did not finish. Try reconnect."
      : "";
  async function load() {
    const res = await fetch("/api/mlive/settings");
    if (!res.ok) return;
    setPayload(await res.json());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(key: string, value: unknown) {
    const res = await fetch("/api/mlive/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setNote(res.ok ? "Saved. The next engine run uses it." : "Could not save");
    await load();
  }

  async function mode(next: "approve" | "auto" | "paused") {
    await fetch("/api/mlive/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    await load();
  }

  async function changeLimit(kind: "deposit" | "withdrawal") {
    const parsed = Number(amount);
    if (!(parsed > 0)) return;
    const res = await fetch("/api/mlive/fund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, amount: parsed, note: kind === "deposit" ? "Raise limit" : "Lower limit" }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setNote(res.ok ? "Trading limit updated. The breaker peak moved with it." : body?.error || "Could not change the limit");
    if (res.ok) {
      setAmount("");
      setLimitOpen(false);
      await load();
    }
  }

  if (!payload) return <p className="page">Loading settings…</p>;
  const settings = payload.settings;
  const nextReview = payload.nextReview;
  const modeNow = String(payload.state?.mode ?? settings.mode ?? "approve").replace(/"/g, "");
  const strategies = enabled(settings.strategies_enabled);
  const status = String(payload.state?.status ?? "active");
  const engineAt = payload.engine?.finished_at
    ? new Date(String(payload.engine.finished_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "no run yet";

  return (
    <section className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Settings</h1>
          <p className="sub">Changes apply on the next engine run. Exit rules are fixed from the backtest and shown read-only. Next review {nextReview}.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn warn" onClick={async () => { await fetch("/api/mlive/kite/disconnect", { method: "POST" }); setNote("Disconnected"); await load(); }}>Disconnect</button>
          <a className="btn primary" href="/api/mlive/kite/login">Reconnect Kite</a>
        </div>
      </div>
      {(kiteNote || note) && <p className="sub">{kiteNote || note}</p>}
      <div className="stats cash-strip">
        <div className="card stat">
          <p className="lbl">Cash in Kite</p>
          <div className={`v n ${payload.kiteFunds.cash != null && payload.kiteFunds.cash <= 0 ? "down" : payload.kiteFunds.cash != null ? "up" : ""}`}>
            {payload.kiteFunds.cash == null ? "—" : inr(payload.kiteFunds.cash, 2)}
          </div>
          <div className="h">{payload.kiteFunds.error ? payload.kiteFunds.error : payload.kiteFunds.connected ? payload.cashNote || "Live available equity cash." : "Connect Kite to see the cash in the account."}</div>
        </div>
        <div className="card stat">
          <p className="lbl">Trading limit</p>
          <div className="v n">{inr(payload.tradingLimit)}</div>
          <div className="h">Grows with profit. The engine never uses more than this.</div>
        </div>
        <div className="card stat">
          <p className="lbl">Engine can use now</p>
          <div className={`v n ${payload.engineCanUse <= 0 ? "down" : "up"}`}>{inr(payload.engineCanUse)}</div>
          <div className="h">After holdings, pending buys, and the cash reserve.</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="field" style={{ borderTop: 0 }}>
          <div><b>Change the trading limit</b><small>Raise or lower it. The breaker peak moves by the same amount.</small></div>
          <button type="button" className="btn" onClick={() => setLimitOpen((open) => !open)}>{limitOpen ? "Close" : "Change limit"}</button>
        </div>
        {limitOpen && (
          <div className="field">
            <input className="n" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" inputMode="decimal" aria-label="Limit change amount" />
            <button type="button" className="btn" onClick={() => changeLimit("deposit")}>Raise limit</button>
            <button type="button" className="btn" onClick={() => changeLimit("withdrawal")}>Lower limit</button>
          </div>
        )}
      </div>
      <div className="set-grid" style={{ marginTop: 16 }}>
        <div className="card span-2">
          <div className="card-h"><h2>How orders go out</h2></div>
          <div className="modes">
            {(["approve", "auto", "paused"] as const).map((item) => (
              <button key={item} type="button" className="mode" data-mode={item} aria-pressed={modeNow === item} onClick={() => mode(item)}>
                <b>{item === "approve" ? "Approve each" : item === "auto" ? "Fully automatic" : "Paused"}</b>
                <span>{item === "approve" ? "You confirm each buy and sell." : item === "auto" ? "The engine sends inside the rules." : "No new orders. Stops still protect."}</span>
              </button>
            ))}
          </div>
          <div className="field">
            <div><b>Account</b><small>Zerodha client ID</small></div>
            <span className="n">{payload.kite?.kiteUserId || "—"}</span>
          </div>
          <div className="field">
            <div><b>Session</b><small>Kite tokens expire every morning</small></div>
            <span className={`pill ${payload.kite?.connected ? "on" : "off"}`}>{payload.kite?.connected ? `Connected ${payload.kite.connectedAt ? new Date(payload.kite.connectedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""}` : "Not connected"}</span>
          </div>
          <div className="field">
            <div><b>Static IP</b><small>Whitelisted for order placement</small></div>
            <span className="n">139.59.51.34</span>
          </div>
          <div className="field">
            <div><b>Engine health</b><small>Last run {payload.engine?.kind ?? "—"} · {payload.engine?.status ?? "—"} · {engineAt}. Orders leave from the server, not the relay.</small></div>
            <span className={`pill ${payload.engine?.status === "ok" ? "on" : "warn"}`}>{payload.engine?.status === "ok" ? "Healthy" : payload.engine ? String(payload.engine.status) : "Waiting"}</span>
          </div>
          <div className="field">
            <div><b>Morning login reminder</b><small>Push at 08:30 and again at 09:00 if there is no session</small></div>
            <Toggle on={settings.login_reminder !== false} label="Morning login reminder" onClick={() => save("login_reminder", settings.login_reminder === false)} />
          </div>
          {(status === "paused_by_breaker" || status === "paused_by_user") && (
            <div className="field">
              <div><b>Resume</b><small>{status === "paused_by_breaker" ? "The breaker stays paused until you resume." : "Paused from Home or Settings."}</small></div>
              <button type="button" className="btn primary" onClick={async () => { await fetch("/api/mlive/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resume: true }) }); await load(); }}>Resume</button>
            </div>
          )}
          <div className="field">
            <div><b>Dry run</b><small>On until you turn it off in the database. The web does not flip this.</small></div>
            <span className={`pill ${settings.dry_run === false ? "on" : "warn"}`}>{settings.dry_run === false ? "Off · live" : "On · simulated"}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Money rules</h2></div>
          {NUMBER_FIELDS.map((field) => (
            <label className="field" key={field.key}>
              <div><b>{field.label}</b><small>{field.help}</small></div>
              <input
                className="n"
                defaultValue={val(settings, field.key)}
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) void save(field.key, next);
                }}
              />
            </label>
          ))}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>Exit rules</h2><p className="sub">Chosen 5 Nov 2026. Read only.</p></div>
            <div className="field"><div><b>RS</b><small>Chandelier: highest close since entry minus 2.5 × ATR(14). Ratchet up only. No 52-week tighten. GTT 3% below the stop.</small></div></div>
            <div className="field"><div><b>EMA</b><small>Daily close below the 20-day EMA. The stop can fall with the EMA. Skip a limit entry that sits below the EMA. GTT 3% below.</small></div></div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Strategies</h2><p className="sub">Next review {nextReview}.</p></div>
            {(["rs", "ema"] as const).map((strategy) => (
              <div className="field" key={strategy}>
                <div><b>{strategy === "rs" ? "RS Resilience" : "EMA Pullback"}</b></div>
                <Toggle
                  on={strategies.includes(strategy)}
                  label={strategy === "rs" ? "RS Resilience" : "EMA Pullback"}
                  onClick={() => {
                    const next = strategies.includes(strategy) ? strategies.filter((item) => item !== strategy) : [...strategies, strategy];
                    void save("strategies_enabled", next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
