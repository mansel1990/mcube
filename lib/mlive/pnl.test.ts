import { describe, expect, it } from "vitest";
import { estimateCharges } from "./charges";
import { buildPnl, type BuildPnlInput, type PnlChargeItem, type PnlFill, type PnlLedgerRow, type PnlPosition } from "./pnl";

const EMPTY: BuildPnlInput = {
  positions: [],
  fills: [],
  chargeItems: [],
  ledger: [],
  equity: [],
  marks: {},
  gtts: [],
  ohlcv: [],
  today: "2026-11-09",
  range: "all",
  strategy: "all",
};

function sumSplit(row: { brokerage: number; stt: number; exchange: number; sebi: number; stamp: number; gst: number; dp: number }) {
  return Math.round((row.brokerage + row.stt + row.exchange + row.sebi + row.stamp + row.gst + row.dp) * 100) / 100;
}

describe("MPHASIS", () => {
  const buyTurnover = 7 * 2438.5;
  const sellTurnover = 7 * 2444.8;
  const delivery = estimateCharges("BUY", buyTurnover);
  const intradayBuy = estimateCharges("BUY", buyTurnover, undefined, true);
  const intradaySell = estimateCharges("SELL", sellTurnover, undefined, true);
  const opened = "2026-11-09T04:00:00.000Z";
  const closed = "2026-11-09T09:00:00.000Z";

  const position: PnlPosition = {
    id: 1,
    symbol: "MPHASIS",
    strategy: "rs",
    qty: 0,
    avgPrice: 2438.5,
    openedAt: opened,
    closedAt: closed,
    trendStop: 2400,
    initialStop: 2485.09,
    realisedPnl: 33.14,
    charges: 18.14,
    exitReason: "gtt_fallback",
  };
  const fills: PnlFill[] = [
    { id: 1, positionId: 1, side: "BUY", qty: 7, price: 2438.5, ts: opened },
    { id: 2, positionId: 1, side: "SELL", qty: 7, price: 2444.8, ts: closed, kind: "gtt_fallback" },
  ];
  const chargeItems: PnlChargeItem[] = [
    { id: 1, positionId: 1, side: "BUY", intraday: false, source: "formula", ts: opened, brokerage: delivery.brokerage, stt: delivery.stt, exchange: delivery.exchange, sebi: delivery.sebi, stamp: delivery.stamp, gst: delivery.gst, dp: delivery.dp, total: delivery.total },
    { id: 2, positionId: 1, side: "SELL", intraday: true, source: "formula", ts: closed, brokerage: intradaySell.brokerage, stt: intradaySell.stt, exchange: intradaySell.exchange, sebi: intradaySell.sebi, stamp: intradaySell.stamp, gst: intradaySell.gst, dp: intradaySell.dp, total: intradaySell.total },
    {
      id: 3,
      positionId: 1,
      side: "BUY",
      intraday: true,
      source: "adjustment",
      ts: closed,
      brokerage: intradayBuy.brokerage - delivery.brokerage,
      stt: intradayBuy.stt - delivery.stt,
      exchange: intradayBuy.exchange - delivery.exchange,
      sebi: intradayBuy.sebi - delivery.sebi,
      stamp: intradayBuy.stamp - delivery.stamp,
      gst: intradayBuy.gst - delivery.gst,
      dp: intradayBuy.dp - delivery.dp,
      total: intradayBuy.total - delivery.total,
    },
  ];
  const ledger: PnlLedgerRow[] = [
    { id: 1, kind: "charges", amount: -delivery.total, ts: opened, dryRun: false },
    { id: 2, kind: "realised_pnl", amount: 44.1 - intradaySell.total, ts: closed, dryRun: false },
    { id: 3, kind: "charges", amount: delivery.total - intradayBuy.total, ts: closed, dryRun: false },
  ];

  const model = buildPnl({
    ...EMPTY,
    positions: [position],
    fills,
    chargeItems,
    ledger,
    ohlcv: [
      { symbol: "MPHASIS", date: "2026-11-09", high: 2500, low: 2400, close: 2444.8 },
      { symbol: "MPHASIS", date: "2026-11-10", high: 3000, low: 1000, close: 2000 },
    ],
  });
  const trade = model.trades[0];

  it("books the round trip net of the intraday adjustment", () => {
    expect(trade.gross).toBe(44.1);
    expect(trade.charges.total).toBeCloseTo(18.14, 2);
    expect(Math.round(trade.charges.total * 10) / 10).toBe(18.1);
    expect(sumSplit(trade.charges)).toBe(trade.charges.total);
    expect(trade.net).toBeCloseTo(trade.gross - trade.charges.total, 2);
    const ledgerSum = Math.round(ledger.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    expect(Math.abs(trade.net - ledgerSum)).toBeLessThanOrEqual(0.01);
    expect(trade.daysHeld).toBe(0);
    expect(trade.intraday).toBe(true);
    expect(trade.r).toBeNull();
    expect(trade.boughtBelowStop).toBe(true);
    expect(trade.charges.unclassified).toBe(0);
    expect(trade.exitReason).toBe("gtt_fallback");
    expect(trade.mfe).toBeCloseTo(((2500 - 2438.5) / 2438.5) * 100, 6);
    expect(trade.mae).toBeCloseTo(((2400 - 2438.5) / 2438.5) * 100, 6);
  });
});

type Spec = {
  id: number;
  symbol: string;
  strategy: "rs" | "ema";
  entry: string;
  exit: string;
  gross: number;
  exitReason?: PnlPosition["exitReason"];
};

const SIX: Spec[] = [
  { id: 1, symbol: "AAA", strategy: "rs", entry: "2026-10-05", exit: "2026-10-06", gross: 200 },
  { id: 2, symbol: "BBB", strategy: "rs", entry: "2026-10-07", exit: "2026-10-09", gross: 120 },
  { id: 3, symbol: "CCC", strategy: "rs", entry: "2026-10-12", exit: "2026-10-13", gross: -30 },
  { id: 4, symbol: "DDD", strategy: "rs", entry: "2026-10-14", exit: "2026-10-16", gross: -60 },
  { id: 5, symbol: "EEE", strategy: "rs", entry: "2026-10-19", exit: "2026-10-20", gross: 60 },
  { id: 6, symbol: "FFF", strategy: "ema", entry: "2026-10-21", exit: "2026-10-23", gross: 80, exitReason: "trend_stop" },
];

function sixInput(overrides: Partial<BuildPnlInput> = {}): BuildPnlInput {
  const positions: PnlPosition[] = SIX.map((spec) => ({
    id: spec.id,
    symbol: spec.symbol,
    strategy: spec.strategy,
    qty: 0,
    avgPrice: 100,
    openedAt: `${spec.entry}T04:00:00.000Z`,
    closedAt: `${spec.exit}T09:00:00.000Z`,
    trendStop: 90,
    initialStop: 90,
    exitReason: spec.exitReason ?? "trend_stop",
  }));
  const fills: PnlFill[] = SIX.flatMap((spec) => {
    const exitPrice = 100 + spec.gross / 10;
    return [
      { id: spec.id * 2, positionId: spec.id, side: "BUY" as const, qty: 10, price: 100, ts: `${spec.entry}T04:00:00.000Z` },
      { id: spec.id * 2 + 1, positionId: spec.id, side: "SELL" as const, qty: 10, price: exitPrice, ts: `${spec.exit}T09:00:00.000Z` },
    ];
  });
  const chargeItems: PnlChargeItem[] = SIX.map((spec) => ({
    id: spec.id,
    positionId: spec.id,
    side: "SELL" as const,
    intraday: false,
    source: "formula" as const,
    ts: `${spec.exit}T09:00:00.000Z`,
    brokerage: 20,
    stt: 0,
    exchange: 0,
    sebi: 0,
    stamp: 0,
    gst: 0,
    dp: 0,
    total: 20,
  }));
  return {
    ...EMPTY,
    today: "2026-10-23",
    positions,
    fills,
    chargeItems,
    ledger: [{ id: 1, kind: "deposit", amount: 80000, ts: "2026-10-01T04:00:00.000Z", dryRun: false }],
    ...overrides,
  };
}

describe("six closed trades", () => {
  const model = buildPnl(sixInput());
  const { stats } = model;

  it("matches win rate, payoff, profit factor, expectancy, streaks and R bins", () => {
    expect(stats.trades).toBe(6);
    expect(stats.wins).toBe(4);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(4 / 6, 10);
    expect(stats.avgWin).toBe(95);
    expect(stats.avgLoss).toBe(65);
    expect(stats.payoff).toBeCloseTo(95 / 65, 10);
    expect(stats.profitFactor).toBeCloseTo(380 / 130, 10);
    expect(stats.expectancy).toBeCloseTo(250 / 6, 10);
    expect(stats.expectancyR).toBeCloseTo(2.5 / 6, 10);
    expect(stats.best).toMatchObject({ symbol: "AAA", net: 180 });
    expect(stats.worst).toMatchObject({ symbol: "DDD", net: -80 });
    expect(stats.longestWinStreak).toBe(2);
    expect(stats.longestLossStreak).toBe(2);
    expect(stats.avgDays).toBe(1.5);
    expect(stats.medianDays).toBe(1.5);
    expect(stats.maxOpenPositions).toBe(1);
    expect(stats.maxInvestedPct).toBeCloseTo(1.25, 6);
    const bins = model.distribution?.bins ?? [];
    expect(bins.find((bin) => bin.from === -1)?.count).toBe(1);
    expect(bins.find((bin) => bin.from === -0.5)?.count).toBe(1);
    expect(bins.find((bin) => bin.from === 0)?.count).toBe(1);
    expect(bins.find((bin) => bin.from === 0.5)?.count).toBe(1);
    expect(bins.find((bin) => bin.from === 1)?.count).toBe(1);
    expect(bins.find((bin) => bin.from === 1.5)?.count).toBe(1);
    expect(model.distribution?.mean).toBeCloseTo(2.5 / 6, 10);
    expect(model.distribution?.median).toBe(0.5);
  });

  it("groups months and ISO weeks in IST", () => {
    expect(model.byPeriod.month).toEqual([
      { period: "2026-10", trades: 6, wins: 4, gross: 370, charges: 120, net: 250, cumulative: 250 },
    ]);
    expect(model.byPeriod.week.map((row) => [row.period, row.trades, row.net, row.cumulative])).toEqual([
      ["2026-W41", 2, 280, 280],
      ["2026-W42", 2, -130, 150],
      ["2026-W43", 2, 100, 250],
    ]);
  });
});

describe("capital and filters", () => {
  it("never counts a deposit as profit", () => {
    const model = buildPnl({
      ...EMPTY,
      ledger: [{ id: 1, kind: "deposit", amount: 80000, ts: "2026-10-01T04:00:00.000Z" }],
    });
    expect(model.summary.deposited).toBe(80000);
    expect(model.summary.netRealised).toBe(0);
    expect(model.summary.grossRealised).toBe(0);
    expect(model.summary.netTotal).toBe(0);
    expect(model.summary.accountValue).toBe(80000);
    expect(model.trades).toHaveLength(0);
  });

  it("adds the capital statement up exactly", () => {
    const model = buildPnl({
      ...EMPTY,
      positions: [{ id: 1, symbol: "ZZZ", strategy: "ema", qty: 10, avgPrice: 100, openedAt: "2026-11-09T04:00:00.000Z", closedAt: null, trendStop: 90, initialStop: 90, charges: 20 }],
      fills: [{ id: 1, positionId: 1, side: "BUY", qty: 10, price: 100, ts: "2026-11-09T04:00:00.000Z" }],
      chargeItems: [{ id: 1, positionId: 1, side: "BUY", intraday: false, source: "formula", ts: "2026-11-09T04:00:00.000Z", brokerage: 0, stt: 17, exchange: 0.5, sebi: 0.02, stamp: 1.5, gst: 0.1, dp: 0.88, total: 20 }],
      ledger: [
        { id: 1, kind: "deposit", amount: 80000, ts: "2026-10-01T04:00:00.000Z" },
        { id: 2, kind: "charges", amount: -20, ts: "2026-11-09T04:00:00.000Z" },
      ],
      marks: { ZZZ: 110 },
    });
    const capital = model.capital;
    expect(sumSplit(model.trades[0].charges)).toBe(20);
    expect(capital.starting + capital.deposits - capital.withdrawals + capital.netRealised - capital.openCharges).toBeCloseTo(capital.tradingLimit, 2);
    expect(capital.tradingLimit + capital.openProfit).toBeCloseTo(capital.accountValue, 2);
    expect(capital.openCost + capital.openProfit).toBeCloseTo(capital.marketValue, 2);
    expect(capital.gap).toBe(0);
    expect(capital.openProfit).toBe(100);
    expect(capital.accountValue).toBe(80080);
    expect(model.summary.unrealised).toBe(100);
    expect(model.trades[0].gross).toBe(100);
    expect(model.trades[0].net).toBe(80);
    expect(model.summary.openCharges).toBe(20);
    expect(model.summary.openNet).toBe(80);
    expect(model.summary.netTotal).toBe(80);
    expect(model.summary.netTotal).toBeCloseTo(model.summary.accountValue - model.summary.deposited + model.summary.withdrawn, 2);
  });

  it("counts open buy charges in total P&L and matches the account", () => {
    const model = buildPnl({
      ...EMPTY,
      positions: [
        { id: 1, symbol: "AAA", strategy: "rs", qty: 0, avgPrice: 100, openedAt: "2026-11-02T04:00:00.000Z", closedAt: "2026-11-03T09:00:00.000Z", trendStop: 90, initialStop: 90, charges: 20 },
        { id: 2, symbol: "BBB", strategy: "ema", qty: 10, avgPrice: 100, openedAt: "2026-11-04T04:00:00.000Z", closedAt: null, trendStop: 90, initialStop: 90, charges: 5 },
      ],
      fills: [
        { id: 1, positionId: 1, side: "BUY", qty: 10, price: 100, ts: "2026-11-02T04:00:00.000Z" },
        { id: 2, positionId: 1, side: "SELL", qty: 10, price: 120, ts: "2026-11-03T09:00:00.000Z" },
        { id: 3, positionId: 2, side: "BUY", qty: 10, price: 100, ts: "2026-11-04T04:00:00.000Z" },
      ],
      chargeItems: [
        { id: 1, positionId: 1, side: "BUY", intraday: false, source: "formula", ts: "2026-11-02T04:00:00.000Z", brokerage: 20, stt: 0, exchange: 0, sebi: 0, stamp: 0, gst: 0, dp: 0, total: 20 },
        { id: 2, positionId: 2, side: "BUY", intraday: false, source: "formula", ts: "2026-11-04T04:00:00.000Z", brokerage: 5, stt: 0, exchange: 0, sebi: 0, stamp: 0, gst: 0, dp: 0, total: 5 },
      ],
      ledger: [
        { id: 1, kind: "deposit", amount: 80000, ts: "2026-11-01T04:00:00.000Z" },
        { id: 2, kind: "withdrawal", amount: -1000, ts: "2026-11-01T05:00:00.000Z" },
        { id: 3, kind: "charges", amount: -20, ts: "2026-11-02T04:00:00.000Z" },
        { id: 4, kind: "realised_pnl", amount: 200, ts: "2026-11-03T09:00:00.000Z" },
        { id: 5, kind: "charges", amount: -5, ts: "2026-11-04T04:00:00.000Z" },
      ],
      marks: { BBB: 110 },
    });
    const open = model.trades.find((trade) => trade.symbol === "BBB");
    expect(open?.gross).toBe(100);
    expect(open?.net).toBe(95);
    expect(open?.netPct).toBeCloseTo(9.5, 6);
    expect(model.summary.unrealised).toBe(100);
    expect(model.summary.openCharges).toBe(5);
    expect(model.summary.openNet).toBe(95);
    expect(model.summary.netRealised).toBe(180);
    expect(model.summary.netTotal).toBe(275);
    expect(model.summary.accountValue).toBe(79275);
    expect(model.summary.netTotal).toBeCloseTo(model.summary.accountValue - model.summary.deposited + model.summary.withdrawn, 2);
  });

  it("marks an open position at cost when the live price is missing", () => {
    const input: BuildPnlInput = {
      ...EMPTY,
      positions: [{ id: 1, symbol: "ZZZ", strategy: "rs", qty: 10, avgPrice: 100, openedAt: "2026-11-09T04:00:00.000Z", closedAt: null, trendStop: 90 }],
      fills: [{ id: 1, positionId: 1, side: "BUY", qty: 10, price: 100, ts: "2026-11-09T04:00:00.000Z" }],
      ledger: [{ id: 1, kind: "deposit", amount: 80000, ts: "2026-10-01T04:00:00.000Z" }],
      marks: {},
    };
    expect(buildPnl(input).summary.unrealised).toBe(0);
    expect(buildPnl(input).summary.accountValue).toBe(80000);
    expect(buildPnl({ ...input, marks: { ZZZ: 110 } }).summary.unrealised).toBe(100);
  });

  it("includes the live point in max drawdown", () => {
    const model = buildPnl({
      ...EMPTY,
      ledger: [
        { id: 1, kind: "deposit", amount: 80000, ts: "2026-11-01T04:00:00.000Z" },
        { id: 2, kind: "realised_pnl", amount: -3000, ts: "2026-11-09T09:00:00.000Z" },
      ],
      equity: [
        { date: "2026-11-02", value: 80000 },
        { date: "2026-11-03", value: 79000 },
      ],
    });
    expect(model.summary.accountValue).toBe(77000);
    expect(model.summary.maxDrawdownInr).toBe(3000);
    expect(model.summary.drawdownPct).toBeCloseTo(3.75, 2);
    expect(model.series.account.some((point) => point.live && point.value === 77000)).toBe(true);
  });

  it("always returns both strategies", () => {
    const empty = buildPnl(EMPTY);
    expect(empty.byStrategy.rs.stats.trades).toBe(0);
    expect(empty.byStrategy.ema.stats.trades).toBe(0);
    const model = buildPnl(sixInput());
    expect(model.byStrategy.rs.net).toBe(190);
    expect(model.byStrategy.ema.net).toBe(60);
  });

  it("applies the range and the strategy to every trade block", () => {
    const month = buildPnl(sixInput({ today: "2026-11-09", range: "1m" }));
    expect(month.trades.map((trade) => trade.symbol)).toEqual(["BBB", "CCC", "DDD", "EEE", "FFF"]);
    expect(month.summary.netRealised).toBe(70);
    expect(month.byPeriod.month.reduce((sum, row) => sum + row.net, 0)).toBe(70);
    expect(month.series.cumulative.at(-1)?.net).toBe(70);
    expect(month.stats.trades).toBe(month.trades.length);

    const ema = buildPnl(sixInput({ strategy: "ema" }));
    expect(ema.trades.every((trade) => trade.strategy === "ema")).toBe(true);
    expect(ema.stats.trades).toBe(1);
    expect(ema.summary.netRealised).toBe(60);
    expect(ema.summary.netRealised).toBe(ema.byStrategy.ema.net);
    expect(ema.byPeriod.week.reduce((sum, row) => sum + row.net, 0)).toBe(60);
    expect(ema.series.cumulative.at(-1)?.net).toBe(60);
    expect(ema.byStrategy.rs.stats.trades).toBe(5);
    expect(ema.summary.accountValue).toBe(buildPnl(sixInput()).summary.accountValue);
  });

  it("drops dry-run rows unless dry run is on", () => {
    const input: BuildPnlInput = {
      ...EMPTY,
      positions: [{ id: 9, symbol: "DRY", strategy: "rs", qty: 0, avgPrice: 10, openedAt: "2026-11-02T04:00:00.000Z", closedAt: "2026-11-02T09:00:00.000Z", trendStop: 9, dryRun: true, initialStop: 9 }],
      fills: [
        { id: 1, positionId: 9, side: "BUY", qty: 1, price: 10, ts: "2026-11-02T04:00:00.000Z" },
        { id: 2, positionId: 9, side: "SELL", qty: 1, price: 12, ts: "2026-11-02T09:00:00.000Z" },
      ],
    };
    expect(buildPnl(input).trades).toHaveLength(0);
    expect(buildPnl({ ...input, dryRun: true }).trades).toHaveLength(1);
  });

  it("keeps charges that have no item rows in an unclassified bucket", () => {
    const model = buildPnl({
      ...EMPTY,
      ledger: [{ id: 1, kind: "deposit", amount: 80000, ts: "2026-11-01T04:00:00.000Z" }],
      positions: [{
        id: 1,
        symbol: "ZZZ",
        strategy: "rs",
        qty: 0,
        avgPrice: 100,
        openedAt: "2026-11-09T04:00:00.000Z",
        closedAt: "2026-11-09T09:00:00.000Z",
        trendStop: 90,
        initialStop: 90,
        charges: 20,
        realisedPnl: 80,
      }],
      fills: [
        { id: 1, positionId: 1, side: "BUY", qty: 10, price: 100, ts: "2026-11-09T04:00:00.000Z" },
        { id: 2, positionId: 1, side: "SELL", qty: 10, price: 110, ts: "2026-11-09T09:00:00.000Z" },
      ],
    });
    const trade = model.trades[0];
    expect(trade.charges.brokerage).toBe(0);
    expect(trade.charges.stt).toBe(0);
    expect(trade.charges.unclassified).toBe(20);
    expect(trade.charges.total).toBe(20);
    expect(model.summary.chargesByType.brokerage).toBe(0);
    expect(model.summary.chargesByType.unclassified).toBe(20);
  });
});
