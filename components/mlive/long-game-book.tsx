"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CORE_SLEEVES } from "@/lib/mlive/core-sleeves";
import { RegisterFromKite } from "./long-game-register";

type Holding = { pocket: string; symbol: string; units: number; average: number; value: number };
type Book = {
  core: boolean;
  value: number;
  moneyAdded: number;
  gain: number;
  nifty: number;
  pending: { id: number; pocket: string; reason: string; suggested: number; expiresOn: string | null } | null;
  history: { kind: string; amount: number; pocket: string }[];
  holdings: Holding[];
  nextCheck: string;
};

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function signed(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${inr(Math.abs(value))}`;
}

function shortDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function LongGameBook() {
  const [book, setBook] = useState<Book | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  function load() {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" }).then(async (res) => {
      if (res.ok) setBook(await res.json() as Book);
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/mlive/long-game/enable", { method: "POST" });
    setBusy(false);
    setConfirmOpen(false);
    if (!res.ok) {
      setNote("Core could not be turned on.");
      return;
    }
    setNote("Core is on.");
    load();
  }

  const coreHoldings = (book?.holdings ?? []).filter((row) => row.pocket !== "radar");
  const coreValue = coreHoldings.reduce((sum, row) => sum + row.value, 0);
  const on = book?.core === true;

  return (
    <section className="page long-game-page">
      <div className="page-head">
        <div>
          <h1>Long Game</h1>
          {!on && <span className="chip">Off</span>}
          {on && <span className="chip longgame-pill">Long Game book</span>}
        </div>
        <Link className="how-link" href="/about/rules#long-game">How it works</Link>
      </div>

      {!on && (
        <>
          <article className="long-hero">
            <span className="chip longgame-pill">Long Game book</span>
            <h2>Slow money in four ETFs. You approve every move.</h2>
          </article>
          <article className="core-tile">
            <p className="lbl">Core</p>
            <div className="big n">{coreValue > 0 ? inr(coreValue) : "Empty"}</div>
            {coreHoldings.length === 0 ? <p>Empty</p> : coreHoldings.map((row) => (
              <p key={row.symbol}>{row.symbol} {row.units} units, from your Kite</p>
            ))}
          </article>
          <div className="long-actions">
            <button type="button" className="btn primary" onClick={() => setConfirmOpen(true)}>Turn on Core</button>
            <button type="button" className="btn" onClick={() => setRegisterOpen(true)}>Register from Kite</button>
          </div>
          <p className="sub">Once Core is on, this page becomes the live book.</p>
        </>
      )}

      {on && (
        <>
          <p className="status-strip">
            {book?.pending
              ? `Suggestion waiting · expires ${book.pending.expiresOn ? shortDay(book.pending.expiresOn) : "soon"}`
              : `No suggestion waiting · next check ${shortDay(book?.nextCheck ?? "")}`}
            {book?.pending ? <Link href="/live-trade-mansel/long-term/suggestion">Review</Link> : null}
          </p>
          <div className="stats">
            <div className="card stat"><p className="lbl">Value</p><div className="v n">{inr(book?.value ?? 0)}</div></div>
            <div className="card stat"><p className="lbl">Money added</p><div className="v n">{inr(book?.moneyAdded ?? 0)}</div></div>
            <div className="card stat"><p className="lbl">Gain</p><div className={`v n ${(book?.gain ?? 0) >= 0 ? "up" : "down"}`}>{signed(book?.gain ?? 0)}</div></div>
            {(book?.nifty ?? 0) > 0 && <div className="card stat"><p className="lbl">Nifty 50</p><div className="v n">{inr(book?.nifty ?? 0)}</div></div>}
          </div>
          <article className="card book-card longgame" style={{ marginTop: 18 }}>
            <p className="lbl">Core</p>
            <div className="book-pnl n">{inr(coreValue)} <span className={(book?.gain ?? 0) >= 0 ? "up" : "down"}>{signed(book?.gain ?? 0)}</span></div>
            {CORE_SLEEVES.map((sleeve) => {
              const held = coreHoldings.find((row) => row.symbol === sleeve.symbol);
              const now = coreValue > 0 && held ? (held.value / coreValue) * 100 : 0;
              return (
                <div key={sleeve.symbol} className="sleeve-row">
                  <b>{sleeve.name}</b>
                  <span>{sleeve.symbol} {held ? `${held.units} units` : "0 units"}</span>
                  <span className="n">{now.toFixed(0)}% / {sleeve.target}%</span>
                  <span className="alloc" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, now)}%` }} />
                    <em style={{ left: `${sleeve.target}%` }} />
                  </span>
                </div>
              );
            })}
            <p>Money added {inr(book?.moneyAdded ?? 0)}</p>
          </article>
          {(book?.history.length ?? 0) > 0 && (
            <article className="card" style={{ marginTop: 18 }}>
              <div className="card-h"><h2>History</h2></div>
              <ul>{book?.history.filter((row) => row.pocket !== "radar").map((row, index) => <li key={`${row.kind}-${index}`}>{row.kind} {inr(row.amount)}</li>)}</ul>
            </article>
          )}
          <button type="button" className="btn" onClick={() => setRegisterOpen(true)}>Register from Kite</button>
        </>
      )}

      {note && <p className="sub">{note}</p>}
      <RegisterFromKite open={registerOpen} onClose={() => setRegisterOpen(false)} />
      {confirmOpen && (
        <div className="modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="core-confirm-title">
            <h2 id="core-confirm-title">Turn on Core?</h2>
            <ul>
              <li>Core suggestions will begin.</li>
              <li>Every move still needs owner approval.</li>
              <li>longterm will be added to enabled strategies.</li>
              <li>Radar remains off.</li>
            </ul>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void turnOn()}>Turn on Core</button>
          </div>
        </div>
      )}
    </section>
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
