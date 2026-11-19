"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RegisterFromKite } from "./long-game-register";
import { LoadError, PageSkeleton } from "./loading";
import { ReasonHelp } from "./reason-help";

type Holding = { pocket: string; symbol: string; units: number; average: number; value: number };
type HistoryRow = { date: string; pocket: string; what: string; moneyAdded: number | null; status: string };
type Book = {
  core: boolean;
  secondary: string;
  value: number;
  moneyAdded: number;
  gain: number;
  cash?: number;
  niftySameDatesPct: number | null;
  pocketMoney?: { core: number };
  pending: { id: number; reason: string; suggested: number; expiresOn: string | null } | null;
  history: HistoryRow[];
  holdings: Holding[];
  untracked?: { symbol: string; units: number; note: string }[];
  nextCheck: string;
};

const HOW = "Core holds a fixed mix of four ETFs. You approve every move. Money goes in only when a suggestion asks for it.";

const SLEEVES = [
  { key: "nifty", symbol: "NIFTYBEES", name: "Nifty 50", target: 40 },
  { key: "secondary", symbol: "MID150BEES", name: "Midcap 150", target: 20 },
  { key: "gold", symbol: "GOLDBEES", name: "Gold", target: 25 },
  { key: "liquid", symbol: "LIQUIDBEES", name: "Liquid", target: 15 },
] as const;

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function signed(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${inr(Math.abs(value))}`;
}

function signedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function longDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function shortCheck(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  const when = new Date(Date.UTC(year, month - 1, date));
  const weekday = when.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const monthName = when.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${weekday} ${date} ${monthName}`;
}

function sleevesFor(secondary: string) {
  return SLEEVES.map((sleeve) => sleeve.key === "secondary"
    ? { ...sleeve, symbol: secondary === "next" ? "JUNIORBEES" : "MID150BEES", name: secondary === "next" ? "Next 50" : "Midcap 150" }
    : sleeve);
}

function statusChip(status: string): string {
  if (status === "Done") return "profit-pill";
  if (status === "Rejected") return "loss-pill";
  return "off-pill";
}

export function LongGameBook() {
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [turning, setTurning] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  function load() {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setBook(await res.json() as Book);
    }).catch(() => setFailed(true));
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function turnOn() {
    setTurning(true);
    setEnableError(null);
    const res = await fetch("/api/mlive/long-game/enable", { method: "POST" });
    setTurning(false);
    if (!res.ok) {
      setEnableError("Core could not be turned on.");
      return;
    }
    setConfirmOn(false);
    load();
  }

  if (failed) return <LoadError message="The Long Game book could not be loaded." onRetry={() => { setFailed(false); load(); }} />;
  if (!book) return <PageSkeleton kind="long" label="Loading Long Game" />;

  const sleeves = sleevesFor(book.secondary);
  const coreHoldings = book.holdings.filter((row) => row.pocket === "core");
  const coreValue = coreHoldings.reduce((sum, row) => sum + row.value, 0);
  const coreAdded = book.pocketMoney?.core ?? book.moneyAdded;
  const gainPct = book.moneyAdded > 0 ? (book.gain / book.moneyAdded) * 100 : null;
  const untracked = book.untracked ?? [];

  return (
    <section className="page long-game-page">
      <header className="lg-title">
        <h1>
          Long Game{" "}
          {book.core ? <span className="chip longgame-pill">Long Game book</span> : <span className="chip off-pill">Off</span>}
        </h1>
        <ReasonHelp className="how-link" text={HOW} label="How it works"><span aria-hidden="true">ⓘ </span>How it works</ReasonHelp>
      </header>

      {book.core ? (
        <LiveBook book={book} sleeves={sleeves} coreHoldings={coreHoldings} coreAdded={coreAdded} gainPct={gainPct} untracked={untracked} onRegister={() => setRegisterOpen(true)} />
      ) : (
        <OffBook holdings={coreHoldings} value={coreValue} onTurnOn={() => { setEnableError(null); setConfirmOn(true); }} onRegister={() => setRegisterOpen(true)} />
      )}

      {confirmOn && (
        <div className="modal-back" onClick={() => setConfirmOn(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="turn-on-core" onClick={(event) => event.stopPropagation()}>
            <h2 id="turn-on-core">Turn on Core</h2>
            <p>Core becomes the live book. You still approve every move.</p>
            {enableError && <p>{enableError}</p>}
            <div className="approval-actions">
              <button type="button" className="btn" onClick={() => setConfirmOn(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={turning} onClick={() => void turnOn()}>Turn on Core</button>
            </div>
          </div>
        </div>
      )}
      <RegisterFromKite open={registerOpen} onClose={() => { setRegisterOpen(false); load(); }} />
    </section>
  );
}

function OffBook({
  holdings,
  value,
  onTurnOn,
  onRegister,
}: {
  holdings: Holding[];
  value: number;
  onTurnOn: () => void;
  onRegister: () => void;
}) {
  const line = holdings.length === 0 ? null : holdings.map((row) => `${row.symbol} ${row.units} units, from your Kite`).join(" · ");
  return (
    <>
      <article className="long-hero">
        <span className="chip longgame-pill">Long Game book</span>
        <p className="hero-line">Slow money in four ETFs. You approve every move.</p>
        <div className="core-tile">
          <h2>Core · fixed mix</h2>
          <div className="core-tile-body">
            <b className="n">{value > 0 ? inr(value) : "Empty"}</b>
            {line ? <p>{line}</p> : <p>No holding registered yet.</p>}
          </div>
          <p className="mix">40 / 20 / 25 / 15</p>
        </div>
        <div className="lg-actions">
          <button type="button" className="btn light" onClick={onTurnOn}>Turn on Core</button>
          <button type="button" className="btn ghost" onClick={onRegister}>Register from Kite</button>
        </div>
      </article>
      <p className="lg-note">Once Core is on, this page becomes the live book.</p>
    </>
  );
}

function LiveBook({
  book,
  sleeves,
  coreHoldings,
  coreAdded,
  gainPct,
  untracked,
  onRegister,
}: {
  book: Book;
  sleeves: { key: string; symbol: string; name: string; target: number }[];
  coreHoldings: Holding[];
  coreAdded: number;
  gainPct: number | null;
  untracked: { symbol: string; units: number; note: string }[];
  onRegister: () => void;
}) {
  const value = coreHoldings.reduce((sum, row) => sum + row.value, 0) || book.value;
  return (
    <>
      <article className="lg-status">
        {book.pending ? (
          <>
            <p>Suggestion waiting{book.pending.expiresOn ? ` · expires ${longDay(book.pending.expiresOn)}` : ""}</p>
            <Link className="btn primary" href="/live-trade-mansel/long-term/suggestion">Review</Link>
          </>
        ) : (
          <p><i className="lg-dot" aria-hidden="true" /> No suggestion waiting · next check {shortCheck(book.nextCheck)}</p>
        )}
      </article>

      <div className="lg-stats">
        <article className="card stat">
          <p className="lbl">Total value</p>
          <div className="v n">{inr(book.value)}</div>
        </article>
        <article className="card stat">
          <p className="lbl">Money added</p>
          <div className="v n">{inr(book.moneyAdded)}</div>
        </article>
        <article className="card stat">
          <p className="lbl">Gain</p>
          <div className={`v n ${book.gain >= 0 ? "up" : "down"}`}>{signed(book.gain)}</div>
          {gainPct != null && <p className={`sub ${book.gain >= 0 ? "up" : "down"}`}>{signedPct(gainPct)} since first entry</p>}
        </article>
        {book.niftySameDatesPct != null && (
          <article className="card stat nifty-stat">
            <p className="lbl">Nifty 50, same dates</p>
            <div className={`v n ${book.niftySameDatesPct >= 0 ? "up" : "down"}`}>{signedPct(book.niftySameDatesPct)}</div>
          </article>
        )}
      </div>

      <article className="card book-card longgame lg-pocket">
        <div className="lg-pocket-head">
          <div>
            <h2>Core · fixed mix</h2>
          </div>
          <div className="lg-pocket-value">
            <b className="n">{inr(value)}</b>
            <span className={book.gain >= 0 ? "up" : "down"}>{signed(book.gain)}{gainPct != null ? <small> ({signedPct(gainPct)})</small> : null}</span>
          </div>
        </div>
        <div className="lg-sleeves">
          {sleeves.map((sleeve) => {
            const held = coreHoldings.find((row) => row.symbol === sleeve.symbol);
            const now = value > 0 && held ? (held.value / value) * 100 : 0;
            return (
              <div key={sleeve.symbol} className="lg-sleeve">
                <div className="lg-sleeve-name">
                  <b>{sleeve.name}</b>
                  <span>{sleeve.symbol}</span>
                  <span className="n">{held ? `${held.units} units` : "0 units"}</span>
                </div>
                <span className="lg-sleeve-pct n">{now.toFixed(0)}% / {sleeve.target}%</span>
                <span className="alloc" role="img" aria-label={`${sleeve.name} ${now.toFixed(0)} percent now, target ${sleeve.target} percent`}>
                  <i style={{ width: `${Math.min(100, now)}%` }} />
                  <em style={{ left: `${sleeve.target}%` }} />
                </span>
              </div>
            );
          })}
        </div>
        <div className="lg-pocket-foot">
          <span>Money added {inr(coreAdded)}</span>
          <span>Pocket cash <b className="n">{inr(book.cash ?? 0)}</b></span>
        </div>
      </article>

      <p className="lg-note">The bar is the current share; the dark tick is the target. Pocket cash normally stays at ₹0.</p>
      {untracked.length > 0 && (
        <p className="lg-note">
          {untracked.map((row) => `${row.symbol} ${row.units} units is in Kite and not in this book.`).join(" ")}{" "}
          <button type="button" className="btn" onClick={onRegister}>Register from Kite</button>
        </p>
      )}

      {book.history.length > 0 && (
        <article className="card lg-history">
          <h2>History</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>What happened</th>
                <th className="r">Money added</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {book.history.map((row) => (
                <tr key={`${row.date}-${row.what}`}>
                  <td className="n">{longDay(row.date)}</td>
                  <td>{row.what}</td>
                  <td className="r n">{row.moneyAdded == null ? "" : inr(row.moneyAdded)}</td>
                  <td className="r"><span className={`chip ${statusChip(row.status)}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}

export function LongGameReport({ combined }: { combined: boolean }) {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" }).then(async (res) => {
      if (res.ok) setBook(await res.json() as Book);
    });
  }, []);
  if (!book || (book.value === 0 && book.moneyAdded === 0)) return null;
  return (
    <article className="card book-card longgame" style={{ marginTop: 16 }}>
      <h2>{combined ? "Combined" : "Long Game"}</h2>
      <div className="trio">
        <div><span className="lbl">Value</span><b className="n">{inr(book.value)}</b></div>
        <div><span className="lbl">Money added</span><b className="n">{inr(book.moneyAdded)}</b></div>
        <div><span className="lbl">Gain</span><b className="n">{signed(book.gain)}</b></div>
      </div>
    </article>
  );
}

export function LongGameToday() {
  return null;
}
