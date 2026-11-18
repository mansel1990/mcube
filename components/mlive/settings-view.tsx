"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { haltReasonText } from "@/lib/mlive/rules";
import { useIntradayRetired } from "./capabilities";

type Settings = Record<string, unknown>;
type Payload = {
  settings: Settings;
  nextReview: string;
  state: { status?: string; mode?: string; halt_reason?: string | null } | null;
  kite: { connected: boolean; connectedAt: string | null; kiteUserId: string | null } | null;
  tradingLimit: number;
  engine: { kind?: string; status?: string; finished_at?: string } | null;
};

const PCT = new Set(["risk_pct", "max_order_pct", "max_daily_deploy_pct", "chase_pct", "breaker_pct", "intraday_risk_pct", "intraday_day_loss_pct"]);

function num(settings: Settings, key: string, fallback: number): number {
  const raw = settings[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function shown(settings: Settings, key: string, fallback: number): string {
  const value = num(settings, key, fallback);
  if (PCT.has(key)) return String(Math.round(value * 1000) / 10);
  return String(value);
}

function stored(key: string, text: string): number | string | boolean {
  if (key === "intraday_exit_time") return text;
  const value = Number(text);
  if (!Number.isFinite(value)) return text;
  return PCT.has(key) ? value / 100 : value;
}

function AboutLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <div><b>{label}</b><small>Read-only page. Anyone with the link can open it.</small></div>
      <span>
        <Link className="btn" href={href}>Open</Link>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const url = `${window.location.origin}${href}`;
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >{copied ? "Copied" : "Copy share link"}</button>
      </span>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <div><b>{label}</b></div>
      <span>
        {unit ? <span className="unit">{unit}</span> : null}
        <input className="n" value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
      </span>
    </label>
  );
}

export function SettingsView() {
  const intradayOff = useIntradayRetired();
  const kiteFlag = useSearchParams().get("kite");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState("");
  const [shortOn, setShortOn] = useState(true);
  const [remind, setRemind] = useState(true);
  const [swingMore, setSwingMore] = useState(false);
  const [dayMore, setDayMore] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(kiteFlag === "connected" ? "Kite is connected." : "");

  async function load() {
    const res = await fetch("/api/mlive/settings");
    if (!res.ok) return;
    const body = (await res.json()) as Payload;
    setPayload(body);
    const settings = body.settings;
    const next: Record<string, string> = {};
    for (const key of ["breaker_pct", "max_order_pct", "risk_pct", "max_new_buys_per_day", "max_daily_deploy_pct", "min_order_inr", "cash_reserve_inr", "max_open_positions", "max_buys_per_strategy_per_day", "max_open_per_strategy", "max_per_sector", "max_sells_per_day", "chase_pct", "max_buys_per_day", "intraday_capital_inr", "intraday_risk_pct", "intraday_day_loss_pct", "intraday_max_trades", "intraday_watchlist", "intraday_freeze_days"]) {
      next[key] = shown(settings, key, 0);
    }
    const window = settings.intraday_entry_window;
    const entry = window && typeof window === "object" ? window as { before?: string; after?: string } : {};
    next.intraday_entry_before = entry.before ?? "";
    next.intraday_entry_after = entry.after ?? "";
    next.intraday_exit_time = String(settings.intraday_exit_time ?? "15:10").replace(/"/g, "");
    setDraft(next);
    setLimit(String(Math.round(body.tradingLimit)));
    setShortOn(settings.intraday_short !== false);
    setRemind(settings.login_reminder !== false);
    setDirty(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function edit(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const modeNow = String(payload?.state?.mode ?? "approve").replace(/"/g, "");
  const status = String(payload?.state?.status ?? "active");
  const paused = status === "paused_by_user" || status === "paused_by_breaker" || modeNow === "paused";

  async function commitMode(next: "approve" | "auto") {
    setConfirmAuto(false);
    setBusy(true);
    try {
      await fetch("/api/mlive/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: next }) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!payload) return;
    setBusy(true);
    const changes: Record<string, unknown> = {};
    for (const [key, text] of Object.entries(draft)) {
      if (key === "intraday_entry_before" || key === "intraday_entry_after") continue;
      changes[key] = key === "intraday_exit_time" ? text : stored(key, text);
    }
    changes.intraday_entry_window = { before: draft.intraday_entry_before ?? "", after: draft.intraday_entry_after ?? "" };
    changes.intraday_short = shortOn;
    changes.login_reminder = remind;
    changes.intraday_leverage = 1;
    const res = await fetch("/api/mlive/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; queued?: string[] } | null;
    const nextLimit = Number(limit);
    if (res.ok && nextLimit > 0 && nextLimit !== Math.round(payload.tradingLimit)) {
      const delta = nextLimit - payload.tradingLimit;
      await fetch("/api/mlive/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: delta > 0 ? "deposit" : "withdrawal", amount: Math.abs(delta), note: "Trading limit" }),
      });
    }
    setNote(!res.ok ? body?.error || "Could not save" : body?.queued?.length ? "Saved. A looser limit starts the next market day." : "Saved.");
    setBusy(false);
    await load();
  }

  if (!payload) return <p className="page">Loading settings…</p>;
  const connectedAt = payload.kite?.connectedAt
    ? new Date(payload.kite.connectedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "";
  const swingMoreFields = [
    ["min_order_inr", "Smallest order", "₹"],
    ["cash_reserve_inr", "Cash kept back", "₹"],
    ["max_open_positions", "Open positions, at most", ""],
    ["max_buys_per_strategy_per_day", "Buys per strategy a day", ""],
    ["max_open_per_strategy", "Open per strategy", ""],
    ["max_per_sector", "Per sector, at most", ""],
    ["max_sells_per_day", "Sells a day, at most", ""],
    ["chase_pct", "Skip a buy above signal by", "%"],
    ["max_buys_per_day", "Orders the engine may send a day", ""],
  ] as const;
  const capital = Number(draft.intraday_capital_inr || "0");

  return (
    <section className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <button type="button" className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
      {note && <p className="sub">{note}</p>}
      {toast && <p className="toast" role="status">{toast}</p>}
      {kiteFlag === "error" && <p className="sub">Kite login did not finish. Try reconnect.</p>}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="field">
          <div><b>Engine</b><small>{paused ? "Paused" : "Running"}</small></div>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            await fetch("/api/mlive/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(paused ? { resume: true } : { pause: true }) });
            setBusy(false);
            await load();
          }}>{paused ? "Resume engine" : "Pause engine"}</button>
        </div>
        <div className="field">
          <div><b>Mode</b></div>
          <div className="seg" role="group" aria-label="Mode">
            <button type="button" data-tone="auto" aria-pressed={modeNow === "auto"} disabled={busy} onClick={() => { if (modeNow !== "auto") setConfirmAuto(true); }}>Auto</button>
            <button type="button" data-tone="you" aria-pressed={modeNow === "approve" || modeNow === "paused"} disabled={busy} onClick={() => void commitMode("approve")}>Approval</button>
          </div>
        </div>
        {confirmAuto && (
          <div className="field" role="alertdialog" aria-label="Confirm fully automatic">
            <div><b>Switch to Auto?</b><small>The engine will send orders inside the rules without asking you.</small></div>
            <span>
              <button type="button" className="btn" onClick={() => setConfirmAuto(false)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void commitMode("auto")}>Confirm</button>
            </span>
          </div>
        )}
        <div className="field">
          <div><b>Kite</b><small>{payload.kite?.connected ? `Connected ${connectedAt}` : "Not connected"}</small></div>
          <a className="btn" href="/api/mlive/kite/login">Reconnect</a>
        </div>
        <Field label="Breaker drawdown" unit="%" value={draft.breaker_pct ?? ""} onChange={(value) => edit("breaker_pct", value)} />
        <div className="field">
          <div><b>Morning login reminder</b></div>
          <button type="button" className="switch" aria-pressed={remind} onClick={() => { setRemind((on) => !on); setDirty(true); }}>
            <span className="word">{remind ? "On" : "Off"}</span><span className="knob" />
          </button>
        </div>
        {(status === "paused_by_breaker" || status === "halted_today") && (
          <div className="field">
            <div><b>Resume</b><small>{status === "halted_today" ? haltReasonText(payload.state?.halt_reason ?? null) : "The breaker stays paused until you resume."}</small></div>
          </div>
        )}
      </div>
      <div className="set-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h2><i className="book-dot" style={{ background: "var(--swing)", marginRight: 8 }} />Swing book</h2></div>
          <Field label="Trading limit" unit="₹" value={limit} onChange={(value) => { setLimit(value); setDirty(true); }} />
          <Field label="Most in one order" unit="%" value={draft.max_order_pct ?? ""} onChange={(value) => edit("max_order_pct", value)} />
          <Field label="Risk per trade" unit="%" value={draft.risk_pct ?? ""} onChange={(value) => edit("risk_pct", value)} />
          <Field label="New buys a day" unit="" value={draft.max_new_buys_per_day ?? ""} onChange={(value) => edit("max_new_buys_per_day", value)} />
          <Field label="Cash used in one day" unit="%" value={draft.max_daily_deploy_pct ?? ""} onChange={(value) => edit("max_daily_deploy_pct", value)} />
          <div className="field"><button type="button" className="btn" onClick={() => setSwingMore((open) => !open)}>{swingMore ? "Fewer rules" : "More rules (9)"}</button></div>
          {swingMore && swingMoreFields.map(([key, label, unit]) => (
            <Field key={key} label={label} unit={unit} value={draft[key] ?? ""} onChange={(value) => edit(key, value)} />
          ))}
        </div>
        {!intradayOff && <div className="card">
          <div className="card-h"><h2><i className="book-dot" style={{ background: "var(--intraday)", marginRight: 8 }} />Intraday book</h2></div>
          <Field label="Capital" unit="₹" value={draft.intraday_capital_inr ?? ""} onChange={(value) => edit("intraday_capital_inr", value)} />
          <div className="field">
            <div><b>Leverage</b><small>Buying power ₹{Number.isFinite(capital) ? capital.toLocaleString("en-IN") : "—"}. No leverage.</small></div>
            <div className="seg lev" role="group" aria-label="Leverage">
              {[1, 2, 3, 4, 5].map((step) => (
                <button key={step} type="button" aria-pressed={step === 1} disabled={step !== 1}>{step}×</button>
              ))}
            </div>
          </div>
          <Field label="Risk per trade" unit="%" value={draft.intraday_risk_pct ?? ""} onChange={(value) => edit("intraday_risk_pct", value)} />
          <Field label="Day loss limit" unit="%" value={draft.intraday_day_loss_pct ?? ""} onChange={(value) => edit("intraday_day_loss_pct", value)} />
          <Field label="Trades a day, at most" unit="" value={draft.intraday_max_trades ?? ""} onChange={(value) => edit("intraday_max_trades", value)} />
          <Field label="Close everything by" unit="" value={draft.intraday_exit_time ?? ""} onChange={(value) => edit("intraday_exit_time", value)} />
          <div className="field">
            <div><b>Allow short selling</b></div>
            <button type="button" className="switch" aria-pressed={shortOn} onClick={() => { setShortOn((on) => !on); setDirty(true); }}>
              <span className="word">{shortOn ? "On" : "Off"}</span><span className="knob" />
            </button>
          </div>
          <div className="field"><button type="button" className="btn" onClick={() => setDayMore((open) => !open)}>{dayMore ? "Fewer rules" : "More rules (4)"}</button></div>
          {dayMore && (
            <>
              <Field label="No new trade before" unit="" value={draft.intraday_entry_before ?? ""} onChange={(value) => edit("intraday_entry_before", value)} />
              <Field label="No new trade after" unit="" value={draft.intraday_entry_after ?? ""} onChange={(value) => edit("intraday_entry_after", value)} />
              <Field label="Watchlist size" unit="" value={draft.intraday_watchlist ?? ""} onChange={(value) => edit("intraday_watchlist", value)} />
              <Field label="Freeze size after red days" unit="" value={draft.intraday_freeze_days ?? ""} onChange={(value) => edit("intraday_freeze_days", value)} />
            </>
          )}
        </div>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h"><h2>About</h2></div>
        <AboutLink href="/about/philosophy" label="Our philosophy" />
        <AboutLink href="/about/rules" label="Rules" />
      </div>
      <p className="note">Exit rules change in code. Swing stays delivery and long only. Next review {payload.nextReview}.</p>
    </section>
  );
}
