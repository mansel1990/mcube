import { describe, expect, it } from "vitest";
import { estimateCharges } from "./charges";
import {
  accountDrawdown,
  equitySeries,
  homeAccount,
  moveAlong,
  nearestIndex,
  plotChart,
  seriesMove,
  strategyBoard,
  strategyFromBooks,
} from "./charts";

const width = 800;
const height = 268;

describe("chart maths", () => {
  it("draws nothing from an empty book", () => {
    expect(equitySeries({ history: [], deposit: null, live: null })).toEqual([]);
    const plot = plotChart([], width, height);
    expect(plot.points).toEqual([]);
    expect(plot.ticks).toEqual([]);
    expect(plot.dates).toEqual([]);
    expect(seriesMove([])).toBe(0);
  });

  it("draws one point in the middle", () => {
    const series = equitySeries({
      history: [{ date: "2026-11-07", value: 80100, peak: 80100, drawdown: 0 }],
      deposit: null,
      live: null,
    });
    expect(series).toHaveLength(1);
    const plot = plotChart(series, width, height);
    expect(plot.points).toHaveLength(1);
    expect(plot.points[0].x).toBeCloseTo((plot.left + plot.right) / 2);
    expect(plot.dates.map((item) => item.label)).toEqual(["7 Nov"]);
    expect(seriesMove(series)).toBe(0);
  });

  it("draws a line once there are two points", () => {
    const series = equitySeries({
      history: [
        { date: "2026-11-07", value: 80000, peak: 80000, drawdown: 0 },
        { date: "2026-11-08", value: 82000, peak: 82000, drawdown: 0 },
      ],
      deposit: null,
      live: null,
    });
    expect(series).toHaveLength(2);
    const plot = plotChart(series, width, height);
    expect(plot.points[0].x).toBeLessThan(plot.points[1].x);
    expect(plot.points[1].y).toBeLessThan(plot.points[0].y);
    expect(plot.dates.map((item) => item.label)).toEqual(["7 Nov", "8 Nov"]);
    expect(moveAlong(null, 1, series.length)).toBe(0);
    expect(moveAlong(0, 1, series.length)).toBe(1);
    expect(moveAlong(1, 1, series.length)).toBe(1);
    expect(moveAlong(1, -1, series.length)).toBe(0);
    expect(nearestIndex(plot.points, plot.points[1].x)).toBe(1);
  });

  it("keeps a flat line level", () => {
    const series = equitySeries({
      history: [],
      deposit: { date: "2026-11-05", amount: 80000 },
      live: { date: "2026-11-09", value: 80000, peak: 80000, drawdown: 0 },
    });
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ start: true, value: 80000 });
    expect(series[1]).toMatchObject({ live: true, value: 80000 });
    const plot = plotChart(series, width, height);
    expect(plot.points[0].y).toBeCloseTo(plot.points[1].y);
    expect(seriesMove(series)).toBe(0);
    expect(plot.ticks.map((tick) => tick.value)).toContain(80000);
  });

  it("keeps a pending buy inside the account", () => {
    const account = homeAccount({ fund: 80_000, positions: [] });
    expect(account).toBe(80_000);
    expect(accountDrawdown(account, 80_000)).toBe(0);
  });

  it("marks an open position at the live price", () => {
    const account = homeAccount({
      fund: 80_000,
      positions: [{ qty: 7, avgPrice: 2438.5, live: 2445 }],
    });
    expect(account).toBe(80_045.5);
    expect(homeAccount({
      fund: 80_000,
      positions: [{ qty: 7, avgPrice: 2438.5, live: null }],
    })).toBe(80_000);
  });

  it("uses today's live account value", () => {
    const account = homeAccount({
      fund: 83000,
      positions: [{ qty: 1, avgPrice: 10000, live: null }],
    });
    const peak = 84000;
    const drawdown = accountDrawdown(account, peak);
    const series = equitySeries({
      history: [{ date: "2026-11-09", value: 79000, peak: 80000, drawdown: 1 }],
      deposit: { date: "2026-11-05", amount: 80000 },
      live: { date: "2026-11-09", value: account, peak, drawdown },
    });
    expect(account).toBe(83000);
    expect(series[0]).toMatchObject({ date: "2026-11-05", value: 80000, start: true });
    expect(series.filter((point) => point.date === "2026-11-09")).toHaveLength(1);
    expect(series.at(-1)).toMatchObject({ value: account, live: true, peak, drawdown });

    const openedToday = equitySeries({
      history: [],
      deposit: { date: "2026-11-09", amount: 80000 },
      live: { date: "2026-11-09", value: 80000, peak: 80000, drawdown: 0 },
    });
    expect(openedToday).toHaveLength(2);
    expect(openedToday[0].start).toBe(true);
    expect(openedToday[1].live).toBe(true);
  });

  it("agrees the strategy P&L with the account line", () => {
    const rows = [
      { strategy: "rs", pnl: 1000, trades: 2, wins: 1 },
      { strategy: "rs", pnl: 800, trades: 1, wins: 1 },
      { strategy: "ema", pnl: -300, trades: 2, wins: 1 },
    ];
    const board = strategyBoard(rows);
    expect(board).toEqual([
      { strategy: "rs", pnl: 1800, trades: 3, wins: 2 },
      { strategy: "ema", pnl: -300, trades: 2, wins: 1 },
    ]);
    const realised = rows.reduce((sum, row) => sum + row.pnl, 0);
    expect(board.reduce((sum, row) => sum + row.pnl, 0)).toBe(realised);
    expect(strategyBoard([])).toEqual([
      { strategy: "rs", pnl: 0, trades: 0, wins: 0 },
      { strategy: "ema", pnl: 0, trades: 0, wins: 0 },
    ]);

    const account = homeAccount({ fund: 80000 + realised, positions: [] });
    const series = equitySeries({
      history: [],
      deposit: { date: "2026-11-05", amount: 80000 },
      live: { date: "2026-11-09", value: account, peak: account, drawdown: accountDrawdown(account, account) },
    });
    expect(seriesMove(series)).toBe(realised);
    expect(series.at(-1)?.value).toBe(account);
  });

  it("nets the MPHASIS round trip against every fund-ledger row", () => {
    const buyTurnover = 7 * 2438.5;
    const sellTurnover = 7 * 2444.8;
    const buy = estimateCharges("BUY", buyTurnover, undefined, true).total;
    const sell = estimateCharges("SELL", sellTurnover, undefined, true).total;
    const deliveryBuy = estimateCharges("BUY", buyTurnover).total;
    const deliverySell = estimateCharges("SELL", sellTurnover).total;
    const gross = sellTurnover - buyTurnover;
    const bookedRealised = Math.round((gross - deliverySell) * 100) / 100;
    const sellCredit = Math.round((deliverySell - sell) * 100) / 100;
    const buyCredit = Math.round((deliveryBuy - buy) * 100) / 100;
    const opened = Date.parse("2026-11-09T04:00:00.000Z");
    const closed = Date.parse("2026-11-09T09:00:00.000Z");
    const ledger = [
      { kind: "charges", amount: -deliveryBuy },
      { kind: "realised_pnl", amount: bookedRealised },
      { kind: "charges", amount: buyCredit },
      { kind: "realised_pnl", amount: sellCredit },
    ];
    const ledgerSum = Math.round(ledger.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const board = strategyFromBooks(
      [{
        strategy: "rs",
        realised: Math.round((bookedRealised + sellCredit) * 100) / 100,
        closed: true,
        symbol: "MPHASIS",
        dryRun: false,
        openedAt: opened,
        closedAt: closed,
      }],
      [
        { symbol: "MPHASIS", dryRun: false, amount: -deliveryBuy, ts: opened + 60_000 },
        { symbol: "MPHASIS", dryRun: false, amount: buyCredit, ts: closed - 60_000 },
      ]
    );
    expect(Math.abs(board[0].pnl - ledgerSum)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(ledgerSum - 26)).toBeLessThan(1);
    expect(board[0]).toMatchObject({ strategy: "rs", trades: 1, wins: 1 });
    expect(board[1]).toMatchObject({ strategy: "ema", pnl: 0, trades: 0, wins: 0 });
  });

  it("keeps a later MPHASIS charge adjustment on the order it references", () => {
    const buyTurnover = 7 * 2438.5;
    const sellTurnover = 7 * 2444.8;
    const buy = estimateCharges("BUY", buyTurnover, undefined, true).total;
    const sell = estimateCharges("SELL", sellTurnover, undefined, true).total;
    const deliveryBuy = estimateCharges("BUY", buyTurnover).total;
    const deliverySell = estimateCharges("SELL", sellTurnover).total;
    const gross = sellTurnover - buyTurnover;
    const bookedRealised = Math.round((gross - deliverySell) * 100) / 100;
    const sellCredit = Math.round((deliverySell - sell) * 100) / 100;
    const buyCredit = Math.round((deliveryBuy - buy) * 100) / 100;
    const opened = Date.parse("2026-11-09T04:00:00.000Z");
    const closed = Date.parse("2026-11-09T09:00:00.000Z");
    const ledgerSum = Math.round((-deliveryBuy + bookedRealised + buyCredit + sellCredit) * 100) / 100;
    const board = strategyFromBooks(
      [{
        strategy: "rs",
        realised: Math.round((bookedRealised + sellCredit) * 100) / 100,
        closed: true,
        symbol: "MPHASIS",
        dryRun: false,
        openedAt: opened,
        closedAt: closed,
      }],
      [
        { symbol: "MPHASIS", dryRun: false, amount: -deliveryBuy, ts: opened + 60_000 },
        {
          symbol: "MPHASIS",
          dryRun: false,
          amount: buyCredit,
          ts: closed + 2 * 60 * 60 * 1000,
          orderAt: closed - 60_000,
        },
      ]
    );
    expect(Math.abs(board[0].pnl - ledgerSum)).toBeLessThanOrEqual(0.01);
  });
});
