"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ExitReason, PnlModel, PnlTrade } from "@/lib/mlive/pnl";
import { axisInr, chargeGroups, formatAvgDays, formatInr, formatProfitFactor, formatSample, formatWinRate, needsClosed, periodLabel, REASON_LABEL, shortDate } from "./pnl-ui";

const EXIT_PILL: Record<ExitReason, string> = {
  trend_stop: "Trend stop",
  gtt_exit: "Stop hit",
  gtt_fallback: "Safety sell",
  manual: "Manual",
  breaker: "Breaker",
};

function money(value: number, digits = 2): string {
  return formatInr(value, { digits });
}

function signed(value: number): string {
  return formatInr(value, { sign: true });
}

function paddedDomain(values: number[], pad: number): [number, number] {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  return [lo - span * pad, hi + span * pad];
}

function roundTicks(min: number, max: number): number[] {
  const rough = Math.max(max - min, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  const step = nice * pow;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) ticks.push(Math.round((value + Number.EPSILON) * 100) / 100);
  if (!ticks.some((tick) => Math.abs(tick) < 1e-6)) ticks.push(0);
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function axisPct(value: number): string {
  const abs = Math.abs(value);
  const digits = abs === 0 ? 0 : abs < 1 ? 2 : abs < 10 ? 1 : 0;
  const body = abs.toFixed(digits);
  return `${value < 0 ? "−" : ""}${body}%`;
}

function axisR(value: number): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs) ? 0 : 1;
  return `${value < 0 ? "−" : ""}${abs.toFixed(digits)}R`;
}

function barCaption(mode: "net" | "pct" | "r", value: number): string {
  if (mode === "pct") return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
  if (mode === "r") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
  return signed(value);
}

function useMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    setOn(true);
    const timer = window.setTimeout(() => setOn(false), 420);
    return () => window.clearTimeout(timer);
  }, []);
  return on;
}

function useCursor(length: number) {
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setIndex((current) => {
      const next = event.key === "ArrowLeft" ? current - 1 : current + 1;
      return Math.max(0, Math.min(Math.max(length - 1, 0), next));
    });
  }
  return { index: length ? Math.min(index, length - 1) : 0, focused, onKey, onFocus: () => setFocused(true), onBlur: () => setFocused(false) };
}

function WhenVisible({ children, hold }: { children: ReactNode; hold: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShow(true);
    }, { rootMargin: "180px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={show ? undefined : { minHeight: hold }}>{show ? children : null}</div>;
}

function Shell({
  title,
  aria,
  headers,
  rows,
  children,
  empty,
  height = 260,
  eager = false,
  plain = false,
  extra,
}: {
  title: string;
  aria: string;
  headers: string[];
  rows: (string | number)[][];
  children: ReactNode;
  empty?: string | null;
  height?: number;
  eager?: boolean;
  plain?: boolean;
  extra?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const cursor = useCursor(rows.length);
  const point = rows[cursor.index];
  const plot = (
    <div className="plot" role="img" aria-label={aria} tabIndex={0} onKeyDown={cursor.onKey} onFocus={cursor.onFocus} onBlur={cursor.onBlur}>
      {cursor.focused && point && <div className="tip-card">{point.join(" · ")}</div>}
      <div className="plot-box" style={{ height }}>{children}</div>
    </div>
  );
  const Frame = plain ? "div" : "section";
  return (
    <Frame className={plain ? "chart-plain" : "card sheet chart-card"}>
      <div className="sheet-h">
        {plain ? <span /> : <h2>{title}</h2>}
        <div className="sheet-tools">
          {extra}
          {!empty && <button type="button" className="btn tiny" aria-pressed={table} onClick={() => setTable((on) => !on)}>{table ? "Chart" : "Table"}</button>}
        </div>
      </div>
      {empty ? <p className="note">{empty}</p> : table ? (
        <div className="hscroll">
          <table>
            <thead><tr>{headers.map((header) => <th key={header} className={header === headers[0] ? undefined : "num"}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex ? "num" : undefined}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : eager ? plot : <WhenVisible hold={height}>{plot}</WhenVisible>}
    </Frame>
  );
}

export function ChartsBoard({ pnl, onOpen }: { pnl: PnlModel; onOpen?: (trade: PnlTrade) => void }) {
  const motion = useMotion();
  const anim = { isAnimationActive: motion, animationDuration: 400 };
  const [mode, setMode] = useState<"net" | "pct" | "r">("net");
  const closed = pnl.stats.trades;
  const openTrades = useMemo(() => pnl.trades.filter((trade) => trade.status === "open"), [pnl.trades]);
  const closedTrades = useMemo(() => pnl.trades.filter((trade) => trade.status === "closed"), [pnl.trades]);
  const account = pnl.series.account;
  const start = pnl.capital.starting;
  const yDomain = useMemo(() => {
    const values = account.map((point) => point.value);
    if (start) values.push(start);
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(400, (max - min) * 0.35);
    return [min - pad, max + pad];
  }, [account, start]);
  const weeks = pnl.byPeriod.week;
  const byMonth = weeks.length >= 8;
  const periods = useMemo(() => (byMonth ? pnl.byPeriod.month : weeks).map((row) => ({
    ...row,
    label: periodLabel(byMonth ? "month" : "week", row.period),
  })), [byMonth, pnl.byPeriod.month, weeks]);
  const tradeBars = useMemo(() => closedTrades.map((trade) => ({
    ...trade,
    label: `${trade.symbol} ${shortDate(trade.exitDate ?? trade.entryDate)}`,
    bar: mode === "pct" ? trade.netPct : mode === "r" ? (trade.r ?? 0) : trade.net,
    value: trade.entryAvg * trade.qty,
  })), [closedTrades, mode]);
  const groups = useMemo(() => chargeGroups(pnl.summary.chargesByType), [pnl.summary.chargesByType]);
  const itemised = useMemo(() => groups.filter((group) => group.id !== "unclassified"), [groups]);
  const tradeDomain = useMemo(() => paddedDomain(tradeBars.map((row) => row.bar), 0.85), [tradeBars]);
  const tradeTicks = useMemo(() => roundTicks(tradeDomain[0], tradeDomain[1]), [tradeDomain]);
  const periodDomain = useMemo(() => paddedDomain(periods.map((row) => row.net), 0.2), [periods]);
  const periodTicks = useMemo(() => roundTicks(periodDomain[0], periodDomain[1]), [periodDomain]);
  const reasons = pnl.byReason.filter((row) => row.count > 0);
  const live = account.find((point) => point.live);

  return (
    <div className="pnl">
      <section className="card sheet">
        <div className="hero-chart">
          <div>
            <p className="lbl">Account</p>
            <p className="acct">{money(pnl.summary.accountValue, 0)}</p>
            <p className={`chg ${pnl.summary.netTotal >= 0 ? "profit" : "loss"}`}>
              {pnl.summary.netTotal >= 0 ? "▲" : "▼"} {signed(pnl.summary.netTotal)} · {pnl.summary.returnPct >= 0 ? "+" : "−"}{Math.abs(pnl.summary.returnPct).toFixed(1)}%
            </p>
            <div className="mini-tiles">
              <div><span className="lbl">Realised</span><b className={pnl.summary.netRealised >= 0 ? "profit" : "loss"}>{signed(pnl.summary.netRealised)}</b></div>
              <div><span className="lbl">Unrealised</span><b className="open">{signed(pnl.summary.unrealised)}</b></div>
              <div><span className="lbl">Charges</span><b className="charges">{money(pnl.summary.charges)}</b></div>
              <div><span className="lbl">Deposited</span><b>{money(pnl.summary.deposited, 0)}</b></div>
            </div>
          </div>
          <Shell
            eager
            plain
            title="Account value"
            aria={`Account value, latest ${money(account.at(-1)?.value ?? pnl.summary.accountValue)}`}
            headers={["Date", "Value"]}
            rows={account.map((point) => [point.live ? `${shortDate(point.date)} live` : shortDate(point.date), money(point.value)])}
            height={280}
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={account.map((point) => ({ ...point, label: shortDate(point.date) }))}>
                <defs>
                  <linearGradient id="acct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--ink3)" fontSize={11} />
                <YAxis domain={yDomain} tickFormatter={(value: number) => (yDomain[1] - yDomain[0] < 20000 ? formatInr(value, { digits: 0 }) : axisInr(value))} stroke="var(--ink3)" fontSize={11} width={72} />
                <Tooltip content={<ValueTip start={start || account[0]?.value || 0} />} />
                {start > 0 && (
                  <ReferenceLine y={start} stroke="var(--ink3)" strokeDasharray="4 4" label={{ value: `${money(start, start % 1 === 0 ? 0 : 2)} start`, position: "insideTopRight", fill: "var(--ink3)", fontSize: 11 }} />
                )}
                {live && <ReferenceDot x={shortDate(live.date)} y={live.value} r={5} fill="var(--profit)" />}
                <Area type="monotone" dataKey="value" stroke="var(--profit)" fill="url(#acct)" strokeWidth={2} dot={account.length < 3} {...anim} />
              </AreaChart>
            </ResponsiveContainer>
          </Shell>
        </div>
        {account.length < 3 && <p className="note">Builds up after a few trading days.</p>}
      </section>

      <div className="stat-strip">
        <Stat title="Win rate" value={formatWinRate(pnl.stats.winRate, pnl.stats.wins)} detail={`${pnl.stats.wins}W–${pnl.stats.losses}L`} accent="profit" />
        <Stat title="Profit factor" value={formatProfitFactor(pnl.stats.profitFactor, pnl.stats.wins)} accent="profit" />
        <Stat title="Expectancy" value={signed(pnl.stats.expectancy)} detail={pnl.stats.expectancyR == null ? "R n/a" : `${pnl.stats.expectancyR.toFixed(2)} R`} accent={pnl.stats.expectancy >= 0 ? "profit" : "loss"} />
        <Stat title="Avg win / avg loss" value={`${formatSample(pnl.stats.wins, money(pnl.stats.avgWin))} / ${formatSample(pnl.stats.losses, money(pnl.stats.avgLoss))}`} accent="neutral" />
        <Stat title="Avg days held" value={formatAvgDays(pnl.stats.avgDays, closedTrades)} accent="neutral" />
        <Stat title="Drawdown" value={`${pnl.summary.drawdownPct.toFixed(1)}%`} detail={`of ${pnl.summary.breakerPct}% breaker`} accent="loss" meter={pnl.summary.breakerPct > 0 ? Math.min(100, (pnl.summary.drawdownPct / pnl.summary.breakerPct) * 100) : 0} />
      </div>

      <Shell
        title="Trade results"
        aria="Net result of each closed trade"
        headers={["Stock", "Date", "Net"]}
        rows={closedTrades.map((trade) => [trade.symbol, shortDate(trade.exitDate ?? trade.entryDate), signed(trade.net)])}
        empty={closed < 1 ? "No closed trades yet." : null}
        height={Math.max(160, closedTrades.length * 44 + 36)}
        extra={(
          <div className="seg" role="group" aria-label="Trade bar unit">
            {(["net", "pct", "r"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "net" ? "Net ₹" : item === "pct" ? "Net %" : "R"}</button>
            ))}
          </div>
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={tradeBars} barSize={28} maxBarSize={28} margin={{ right: 28, left: 8 }}>
            <CartesianGrid stroke="var(--line)" horizontal={false} />
            <XAxis
              type="number"
              stroke="var(--ink3)"
              fontSize={11}
              domain={[tradeTicks[0] ?? tradeDomain[0], tradeTicks.at(-1) ?? tradeDomain[1]]}
              ticks={tradeTicks}
              tickFormatter={(value: number) => (mode === "pct" ? axisPct(value) : mode === "r" ? axisR(value) : axisInr(value))}
            />
            <YAxis type="category" dataKey="label" width={128} stroke="var(--ink3)" fontSize={11} />
            <Tooltip content={<TradeTip />} />
            <Bar dataKey="bar" radius={[0, 6, 6, 0]} {...anim} onClick={(row) => openTrade(row, pnl, onOpen)}>
              {tradeBars.map((row) => <Cell key={row.id} fill={row.net >= 0 ? "var(--profit)" : "var(--loss)"} />)}
              <LabelList
                dataKey="bar"
                content={(props) => {
                  const x = Number(props.x ?? 0);
                  const y = Number(props.y ?? 0);
                  const width = Number(props.width ?? 0);
                  const height = Number(props.height ?? 0);
                  const value = Number(props.value ?? 0);
                  const positive = value >= 0;
                  const left = Math.min(x, x + width);
                  const right = Math.max(x, x + width);
                  const text = barCaption(mode, value);
                  const sign = text.startsWith("+") || text.startsWith("−") || text.startsWith("-") ? text[0] : "";
                  const rest = sign ? text.slice(1) : text;
                  return (
                    <text className="bar-value" x={positive ? right + 8 : left - 8} y={y + height / 2} textAnchor={positive ? "start" : "end"} dominantBaseline="middle">
                      {sign ? <tspan className={positive ? "sign profit" : "sign loss"}>{sign}</tspan> : null}
                      <tspan>{rest}</tspan>
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Shell>

      <Shell
        title="P&L over time"
        aria={`Cumulative net ${signed(pnl.summary.netRealised)}`}
        headers={["Date", "Gross", "Charges", "Net"]}
        rows={pnl.series.cumulative.map((point) => [shortDate(point.date), signed(point.gross), money(point.charges), signed(point.net)])}
        empty={closed < 2 ? needsClosed(closed, 2) : null}
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={pnl.series.cumulative.map((point) => ({ ...point, label: shortDate(point.date) }))}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--ink3)" fontSize={11} />
            <YAxis tickFormatter={axisInr} stroke="var(--ink3)" fontSize={11} width={64} />
            <Tooltip />
            <Area type="monotone" dataKey="charges" stroke="var(--charges)" fill="var(--charges-bg)" name="Charges" {...anim} />
            <Line type="monotone" dataKey="gross" stroke="var(--ink3)" strokeDasharray="4 4" dot={false} name="Gross" {...anim} />
            <Line type="monotone" dataKey="net" stroke="var(--profit)" dot={false} name="Net" {...anim} />
          </ComposedChart>
        </ResponsiveContainer>
      </Shell>

      <Shell
        title="By period"
        aria="Net profit by week"
        headers={["Period", "Trades", "Gross", "Charges", "Net"]}
        rows={periods.map((row) => [row.label, row.trades, signed(row.gross), money(row.charges), signed(row.net)])}
        empty={closed < 1 ? needsClosed(closed, 1) : null}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={periods} barSize={40} maxBarSize={40}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--ink3)" fontSize={11} />
            <YAxis
              stroke="var(--ink3)"
              fontSize={11}
              width={72}
              domain={periodDomain}
              ticks={periodTicks}
              allowDataOverflow
              tickFormatter={(value: number) => (Math.abs(periodDomain[1] - periodDomain[0]) < 1000 ? formatInr(value, { sign: true, digits: 0 }) : axisInr(value))}
            />
            <Tooltip content={<MonthTip />} />
            <Bar dataKey="net" radius={[6, 6, 0, 0]} {...anim}>
              {periods.map((row) => <Cell key={row.period} fill={row.net >= 0 ? "var(--profit)" : "var(--loss)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Shell>

      <section className="card sheet">
        <div className="sheet-h"><h2>Strategy face-off</h2></div>
        <div className="face">
          {(["rs", "ema"] as const).map((key) => {
            const block = pnl.byStrategy[key];
            const openRows = pnl.trades.filter((trade) => trade.strategy === key && trade.status === "open");
            const closedRows = pnl.trades.filter((trade) => trade.strategy === key && trade.status === "closed");
            const unrealised = openRows.reduce((sum, trade) => sum + trade.net, 0);
            return (
              <div key={key} className={`face-col accent accent-${key}${block.stats.trades === 0 && openRows.length === 0 ? " empty" : ""}`}>
                <b className={key}>{key === "rs" ? "RS" : "EMA"}</b>
                {block.stats.trades === 0 && openRows.length === 0 ? <p className="empty-mid">No trades yet</p> : (
                  <dl className="face-grid">
                    {block.stats.trades === 0 ? (
                      <>
                        <dt>Open net</dt><dd className="open">{signed(unrealised)}</dd>
                        <dt>Open</dt><dd>{openRows.length}</dd>
                      </>
                    ) : (
                      <>
                        <dt>Net</dt><dd className={block.net >= 0 ? "profit" : "loss"}>{signed(block.net)}</dd>
                        <dt>Trades</dt><dd>{block.stats.trades}</dd>
                        <dt>Win rate</dt><dd>{formatWinRate(block.stats.winRate, block.stats.wins)}</dd>
                        <dt>Profit factor</dt><dd>{formatProfitFactor(block.stats.profitFactor, block.stats.wins)}</dd>
                        <dt>Expectancy</dt><dd>{signed(block.stats.expectancy)}</dd>
                        <dt>Avg days</dt><dd>{formatAvgDays(block.stats.avgDays, closedRows)}</dd>
                        <dt>Charges</dt><dd className="charges">{money(block.charges)}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card sheet">
        <div className="sheet-h"><h2>Open positions now</h2></div>
        {openTrades.length === 0 ? <p className="note">No open positions.</p> : (
          <div className="opens">
            {openTrades.map((trade) => {
              const livePrice = trade.qty ? trade.entryAvg + trade.gross / trade.qty : trade.entryAvg;
              const stop = trade.currentStop ?? trade.initialStop ?? trade.entryAvg;
              const lo = Math.min(stop, trade.entryAvg, livePrice);
              const hi = Math.max(stop, trade.entryAvg, livePrice);
              const span = hi - lo || 1;
              const at = (value: number) => `${((value - lo) / span) * 100}%`;
              return (
                <button key={trade.id} type="button" className="open-card" onClick={() => onOpen?.(trade)}>
                  <span className="symline">
                    <b>{trade.symbol}</b>
                    <i className={trade.gttLive ? "dot gtt on" : "dot gtt off"} title={trade.gttLive ? "GTT active" : "GTT missing"} />
                  </span>
                  <b className={trade.net >= 0 ? "profit" : "loss"}>{signed(trade.net)} after charges</b>
                  {trade.gttTrigger != null && <span className="muted">GTT {money(trade.gttTrigger)}</span>}
                  <span className="range-scale">
                    <span className="range-bar">
                      <i style={{ left: at(stop) }} />
                      <i className="entry" style={{ left: at(trade.entryAvg) }} />
                      <i className="now" style={{ left: at(livePrice) }} />
                    </span>
                    <span className="range-ends">
                      <span>stop {money(stop)}</span>
                      <span className="mid" style={{ left: at(trade.entryAvg) }}>entry {money(trade.entryAvg)}</span>
                      <span>now {money(livePrice)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="card sheet">
        <div className="sheet-h"><h2>Why we sold</h2></div>
        {closed < 3 ? (
          <div className="pills">
            {reasons.length === 0 ? <p className="note">{needsClosed(closed, 3)}</p> : reasons.map((row) => (
              <span key={row.reason} className="chip">{EXIT_PILL[row.reason]} · {row.count} · {signed(row.net)}</span>
            ))}
          </div>
        ) : (
          <div className="donut-row">
            <div className="plot-box donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={reasons} dataKey="count" nameKey="reason" innerRadius={58} outerRadius={84} {...anim}>
                    {reasons.map((row) => <Cell key={row.reason} fill={row.net >= 0 ? "var(--profit)" : "var(--loss)"} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <b className="donut-mid">{closed}</b>
            </div>
            <table>
              <thead><tr><th>Reason</th><th className="num">Count</th><th className="num">Net</th></tr></thead>
              <tbody>
                {pnl.byReason.filter((row) => row.count > 0).map((row) => (
                  <tr key={row.reason}><td>{EXIT_PILL[row.reason]}</td><td className="num">{row.count}</td><td className={`num ${row.net >= 0 ? "profit" : "loss"}`}>{signed(row.net)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card sheet">
        <div className="sheet-h"><h2>Charges</h2></div>
        {itemised.length === 0 ? (
          <div className="charges-plain">
            <p className="sum-num charges">{money(pnl.summary.charges)}</p>
            <p className="muted">Charges will split by type after the next fill.</p>
          </div>
        ) : (
          <div className="donut-row">
            <div className="plot-box donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={itemised} dataKey="total" nameKey="label" innerRadius={58} outerRadius={84} fill="var(--charges)" {...anim} />
                </PieChart>
              </ResponsiveContainer>
              <b className="donut-mid">{money(pnl.summary.charges, 0)}</b>
            </div>
            <ul className="legend charge-legend">
              {itemised.map((group) => {
                const pct = pnl.summary.charges > 0 ? (group.total / pnl.summary.charges) * 100 : 0;
                return (
                  <li key={group.id}>
                    <i />
                    <span>{group.label}</span>
                    <b className="charges">{money(group.total)}</b>
                    <span className="muted">{pct.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="more">
        <h2>More analysis</h2>
        <div className="pnl-grid">
          <div className="s6">
            <Shell title="R distribution" aria="Distribution of R multiples" headers={["From", "To", "Trades"]} rows={(pnl.distribution?.bins ?? []).filter((bin) => bin.count > 0).map((bin) => [bin.from, bin.to, bin.count])} empty={pnl.distribution ? null : needsClosed(closed, 5)} height={220}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pnl.distribution?.bins ?? []}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="from" stroke="var(--ink3)" fontSize={11} />
                  <YAxis stroke="var(--ink3)" fontSize={11} allowDecimals={false} />
                  {pnl.distribution?.mean != null && <ReferenceLine x={pnl.distribution.mean} stroke="var(--ink)" />}
                  {pnl.distribution?.median != null && <ReferenceLine x={pnl.distribution.median} stroke="var(--charges)" />}
                  <Bar dataKey="count" fill="var(--rs)" radius={[4, 4, 0, 0]} {...anim} />
                </BarChart>
              </ResponsiveContainer>
            </Shell>
          </div>
          <div className="s6">
            <Shell title="Days held vs return" aria="Days held against net return" headers={["Stock", "Days", "Net %"]} rows={closedTrades.map((trade) => [trade.symbol, trade.daysHeld, `${trade.netPct.toFixed(2)}%`])} empty={closed < 1 ? needsClosed(closed, 1) : null} height={220}>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid stroke="var(--line)" />
                  <XAxis dataKey="daysHeld" stroke="var(--ink3)" fontSize={11} />
                  <YAxis dataKey="netPct" stroke="var(--ink3)" fontSize={11} tickFormatter={axisPct} width={64} />
                  <ZAxis dataKey="value" range={[40, 160]} />
                  <Tooltip />
                  <Scatter data={tradeBars.filter((row) => row.strategy === "rs")} fill="var(--rs)" />
                  <Scatter data={tradeBars.filter((row) => row.strategy === "ema")} fill="var(--ema)" />
                </ScatterChart>
              </ResponsiveContainer>
            </Shell>
          </div>
          <div className="s6">
            <Shell title="Best price vs final result" aria="Best open profit against the final net percent" headers={["Stock", "Best %", "Net %"]} rows={closedTrades.filter((trade) => trade.mfe != null).map((trade) => [trade.symbol, trade.mfe?.toFixed(1) ?? "", `${trade.netPct.toFixed(1)}%`])} empty={closed < 5 ? needsClosed(closed, 5) : closedTrades.some((trade) => trade.mfe != null) ? null : "No high and low prices for these trades."} height={220}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={closedTrades.filter((trade) => trade.mfe != null)}>
                  <CartesianGrid stroke="var(--line)" />
                  <XAxis dataKey="mfe" stroke="var(--ink3)" fontSize={11} />
                  <YAxis dataKey="netPct" stroke="var(--ink3)" fontSize={11} />
                  <Tooltip />
                  <Scatter dataKey="netPct" fill="var(--rs)" />
                </ComposedChart>
              </ResponsiveContainer>
            </Shell>
          </div>
          <div className="s6">
            <Shell title="Money at work" aria="Invested percent of capital and open positions" headers={["Date", "Invested %", "Open"]} rows={pnl.series.invested.map((point) => [shortDate(point.date), `${point.investedPct.toFixed(1)}%`, point.openPositions])} empty={pnl.series.invested.length < 1 ? "Shows once a trade is open." : null} height={220}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={pnl.series.invested.map((point) => ({ ...point, label: shortDate(point.date) }))}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--ink3)" fontSize={11} />
                  <YAxis yAxisId="pct" stroke="var(--ink3)" fontSize={11} />
                  <YAxis yAxisId="n" orientation="right" stroke="var(--ink3)" fontSize={11} allowDecimals={false} />
                  <ReferenceLine yAxisId="pct" y={100} stroke="var(--ink3)" strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="n" y={pnl.maxPositions} stroke="var(--charges)" strokeDasharray="4 4" />
                  <Area yAxisId="pct" type="monotone" dataKey="investedPct" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.12} {...anim} />
                  <Line yAxisId="n" type="stepAfter" dataKey="openPositions" stroke="var(--ink)" dot={false} {...anim} />
                </ComposedChart>
              </ResponsiveContainer>
            </Shell>
          </div>
          <div className="s12">
            <Shell title="Rolling form" aria="Win rate and profit factor over the last 10 trades" headers={["Trade", "Win rate", "Profit factor"]} rows={pnl.series.rolling.map((point) => [point.symbol, `${(point.winRate * 100).toFixed(0)}%`, point.profitFactor == null ? "∞" : point.profitFactor.toFixed(2)])} empty={pnl.series.rolling.length < 1 ? needsClosed(closed, 10) : null} height={220}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={pnl.series.rolling}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="symbol" stroke="var(--ink3)" fontSize={11} />
                  <YAxis stroke="var(--ink3)" fontSize={11} />
                  <Line type="monotone" dataKey="winRate" stroke="var(--profit)" dot={false} {...anim} />
                  <Line type="monotone" dataKey="profitFactor" stroke="var(--rs)" dot={false} {...anim} />
                </ComposedChart>
              </ResponsiveContainer>
            </Shell>
          </div>
        </div>
      </section>
    </div>
  );
}

function openTrade(row: unknown, pnl: PnlModel, onOpen?: (trade: PnlTrade) => void) {
  const id = row && typeof row === "object" && "id" in row ? Number((row as { id: number }).id) : NaN;
  const trade = pnl.trades.find((item) => item.id === id);
  if (trade) onOpen?.(trade);
}

function ValueTip({ active, payload, start }: { active?: boolean; payload?: { value?: number; payload?: { date?: string; label?: string } }[]; label?: string; start: number }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  const change = value - start;
  const when = payload[0].payload?.label ?? payload[0].payload?.date ?? "";
  return (
    <div className="tip-card">
      <b>{when}</b>
      <div>{money(value)}</div>
      <div className={change >= 0 ? "profit" : "loss"}>{signed(change)} from the start</div>
    </div>
  );
}

function MonthTip({ active, payload }: { active?: boolean; payload?: { payload?: { label?: string; trades?: number; gross?: number; charges?: number; net?: number } }[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="tip-card">
      <b>{row.label}</b>
      <div>{row.trades} trades</div>
      <div>Gross {signed(row.gross ?? 0)}</div>
      <div>Charges {money(row.charges ?? 0)}</div>
      <div>Net {signed(row.net ?? 0)}</div>
    </div>
  );
}

function TradeTip({ active, payload }: { active?: boolean; payload?: { payload?: PnlTrade }[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const trade = payload[0].payload;
  return (
    <div className="tip-card">
      <b>{trade.symbol}</b>
      <div>{shortDate(trade.entryDate)}{trade.exitDate ? ` → ${shortDate(trade.exitDate)}` : ""}</div>
      <div>{trade.exitReason ? REASON_LABEL[trade.exitReason] : "Open"}</div>
      <div>{signed(trade.net)}</div>
    </div>
  );
}

function Stat({ title, value, detail, accent, meter }: { title: string; value: string; detail?: string; accent: "profit" | "loss" | "neutral"; meter?: number }) {
  return (
    <section className={`card sheet stat accent accent-${accent}`}>
      <p className="lbl">{title}</p>
      <p className={`v ${accent === "neutral" ? "" : accent}`}>{value}</p>
      {detail && <p className="muted">{detail}</p>}
      {meter != null && <div className="meter" aria-hidden="true"><i style={{ width: `${meter}%` }} /></div>}
    </section>
  );
}
