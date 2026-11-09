"use client";

import { Fragment, useState } from "react";
import type { BookedCharges, ExitReason, PnlModel, PnlTrade } from "@/lib/mlive/pnl";
import { isoWeekKey } from "@/lib/mlive/pnl";
import {
  chargeGroups,
  downloadCsv,
  EXIT_REASONS,
  formatAvgDays,
  formatInr,
  formatProfitFactor,
  formatSample,
  formatWinRate,
  periodLabel,
  shortDate,
  toCsv,
  type ChargeGroup,
} from "./pnl-ui";

const EXIT_PILL: Record<ExitReason, string> = {
  trend_stop: "Trend stop",
  gtt_exit: "Stop hit",
  gtt_fallback: "Safety sell",
  manual: "Manual",
  breaker: "Breaker",
};

function sumBooked(rows: PnlTrade[]): BookedCharges {
  const out: BookedCharges = { brokerage: 0, stt: 0, exchange: 0, sebi: 0, stamp: 0, gst: 0, dp: 0, unclassified: 0, total: 0 };
  for (const trade of rows) {
    (Object.keys(out) as (keyof BookedCharges)[]).forEach((key) => {
      out[key] = Math.round((out[key] + (trade.charges[key] ?? 0)) * 100) / 100;
    });
  }
  return out;
}

function money(value: number, digits = 2): string {
  return formatInr(value, { digits });
}

function signed(value: number): string {
  return formatInr(value, { sign: true });
}

function deduct(value: number): string {
  if (Math.abs(value) < 0.005) return formatInr(0);
  return formatInr(-Math.abs(value), { sign: true });
}

function tone(value: number): string {
  return value > 0 ? "profit" : value < 0 ? "loss" : "";
}

function Info({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-wrap">
      <button type="button" className="info" aria-expanded={open} aria-label={label} onClick={() => setOpen((on) => !on)}>ⓘ</button>
      {open && <span className="popover" role="note">{label}</span>}
    </span>
  );
}

function SumCard({
  title,
  formula,
  value,
  sub,
  accent,
}: {
  title: string;
  formula: string;
  value: string;
  sub: string;
  accent: "profit" | "loss" | "open" | "charges" | "neutral";
}) {
  return (
    <article className={`card sheet accent accent-${accent}`}>
      <p className="lbl">{title} <Info label={formula} /></p>
      <p className={`sum-num ${accent}`}>{value}</p>
      <p className="muted">{sub}</p>
    </article>
  );
}

export function ReportsPnl({ pnl, onOpen }: { pnl: PnlModel; onOpen?: (trade: PnlTrade) => void }) {
  const [grain, setGrain] = useState<"day" | "week" | "month" | "all">("month");
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [chargesOpen, setChargesOpen] = useState(false);
  const summary = pnl.summary;
  const closed = pnl.trades.filter((trade) => trade.status === "closed");
  const open = pnl.trades.filter((trade) => trade.status === "open");
  const closedCharges = sumBooked(closed);
  const closedTurnover = closed.reduce((sum, trade) => sum + trade.fills.reduce((inner, fill) => inner + fill.qty * fill.price, 0), 0);
  const groups = chargeGroups(closedCharges);
  const rows = grain === "all"
    ? [{ period: "All", trades: closed.length, wins: closed.filter((trade) => trade.net > 0).length, gross: summary.grossRealised, charges: summary.charges, net: summary.netRealised, cumulative: summary.netRealised }]
    : pnl.byPeriod[grain];
  const totals = rows.reduce(
    (sum, row) => ({ trades: sum.trades + row.trades, wins: sum.wins + row.wins, gross: sum.gross + row.gross, charges: sum.charges + row.charges, net: sum.net + row.net }),
    { trades: 0, wins: 0, gross: 0, charges: 0, net: 0 }
  );

  function tradesFor(period: string): PnlTrade[] {
    return closed.filter((trade) => {
      const date = trade.exitDate ?? trade.entryDate;
      if (grain === "all") return true;
      if (grain === "day") return date === period;
      if (grain === "week") return isoWeekKey(date) === period;
      return date.slice(0, 7) === period;
    });
  }

  function exportPeriods() {
    downloadCsv("pnl-statement.csv", toCsv(
      ["Period", "Trades", "Won", "Gross", "Charges", "Net", "Running total"],
      rows.map((row) => [periodLabel(grain, row.period), row.trades, row.wins, row.gross, row.charges, row.net, row.cumulative])
    ));
  }

  const capitalLines: { label: string; text: string; strong?: boolean; rule?: boolean }[] = [
    { label: "Starting capital", text: money(pnl.capital.starting) },
  ];
  if (Math.abs(pnl.capital.deposits) >= 0.005) capitalLines.push({ label: "+ Later deposits", text: signed(pnl.capital.deposits) });
  if (Math.abs(pnl.capital.withdrawals) >= 0.005) capitalLines.push({ label: "− Withdrawals", text: deduct(pnl.capital.withdrawals) });
  if (Math.abs(pnl.capital.netRealised) >= 0.005) capitalLines.push({ label: "+ Realised P&L (after charges)", text: signed(pnl.capital.netRealised) });
  if (Math.abs(pnl.capital.openCharges) >= 0.005) capitalLines.push({ label: "− Charges on open positions", text: deduct(pnl.capital.openCharges) });
  if (Math.abs(pnl.capital.gap) >= 0.005) capitalLines.push({ label: "Ledger difference", text: signed(pnl.capital.gap) });
  capitalLines.push({ label: "= Trading limit", text: money(pnl.capital.tradingLimit), rule: true });
  if (Math.abs(pnl.capital.openCost) >= 0.005) capitalLines.push({ label: "Open positions at cost", text: money(pnl.capital.openCost) });
  if (Math.abs(pnl.capital.openProfit) >= 0.005) capitalLines.push({ label: "+ Unrealised P&L", text: signed(pnl.capital.openProfit) });
  capitalLines.push({ label: "= Account value", text: money(pnl.capital.accountValue), strong: true, rule: true });

  return (
    <div className="pnl">
      <div className="sum-lg">
        <SumCard
          title="Total P&L"
          formula="Total P&L is closed-trade profit after charges, plus open profit after the buy charges already paid. It equals account value minus net capital."
          value={signed(summary.netTotal)}
          sub={`Realised ${signed(summary.netRealised)} · Open ${signed(summary.openNet)}`}
          accent={summary.netTotal >= 0 ? "profit" : "loss"}
        />
        <SumCard
          title="Realised P&L"
          formula="Realised is the profit on closed trades after charges. Gross minus charges."
          value={signed(summary.netRealised)}
          sub={`${closed.length} closed trade${closed.length === 1 ? "" : "s"} · gross ${signed(summary.grossRealised)} · charges ${money(closedCharges.total)}`}
          accent={summary.netRealised >= 0 ? "profit" : "loss"}
        />
        <SumCard
          title="Unrealised P&L"
          formula="Unrealised is the price move, (live price − average) × quantity. Buy charges already paid are taken off in the line under it."
          value={signed(summary.unrealised)}
          sub={open.length ? `after ${money(summary.openCharges)} buy charges: ${signed(summary.openNet)}` : "No open positions"}
          accent="open"
        />
        <SumCard
          title="Charges paid"
          formula="Charges are brokerage, taxes, exchange fees, SEBI and DP. They are not profit."
          value={money(summary.charges)}
          sub={summary.openCharges >= 0.005 ? `${money(closedCharges.total)} closed · ${money(summary.openCharges)} on open trades` : `${money(closedCharges.total)} on ${money(closedTurnover)} traded`}
          accent="charges"
        />
      </div>
      <div className="sum-sm">
        <SumCard title="Win rate" formula="Winning closed trades divided by all closed trades." value={formatWinRate(pnl.stats.winRate, pnl.stats.wins)} sub={`${pnl.stats.wins} ${pnl.stats.wins === 1 ? "win" : "wins"} · ${pnl.stats.losses} ${pnl.stats.losses === 1 ? "loss" : "losses"}`} accent="neutral" />
        <SumCard title="Profit factor" formula="The sum of winning trades divided by the sum of losing trades." value={formatProfitFactor(pnl.stats.profitFactor, pnl.stats.wins)} sub="Gross wins ÷ gross losses" accent="neutral" />
        <SumCard title="Avg win / avg loss" formula="The average winning trade and the average losing trade, after charges." value={`${formatSample(pnl.stats.wins, money(pnl.stats.avgWin))} / ${formatSample(pnl.stats.losses, money(pnl.stats.avgLoss))}`} sub="Per closed trade" accent="neutral" />
        <SumCard title="Capital deposited" formula="Money added to the account. Withdrawals are listed in the capital statement." value={money(summary.deposited, 0)} sub={summary.returnPct >= 0 ? `Return ${summary.returnPct.toFixed(2)}%` : `Return ${summary.returnPct.toFixed(2)}%`} accent="neutral" />
      </div>

      <section className="card sheet">
        <div className="sheet-h"><h2>P&L breakdown</h2></div>
        <div className="break-board">
          <article className={`break-card ${tone(summary.netRealised) || "flat"}`}>
            <h3>Closed trades</h3>
            <p className="break-line"><span>Gross</span><b className={tone(summary.grossRealised)}>{signed(summary.grossRealised)}</b></p>
            <p className="break-line"><span>Charges</span><b className="charges">{deduct(closedCharges.total)}</b></p>
            <p className="break-line result"><span>= Realised</span><b className={tone(summary.netRealised)}>{signed(summary.netRealised)}</b></p>
          </article>
          <article className="break-card open-card">
            <h3>Open positions</h3>
            <p className="break-line"><span>Gross</span><b className={tone(summary.unrealised)}>{signed(summary.unrealised)}</b></p>
            <p className="break-line"><span>Charges</span><b className="charges">{deduct(summary.openCharges)}</b></p>
            <p className="break-line result"><span>= Open</span><b className="open">{signed(summary.openNet)}</b></p>
          </article>
        </div>
        <div className={`break-total ${tone(summary.netTotal) || "flat"}`}>
          <span>Total P&L</span>
          <b className={tone(summary.netTotal)}>{signed(summary.netTotal)}</b>
        </div>
        <button type="button" className="btn tiny" aria-expanded={chargesOpen} onClick={() => setChargesOpen((on) => !on)}>
          Charges detail {chargesOpen ? "▾" : "▸"}
        </button>
        {chargesOpen && <ChargeDetail groups={groups} total={closedCharges.total} turnover={closedTurnover} />}
      </section>

      <section className="card sheet">
        <div className="sheet-h">
          <h2>Statement</h2>
          <div className="sheet-tools">
            <div className="seg" role="group" aria-label="Period">
              {(["day", "week", "month", "all"] as const).map((item) => (
                <button key={item} type="button" aria-pressed={grain === item} onClick={() => { setGrain(item); setOpenPeriod(null); }}>
                  {item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
            <button type="button" className="btn tiny" onClick={exportPeriods}>CSV</button>
          </div>
        </div>
        <div className="hscroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Trades</th>
                <th className="num">Won</th>
                <th className="num">Gross</th>
                <th className="num">Charges</th>
                <th className="num">Net</th>
                <th className="num">Running total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const label = periodLabel(grain, row.period);
                const expanded = openPeriod === row.period;
                return (
                  <FragmentRow key={row.period} label={label} expanded={expanded} row={row} trades={expanded ? tradesFor(row.period) : []} onToggle={() => setOpenPeriod(expanded ? null : row.period)} onOpen={onOpen} />
                );
              })}
              <tr className="total">
                <td>Total</td>
                <td className="num">{totals.trades}</td>
                <td className="num">{totals.wins}</td>
                <td className={`num ${tone(totals.gross)}`}>{signed(totals.gross)}</td>
                <td className="num charges">{money(totals.charges)}</td>
                <td className={`num ${tone(totals.net)}`}>{signed(totals.net)}</td>
                <td className={`num ${tone(rows.at(-1)?.cumulative ?? 0)}`}>{signed(rows.at(-1)?.cumulative ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card sheet">
        <div className="sheet-h"><h2>Capital statement</h2></div>
        <table className="stmt">
          <tbody>
            {capitalLines.map((line) => (
              <tr key={line.label} className={line.strong ? "total big-line" : line.rule ? "total" : undefined}>
                <td>{line.label}</td>
                <td className="num">{line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card sheet">
        <div className="sheet-h"><h2>Strategy</h2></div>
        <div className="hscroll">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Trades</th>
                <th className="num">Win rate</th>
                <th className="num">Realised</th>
                <th className="num">Unrealised</th>
                <th className="num">Charges</th>
                <th className="num">PF</th>
                <th className="num">Avg R</th>
                <th className="num">Avg days</th>
              </tr>
            </thead>
            <tbody>
              {(["rs", "ema"] as const).map((key) => {
                const block = pnl.byStrategy[key];
                const openRows = pnl.trades.filter((trade) => trade.strategy === key && trade.status === "open");
                const closedRows = pnl.trades.filter((trade) => trade.strategy === key && trade.status === "closed");
                const unrealised = openRows.reduce((sum, trade) => sum + trade.net, 0);
                const quiet = block.stats.trades === 0 && openRows.length === 0;
                const onlyOpen = block.stats.trades === 0 && openRows.length > 0;
                return (
                  <tr key={key} className={quiet ? "quiet" : undefined}>
                    <td><span className={`dot ${key}`} /> {key === "rs" ? "RS" : "EMA"}</td>
                    {quiet ? <td colSpan={8}>No trades yet</td> : onlyOpen ? (
                      <>
                        <td className="num">{openRows.length} open</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td className="num open">{signed(unrealised)}</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                      </>
                    ) : (
                      <>
                        <td className="num">{block.stats.trades}</td>
                        <td className="num">{formatWinRate(block.stats.winRate, block.stats.wins)}</td>
                        <td className={`num ${tone(block.net)}`}>{signed(block.net)}</td>
                        <td className="num open">{signed(unrealised)}</td>
                        <td className="num charges">{money(block.charges)}</td>
                        <td className="num">{formatProfitFactor(block.stats.profitFactor, block.stats.wins)}</td>
                        <td className="num">{block.stats.expectancyR == null ? "—" : block.stats.expectancyR.toFixed(2)}</td>
                        <td className="num">{formatAvgDays(block.stats.avgDays, closedRows)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ChargeDetail({ groups, total, turnover }: { groups: ChargeGroup[]; total: number; turnover: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!groups.length) return <p className="note">No charges in this view.</p>;
  return (
    <table className="stmt">
      <thead>
        <tr><th>Charge</th><th className="num">₹</th><th className="num">% of charges</th><th className="num">% of turnover</th></tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const expanded = open === group.id;
          return (
            <Fragment key={group.id}>
              <tr>
                <td><button type="button" className="sort" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>{group.label} {expanded ? "▾" : "▸"}</button></td>
                <td className="num charges">{money(group.total)}</td>
                <td className="num">{total ? `${((group.total / total) * 100).toFixed(1)}%` : "—"}</td>
                <td className="num">{turnover ? `${((group.total / turnover) * 100).toFixed(2)}%` : "—"}</td>
              </tr>
              {expanded && group.parts.map((part) => (
                <tr key={part.label} className="subrow">
                  <td>{part.label}</td>
                  <td className="num">{money(part.value)}</td>
                  <td className="num">{total ? `${((part.value / total) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="num">{turnover ? `${((part.value / turnover) * 100).toFixed(2)}%` : "—"}</td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRow({
  label,
  expanded,
  row,
  trades,
  onToggle,
  onOpen,
}: {
  label: string;
  expanded: boolean;
  row: { period: string; trades: number; wins: number; gross: number; charges: number; net: number; cumulative: number };
  trades: PnlTrade[];
  onToggle: () => void;
  onOpen?: (trade: PnlTrade) => void;
}) {
  return (
    <>
      <tr>
        <td><button type="button" className="sort" aria-expanded={expanded} onClick={onToggle}>{label}</button></td>
        <td className="num">{row.trades}</td>
        <td className="num">{row.wins}</td>
        <td className={`num ${tone(row.gross)}`}>{signed(row.gross)}</td>
        <td className="num charges">{money(row.charges)}</td>
        <td className={`num ${tone(row.net)}`}>{signed(row.net)}</td>
        <td className={`num ${tone(row.cumulative)}`}>{signed(row.cumulative)}</td>
      </tr>
      {expanded && trades.map((trade) => (
        <tr key={trade.id} className="subrow" onClick={() => onOpen?.(trade)}>
          <td>{trade.symbol}</td>
          <td className="num">1</td>
          <td className="num">{trade.net > 0 ? 1 : 0}</td>
          <td className={`num ${tone(trade.gross)}`}>{signed(trade.gross)}</td>
          <td className="num charges">{money(trade.charges.total)}</td>
          <td className={`num ${tone(trade.net)}`}>{signed(trade.net)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}

type SortKey = "symbol" | "entry" | "invested" | "gross" | "charges" | "net" | "r";

function liveMark(trade: PnlTrade): number {
  return trade.qty ? trade.entryAvg + trade.gross / trade.qty : trade.entryAvg;
}

function investedOf(trade: PnlTrade): number {
  return trade.entryAvg * trade.qty;
}

function Cols() {
  const widths = ["16%", "16%", "9%", "11%", "13%", "9%", "9%", "11%", "6%"];
  return (
    <colgroup>
      {widths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
    </colgroup>
  );
}

export function TradesTable({ pnl, onOpen }: { pnl: PnlModel; onOpen: (trade: PnlTrade) => void }) {
  const [strategy, setStrategy] = useState<"all" | "rs" | "ema">("all");
  const [result, setResult] = useState<"all" | "won" | "lost">("all");
  const [reason, setReason] = useState<"all" | ExitReason>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("entry");
  const [dir, setDir] = useState<1 | -1>(1);

  function toggle(key: SortKey) {
    if (sort === key) setDir((current) => (current === 1 ? -1 : 1));
    else { setSort(key); setDir(key === "symbol" || key === "entry" ? 1 : -1); }
  }

  function accept(trade: PnlTrade): boolean {
    if (strategy !== "all" && trade.strategy !== strategy) return false;
    if (result === "won" && !(trade.net > 0)) return false;
    if (result === "lost" && !(trade.net < 0)) return false;
    if (reason !== "all" && trade.exitReason !== reason) return false;
    if (query && !trade.symbol.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  }

  function ordered(rows: PnlTrade[]): PnlTrade[] {
    const value = (trade: PnlTrade) => {
      if (sort === "symbol") return trade.symbol;
      if (sort === "entry") return trade.entryDate;
      if (sort === "gross") return trade.gross;
      if (sort === "invested") return investedOf(trade);
      if (sort === "charges") return trade.charges.total;
      if (sort === "r") return trade.r ?? -999;
      return trade.net;
    };
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (left < right) return -dir;
      if (left > right) return dir;
      return a.id - b.id;
    });
  }

  const openRows = ordered(pnl.trades.filter((trade) => trade.status === "open" && accept(trade)));
  const closedRows = ordered(pnl.trades.filter((trade) => trade.status === "closed" && accept(trade)));

  function exportTrades() {
    const rows = [...openRows, ...closedRows];
    downloadCsv("trades.csv", toCsv(
      ["Stock", "Strategy", "Status", "Entry", "Exit", "Qty", "Days", "Invested", "Gross", "Charges", "Net", "Net %", "R", "Exit"],
      rows.map((trade) => [
        trade.symbol,
        trade.strategy,
        trade.status,
        trade.entryDate,
        trade.exitDate ?? "",
        trade.qty,
        trade.daysHeld,
        investedOf(trade),
        trade.gross,
        trade.charges.total,
        trade.net,
        trade.netPct,
        trade.r,
        trade.exitReason ? EXIT_PILL[trade.exitReason] : "Open",
      ])
    ));
  }

  return (
    <div className="pnl">
      <div className="trade-filters">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol" aria-label="Search symbol" />
        <div className="seg" role="group" aria-label="Strategy">
          {(["all", "rs", "ema"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={strategy === item} onClick={() => setStrategy(item)}>{item === "all" ? "All" : item.toUpperCase()}</button>
          ))}
        </div>
        <span className="vdiv" aria-hidden="true" />
        <div className="seg" role="group" aria-label="Result">
          {(["all", "won", "lost"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={result === item} onClick={() => setResult(item)}>{item === "all" ? "All" : item === "won" ? "Won" : "Lost"}</button>
          ))}
        </div>
        <label className="exit-pick">
          Exit
          <select aria-label="Exit reason" value={reason} onChange={(event) => setReason(event.target.value === "all" ? "all" : event.target.value as ExitReason)}>
            <option value="all">All exits</option>
            {EXIT_REASONS.map((item) => (
              <option key={item} value={item}>{EXIT_PILL[item]}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn tiny csv" onClick={exportTrades}>CSV</button>
      </div>
      <TradeSection title="Open positions" empty="No open positions" hint="A position appears here after a buy fills." rows={openRows} sort={sort} dir={dir} onSort={toggle} onOpen={onOpen} />
      <TradeSection title="Closed trades" empty="No closed trades yet" hint="A trade moves here once it is sold." rows={closedRows} sort={sort} dir={dir} onSort={toggle} onOpen={onOpen} />
    </div>
  );
}

function TradeSection({
  title,
  empty,
  hint,
  rows,
  sort,
  dir,
  onSort,
  onOpen,
}: {
  title: string;
  empty: string;
  hint: string;
  rows: PnlTrade[];
  sort: SortKey;
  dir: 1 | -1;
  onSort: (key: SortKey) => void;
  onOpen: (trade: PnlTrade) => void;
}) {
  const invested = rows.reduce((sum, trade) => sum + investedOf(trade), 0);
  const gross = rows.reduce((sum, trade) => sum + trade.gross, 0);
  const charges = rows.reduce((sum, trade) => sum + trade.charges.total, 0);
  const net = rows.reduce((sum, trade) => sum + trade.net, 0);
  const wins = rows.filter((trade) => trade.net > 0).length;
  const head = (key: SortKey, label: string) => (
    <button type="button" className={`sort${sort === key ? " on" : ""}`} onClick={() => onSort(key)}>
      {label}
      {sort === key ? (dir === 1 ? " ▲" : " ▼") : <span className="hover-arrow"> ↕</span>}
    </button>
  );
  return (
    <section className="card sheet">
      <div className="sheet-h">
        <h2 className="section-title">{title} <span className="chip">{rows.length}</span></h2>
      </div>
      {rows.length === 0 ? (
        <p className="note">{empty}. {hint}</p>
      ) : (
        <div className="hscroll">
          <table className="trades as-cards">
            <Cols />
            <thead>
              <tr>
                <th>{head("symbol", "Stock")}</th>
                <th>{head("entry", "Entry → exit")}</th>
                <th className="num">Qty · days</th>
                <th className="num">{head("invested", "Invested")}</th>
                <th className="fit">Stop</th>
                <th className="num">{head("gross", "Gross")}</th>
                <th className="num">{head("charges", "Charges")}</th>
                <th className="num">{head("net", "Net")}</th>
                <th className="num">{head("r", "R")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((trade) => <TradeRow key={trade.id} trade={trade} onOpen={onOpen} />)}
              <tr className="total">
                <td>Total</td>
                <td />
                <td />
                <td className="num">{money(invested)}</td>
                <td>{rows.length ? `${((wins / rows.length) * 100).toFixed(0)}% won` : ""}</td>
                <td className={`num ${tone(gross)}`}>{signed(gross)}</td>
                <td className="num charges">{money(charges)}</td>
                <td className={`num ${tone(net)}`}>{signed(net)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TradeRow({ trade, onOpen }: { trade: PnlTrade; onOpen: (trade: PnlTrade) => void }) {
  const live = liveMark(trade);
  const exitValue = trade.status === "closed" && trade.exitAvg != null ? trade.exitAvg * trade.qty : null;
  const stopMoved = trade.currentStop != null && trade.initialStop != null && Math.abs(trade.currentStop - trade.initialStop) >= 0.005;
  const accent = trade.status === "open" ? "tone-open" : trade.net >= 0 ? "tone-profit" : "tone-loss";
  return (
    <tr id={`trade-${trade.id}`} className={accent} onClick={() => onOpen(trade)}>
      <td data-label="Stock">
        <span className="symline">
          <b>{trade.symbol}</b>
          {trade.boughtBelowStop && <span className="chip warn-chip" title="Bought below stop">Below stop</span>}
        </span>
        <span className="subline">
          <span className={`chip ${trade.strategy}`}>{trade.strategy === "rs" ? "RS" : "EMA"}</span>
          <span className="chip">{trade.status === "open" ? "Open" : trade.exitReason ? EXIT_PILL[trade.exitReason] : "Closed"}</span>
        </span>
      </td>
      <td data-label="Entry → exit">
        <span className="line">{shortDate(trade.entryDate)} · {money(trade.entryAvg)}</span>
        <span className="line muted">→ {trade.status === "open" ? <>{money(live)} live</> : <>{trade.exitDate ? shortDate(trade.exitDate) : ""} · {trade.exitAvg == null ? "" : money(trade.exitAvg)}</>}</span>
      </td>
      <td className="num" data-label="Qty · days">
        <span className="line">{trade.qty} sh · {trade.daysHeld} d</span>
        {trade.intraday && <span className="chip">Intraday</span>}
      </td>
      <td className="num" data-label="Invested">
        <span className="line">{money(investedOf(trade))}</span>
        {exitValue != null && <span className="line muted">out {money(exitValue)}</span>}
      </td>
      <td className="fit" data-label="Stop">
        <span className="line">{trade.initialStop == null ? "—" : money(trade.initialStop)}</span>
        {stopMoved && <span className="line muted">now {money(trade.currentStop ?? 0)}</span>}
        {trade.status === "open" && (
          <span className="gtt-line">
            <i className={trade.gttLive ? "dot gtt on" : "dot gtt off"} title={trade.gttLive ? "GTT active" : "GTT missing"} />
            <span>{trade.gttTrigger == null ? (trade.gttLive ? "GTT active" : "GTT missing") : `GTT ${money(trade.gttTrigger)}`}</span>
          </span>
        )}
      </td>
      <td className={`num ${tone(trade.gross)}`} data-label="Gross">{signed(trade.gross)}</td>
      <td className="num" data-label="Charges"><ChargeHover charges={trade.charges} /></td>
      <td className="num" data-label="Net">
        <b className={`net-num line ${tone(trade.net)}`}>{signed(trade.net)}</b>
        <span className="line muted">{trade.netPct >= 0 ? "+" : "−"}{Math.abs(trade.netPct).toFixed(2)}%</span>
      </td>
      <td className="num" data-label="R">
        {trade.r == null ? <span className="info-wrap"><span>—</span><span className="popover hover-pop">Bought below its stop</span></span> : `${trade.r >= 0 ? "+" : ""}${trade.r.toFixed(1)}R`}
      </td>
    </tr>
  );
}

function ChargeHover({ charges }: { charges: BookedCharges }) {
  const groups = chargeGroups(charges);
  return (
    <span className="info-wrap">
      <span className="charges">{money(charges.total)}</span>
      {groups.length > 0 && (
        <span className="popover hover-pop">
          {groups.map((group) => <span key={group.id}>{group.label} {money(group.total)}</span>)}
        </span>
      )}
    </span>
  );
}
