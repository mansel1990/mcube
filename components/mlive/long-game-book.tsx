"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Book = {
  core: boolean;
  radar: boolean;
  secondary: string;
  radarBlocked: boolean;
  radarMoves: number;
  radarCap: number;
  value: number;
  moneyAdded: number;
  gain: number;
  nifty: number;
  pockets: { core: number; radar: number };
  pending: { id: number; pocket: string; reason: string; suggested: number; expiresOn: string | null } | null;
  untracked: { symbol: string; units: number; note: string }[];
  needsYou: { symbol: string; units: number; note: string }[];
  history: { kind: string; amount: number; pocket: string }[];
};

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function LongGameBook() {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" })
      .then(async (res) => { if (res.ok) setBook(await res.json() as Book); });
  }, []);
  const total = (book?.pockets.core ?? 0) + (book?.pockets.radar ?? 0);
  const corePct = total > 0 ? (book!.pockets.core / total) * 100 : 0;
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Long Game</h1>
          <p className="sub">
            <span className="chip" style={{ background: "var(--longgame)", color: "var(--ink)" }}>Long Game</span>
            {" "}Core and Radar are off. Nothing here places an order.
          </p>
        </div>
        <a className="btn" href="#register-holding">Register existing holding</a>
      </div>
      {book?.pending && (
        <p className="sub">Pending {book.pending.pocket} suggestion: {book.pending.reason} Suggested {inr(book.pending.suggested)}.</p>
      )}
      {!book?.pending && <p className="sub">No pending suggestion.</p>}
      <p className="sub">Core check: {book?.core ? "on" : "off"}. Core does not need a held-back pass.</p>
      <p className="sub">
        Radar check: {book?.radar ? "on" : "off"}.
        {book?.secondary === "next"
          ? " Next 50 blocks Radar."
          : " Radar runs only for Midcap 150, and only after its held-back drawdown is at most 15% and lower than STATIC-MID."}
        {" "}Moves this year {book?.radarMoves ?? 0} of {book?.radarCap ?? 12}.
      </p>
      <div className="stats">
        <div className="card stat"><p className="lbl">Value</p><div className="v n">{inr(book?.value ?? 0)}</div></div>
        <div className="card stat"><p className="lbl">Money added</p><div className="v n">{inr(book?.moneyAdded ?? 0)}</div></div>
        <div className="card stat"><p className="lbl">Gain</p><div className="v n">{inr(book?.gain ?? 0)}</div></div>
        <div className="card stat"><p className="lbl">Nifty 50</p><div className="v n">{inr(book?.nifty ?? 0)}</div></div>
      </div>
      <div className="book-row" style={{ marginTop: 16 }}>
        <article className="card book-card longgame">
          <p className="lbl"><span className="book-dot longgame" /> Core</p>
          <div className="book-pnl n">{inr(book?.pockets.core ?? 0)}</div>
        </article>
        <article className="card book-card longgame">
          <p className="lbl"><span className="book-dot longgame" /> Radar</p>
          <div className="book-pnl n">{inr(book?.pockets.radar ?? 0)}</div>
        </article>
      </div>
      <div className="meter" aria-hidden="true" style={{ marginTop: 12 }}><i style={{ width: `${corePct}%`, background: "var(--longgame)" }} /></div>
      <p className="sub">Allocation bar: Core {Math.round(corePct)}%, Radar {Math.round(100 - corePct)}% when the book has value.</p>
      {(book?.untracked.length ?? 0) > 0 && (
        <p className="sub">Untracked holdings: {book!.untracked.map((row) => `${row.symbol} ${row.units}`).join(", ")}. <a href="#register-holding">Register</a></p>
      )}
      <article className="card" style={{ marginTop: 16 }}>
        <div className="card-h"><h2>History</h2></div>
        {(book?.history.length ?? 0) === 0 ? <p className="sub">No Long Game ledger rows yet.</p> : (
          <ul>{book!.history.map((row, index) => <li key={`${row.kind}-${index}`}>{row.pocket} {row.kind} {inr(row.amount)}</li>)}</ul>
        )}
      </article>
      <p className="sub"><Link href="/live-trade-mansel/long-term/suggestion">Suggestion preview</Link></p>
    </section>
  );
}

export function LongGameReport({ combined }: { combined: boolean }) {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" })
      .then(async (res) => { if (res.ok) setBook(await res.json() as Book); });
  }, []);
  return (
    <article className="card book-card longgame" style={{ marginTop: 16 }}>
      <h2>{combined ? "Combined" : "Long Game"}</h2>
      <p className="sub">{combined ? "Combined adds Long Game beside Swing. The Swing filter itself is unchanged." : "Long Game is a separate book. Swing totals stay on the Swing filter."}</p>
      <div className="trio">
        <div><span className="lbl">Value</span><b className="n">{inr(book?.value ?? 0)}</b></div>
        <div><span className="lbl">Money added</span><b className="n">{inr(book?.moneyAdded ?? 0)}</b></div>
        <div><span className="lbl">Gain</span><b className="n">{inr(book?.gain ?? 0)}</b></div>
      </div>
    </article>
  );
}

export function LongGameToday() {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    void fetch("/api/mlive/long-game/book", { cache: "no-store" })
      .then(async (res) => { if (res.ok) setBook(await res.json() as Book); });
  }, []);
  if (!book) return null;
  return (
    <>
      {book.needsYou.length > 0 && (
        <article className="card" style={{ marginTop: 16 }}>
          <div className="card-h"><h2>Needs you</h2></div>
          {book.needsYou.map((row) => <p key={row.symbol} className="sub">{row.symbol}: {row.note || `${row.units} units`}</p>)}
        </article>
      )}
      <article className="card book-card longgame" style={{ marginTop: 16 }}>
        <div className="book-top">
          <p className="lbl"><span className="book-dot longgame" /> Long Game</p>
          <Link href="/live-trade-mansel/long-term">Open</Link>
        </div>
        <div className="book-pnl n">{inr(book.value)}</div>
        <p className="sub">{book.core || book.radar ? "A sleeve is on." : "Off. Core and Radar are not taking new money."}</p>
      </article>
    </>
  );
}
