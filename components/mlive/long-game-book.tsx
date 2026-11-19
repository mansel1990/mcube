"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatLongDate, formatMoney, formatPp, formatPrice, formatSignedMoney, formatSignedPct, type ChartPoint, type PresentedLot, type ValuedHolding } from "@/lib/mlive/long-game-value";
import { LongGameChart } from "./long-game-chart";
import { RegisterFromKite } from "./long-game-register";
import { LoadError, PageSkeleton } from "./loading";
import { ReasonHelp } from "./reason-help";

type HistoryRow = { date: string; pocket: string; what: string; moneyAdded: number | null; status: string };
type Book = {
  core: boolean;
  secondary: string;
  value: number;
  moneyAdded: number;
  gain: number;
  gainPct?: number | null;
  cash?: number;
  priceCaption?: string;
  chartNote?: string | null;
  vsNiftyPp?: number | null;
  niftyAdjustments?: { flowDate: string; usedDate: string }[];
  pocketMoney?: { core: number };
  pending: { id: number; reason: string; suggested: number; expiresOn: string | null } | null;
  history: HistoryRow[];
  holdings: ValuedHolding[];
  lots?: PresentedLot[];
  chart?: ChartPoint[];
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
  return formatMoney(value);
}

function signed(value: number): string {
  return formatSignedMoney(value);
}

function signedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatSignedPct(value);
}

function longDay(iso: string): string {
  return formatLongDate(iso);
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
  const gainPct = book.gainPct ?? (book.moneyAdded > 0 ? (book.gain / book.moneyAdded) * 100 : null);
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
  holdings: ValuedHolding[];
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
  coreHoldings: ValuedHolding[];
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
          <div className={`v n ${gainClass(book.gain)}`}>{signed(book.gain)}</div>
          {gainPct != null && <p className={`sub ${gainClass(book.gain)}`}>{signedPct(gainPct)} since first entry</p>}
        </article>
        {book.vsNiftyPp != null && (
          <article className="card stat nifty-stat">
            <p className="lbl">vs Nifty</p>
            <div className={`v n ${pctClass(book.vsNiftyPp)}`}>{formatPp(book.vsNiftyPp).replace("vs Nifty: ", "")}</div>
          </article>
        )}
      </div>
      {book.priceCaption && <p className="lg-note">{book.priceCaption}</p>}

      <article className="card book-card longgame lg-pocket">
        <div className="lg-pocket-head">
          <div>
            <h2>Core · fixed mix</h2>
          </div>
          <div className="lg-pocket-value">
            <b className="n">{inr(value)}</b>
            <span className={gainClass(book.gain)}>{signed(book.gain)}{gainPct != null ? <small> ({signedPct(gainPct)})</small> : null}</span>
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

      <div className="lg-register-row">
        <p className="lg-note">The bar is the current share; the dark tick is the target. Pocket cash normally stays at ₹0.</p>
        <button type="button" className="btn" onClick={onRegister}>Register from Kite</button>
      </div>
      {untracked.length > 0 && (
        <p className="lg-note">{untracked.map((row) => `${row.symbol} ${row.units} units is in Kite and not in this book.`).join(" ")}</p>
      )}

      {coreHoldings.length > 0 && <HoldingsTable rows={coreHoldings} />}
      {(book.lots?.length ?? 0) > 0 && <LotsSection lots={book.lots ?? []} />}
      <LongGameChart points={book.chart ?? []} note={book.chartNote ?? null} />
      {(book.niftyAdjustments?.length ?? 0) > 0 && (
        <p className="lg-note">{book.niftyAdjustments?.map((row) => `Nifty cash flow on ${longDay(row.flowDate)} used the close on ${longDay(row.usedDate)}.`).join(" ")}</p>
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

function gainClass(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "";
  return rounded > 0 ? "up" : "down";
}

function pctClass(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "";
  return rounded > 0 ? "up" : "down";
}

function priceSource(row: ValuedHolding): string {
  if (row.atCost || row.priceLabel) return row.priceLabel ?? "Price unavailable — shown at cost";
  if (row.priceSource === "kite_holding" && row.priceAt) {
    const time = new Date(row.priceAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
    return `Kite ${time}`;
  }
  if (row.priceAt) return `${row.priceSource === "daily_close" ? "Daily close" : "Earlier close"} ${longDay(row.priceAt)}`;
  return "";
}

function HoldingsTable({ rows }: { rows: ValuedHolding[] }) {
  const showContribution = rows.some((row) => row.contribution != null);
  const invested = rows.reduce((sum, row) => sum + row.invested, 0);
  const value = rows.reduce((sum, row) => sum + row.value, 0);
  const gain = rows.reduce((sum, row) => sum + row.gain, 0);
  return (
    <article className="card lg-holdings">
      <h2>Holdings</h2>
      <table>
        <thead>
          <tr>
            <th>ETF</th>
            <th>Sleeve</th>
            <th className="r">Units</th>
            <th className="r">Average cost</th>
            <th className="r">Last price</th>
            <th className="r">Value</th>
            <th className="r">Invested</th>
            <th className="r">Gain ₹</th>
            <th className="r">Gain %</th>
            {showContribution && <th className="r">Contribution to total gain</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol}>
              <td>{row.symbol}</td>
              <td>{row.sleeveName}</td>
              <td className="r n">{row.units.toLocaleString("en-IN")}</td>
              <td className="r n">{formatPrice(row.average)}</td>
              <td className="r n">{formatPrice(row.price)}<small>{priceSource(row)}</small></td>
              <td className="r n">{inr(row.value)}</td>
              <td className="r n">{inr(row.invested)}</td>
              <td className={`r n ${gainClass(row.gain)}`}>{signed(row.gain)}</td>
              <td className={`r n ${row.gainPct == null ? "" : pctClass(row.gainPct)}`}>{row.gainPct == null ? "" : signedPct(row.gainPct)}</td>
              {showContribution && <td className={`r n ${row.contribution == null ? "" : pctClass(row.contribution)}`}>{row.contribution == null ? "" : signedPct(row.contribution)}</td>}
            </tr>
          ))}
          <tr className="lg-total">
            <td>Total</td>
            <td />
            <td />
            <td />
            <td />
            <td className="r n">{inr(value)}</td>
            <td className="r n">{inr(invested)}</td>
            <td className={`r n ${gainClass(gain)}`}>{signed(gain)}</td>
            <td />
            {showContribution && <td className={`r n ${pctClass(gain)}`}>{signedPct(100)}</td>}
          </tr>
        </tbody>
      </table>
      <ul className="lg-holding-cards">
        {rows.map((row) => (
          <li key={row.symbol}>
            <b>{row.symbol}</b>
            <span>Sleeve <b>{row.sleeveName}</b></span>
            <span>Units <b className="n">{row.units.toLocaleString("en-IN")}</b></span>
            <span>Average cost <b className="n">{formatPrice(row.average)}</b></span>
            <span>Last price <b className="n">{formatPrice(row.price)}</b> {priceSource(row)}</span>
            <span>Value <b className="n">{inr(row.value)}</b></span>
            <span>Invested <b className="n">{inr(row.invested)}</b></span>
            <span>Gain ₹ <b className={`n ${gainClass(row.gain)}`}>{signed(row.gain)}</b></span>
            <span>Gain % <b className={`n ${row.gainPct == null ? "" : pctClass(row.gainPct)}`}>{row.gainPct == null ? "" : signedPct(row.gainPct)}</b></span>
            {showContribution && row.contribution != null && <span>Contribution to total gain <b className={`n ${pctClass(row.contribution)}`}>{signedPct(row.contribution)}</b></span>}
          </li>
        ))}
      </ul>
    </article>
  );
}

function LotsSection({ lots }: { lots: PresentedLot[] }) {
  return (
    <details className="card lg-lots">
      <summary>Your buy lots ({lots.length})</summary>
      <table>
        <thead>
          <tr>
            <th>Buy date</th>
            <th className="r">Open units</th>
            <th className="r">Buy price</th>
            <th className="r">Cost</th>
            <th className="r">Value now</th>
            <th className="r">Gain ₹</th>
            <th className="r">Gain %</th>
            <th>Long-term date</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id}>
              <td className="n">{longDay(lot.date)}{lot.quality ? <em>{lot.quality}</em> : null}</td>
              <td className="r n">{lot.units.toLocaleString("en-IN")}</td>
              <td className="r n">{formatPrice(lot.price)}</td>
              <td className="r n">{inr(lot.cost)}</td>
              <td className="r n">{inr(lot.value)}</td>
              <td className={`r n ${gainClass(lot.gain)}`}>{signed(lot.gain)}</td>
              <td className={`r n ${lot.gainPct == null ? "" : pctClass(lot.gainPct)}`}>{lot.gainPct == null ? "" : signedPct(lot.gainPct)}</td>
              <td className="n">{longDay(lot.longTermDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="lg-lot-cards">
        {lots.map((lot) => (
          <li key={lot.id}>
            <span>Buy date <b className="n">{longDay(lot.date)}</b>{lot.quality ? <em>{lot.quality}</em> : null}</span>
            <span>Open units <b className="n">{lot.units.toLocaleString("en-IN")}</b></span>
            <span>Buy price <b className="n">{formatPrice(lot.price)}</b></span>
            <span>Cost <b className="n">{inr(lot.cost)}</b></span>
            <span>Value now <b className="n">{inr(lot.value)}</b></span>
            <span>Gain ₹ <b className={`n ${gainClass(lot.gain)}`}>{signed(lot.gain)}</b></span>
            <span>Gain % <b className={`n ${lot.gainPct == null ? "" : pctClass(lot.gainPct)}`}>{lot.gainPct == null ? "" : signedPct(lot.gainPct)}</b></span>
            <span>Long-term date <b className="n">{longDay(lot.longTermDate)}</b></span>
          </li>
        ))}
      </ul>
    </details>
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
