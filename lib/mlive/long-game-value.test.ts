import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "./calendar";
import { DEFAULT_LONGTERM_TAX } from "../../engine/longterm/variants";
import {
  CHART_LIVE_NOTE,
  LONG_GAME_CHART_COLOURS,
  PRICE_AT_COST,
  buildLongGameHistory,
  buildLongGamePresentation,
  chartNeedsLiveNote,
  externalFlows,
  formatSignedInr,
  formatSignedMoney,
  formatSignedPct,
  gainContribution,
  niftyShadow,
  presentLot,
  presentLots,
  pricesAsOf,
  resolveLongGamePrice,
  sliceChart,
  valueHoldings,
  type LotInput,
  type ResolvedPrice,
} from "./long-game-value";
import { kiteMarksToStore, longGameEtfSymbols, longtermDailyFrom } from "./long-game-symbols";

const TAX = DEFAULT_LONGTERM_TAX;

function price(partial: Partial<ResolvedPrice> & Pick<ResolvedPrice, "source" | "price">): ResolvedPrice {
  return { at: null, atCost: partial.source === "cost", label: partial.source === "cost" ? PRICE_AT_COST : null, ...partial };
}

describe("Long Game price resolution", () => {
  const today = "2026-11-19";
  const closes = [{ date: "2026-11-17", close: 280 }, { date: "2026-11-18", close: 285 }];

  it("lets today's official close win over a Kite mark from the same day", () => {
    const later = resolveLongGamePrice({
      today,
      closes: [...closes, { date: today, close: 288 }],
      kite: { price: 290.6, observedAt: "2026-11-19T10:30:00.000Z" },
      averageCost: 263.78,
    });
    const earlier = resolveLongGamePrice({
      today,
      closes: [...closes, { date: today, close: 288 }],
      kite: { price: 290.6, observedAt: "2026-11-19T02:00:00.000Z" },
      averageCost: 263.78,
    });
    expect(later).toMatchObject({ price: 288, source: "daily_close", at: today, atCost: false });
    expect(earlier.source).toBe("daily_close");
  });

  it("uses today's Kite mark when today's official close is absent", () => {
    const resolved = resolveLongGamePrice({
      today,
      closes,
      kite: { price: 290.6, observedAt: "2026-11-19T03:12:00.000Z" },
      averageCost: 263.78,
    });
    expect(resolved).toMatchObject({ price: 290.6, source: "kite_holding", atCost: false });
  });

  it("does not let a stale Kite mark override a newer daily close", () => {
    const resolved = resolveLongGamePrice({
      today,
      closes,
      kite: { price: 270, observedAt: "2026-11-17T04:00:00.000Z" },
      averageCost: 263.78,
    });
    expect(resolved).toMatchObject({ price: 285, source: "prior_close", at: "2026-11-18" });
  });

  it("uses the latest earlier close when nothing was marked today", () => {
    const resolved = resolveLongGamePrice({ today, closes, kite: null, averageCost: 263.78 });
    expect(resolved).toMatchObject({ price: 285, source: "prior_close", at: "2026-11-18", atCost: false });
  });

  it("falls back to cost only when every market source is absent", () => {
    const resolved = resolveLongGamePrice({
      today,
      closes: [],
      kite: { price: 270, observedAt: "2026-11-17T04:00:00.000Z" },
      averageCost: 263.78,
    });
    expect(resolved).toMatchObject({ price: 263.78, source: "cost", atCost: true, label: PRICE_AT_COST });
  });

  it("dates a mixed total from the oldest market mark", () => {
    const caption = pricesAsOf([
      { symbol: "GOLDBEES", price: price({ source: "prior_close", price: 80, at: "2026-11-18" }) },
      { symbol: "NIFTYBEES", price: price({ source: "kite_holding", price: 290.6, at: "2026-11-19T03:12:00.000Z" }) },
    ]);
    expect(caption).toBe("Prices through 18 Nov 2026 · NIFTYBEES read from Kite at 08:42");
  });
});

describe("Long Game valuation", () => {
  const units = 794;
  const invested = 209_442.06;
  const mark = 290.6;

  it("values the 794-unit Nifty holding from its mark", () => {
    const book = buildLongGamePresentation({
      today: "2026-11-19",
      holdings: [{ pocket: "core", symbol: "NIFTYBEES", units, average: invested / units }],
      ledger: [{ kind: "opening_holding", amount: invested, pocket: "core", symbol: "NIFTYBEES", units, createdAt: "2026-11-19" }],
      lots: [lot({ id: 1, qtyOpen: units, qtyOriginal: units, price: invested / units, acquiredOn: "2026-03-01", taxDateAssumption: "month_start", estimated: true })],
      marks: [{ symbol: "NIFTYBEES", price: mark, observedAt: "2026-11-19T03:12:00.000Z" }],
      closes: [],
      nifty: [],
      sessions: [],
      cash: 0,
    });
    expect(book.invested).toBeCloseTo(invested, 2);
    expect(book.moneyAdded).toBeCloseTo(invested, 2);
    expect(book.holdings[0]?.price).toBe(mark);
    expect(book.value).toBeCloseTo(230_736.4, 2);
    expect(book.gain).toBeCloseTo(21_294.34, 2);
    expect(book.gainPct).toBeCloseTo(10.17, 2);
    expect(book.holdings[0]?.gainPct).toBeCloseTo(10.17, 2);
  });

  it("does not invent a lot gain or a Nifty gap from a rounded stored price", () => {
    const book = buildLongGamePresentation({
      today: "2026-11-19",
      holdings: [{ pocket: "core", symbol: "NIFTYBEES", units, average: 263.7809 }],
      ledger: [{ kind: "opening_holding", amount: invested, pocket: "core", symbol: "NIFTYBEES", units, createdAt: "2026-11-19" }],
      lots: [lot({ id: 1, qtyOpen: units, qtyOriginal: units, price: 263.7809, acquiredOn: "2026-03-01", acquisitionDate: "2026-03-01", taxDateAssumption: "month_start", estimated: true })],
      marks: [],
      closes: [],
      nifty: [{ date: "2026-03-02", close: 20_000 }, { date: "2026-11-18", close: 22_000 }],
      sessions: ["2026-03-02", "2026-11-18"],
      cash: 0,
    });
    expect(book.pricesAtCost).toBe(true);
    expect(book.lots[0]?.cost).toBeCloseTo(invested, 2);
    expect(book.lots[0]?.gain).toBeCloseTo(0, 2);
    expect(book.vsNiftyPp).toBeNull();
    expect(book.priceCaption).toBe(PRICE_AT_COST);
  });

  it("treats deposits and withdrawals as external and ignores internal sales and liquid income", () => {
    const flows = externalFlows({
      lots: [{ date: "2026-03-02", units: 10, price: 100 }],
      ledger: [
        { kind: "opening_holding", amount: 1000, pocket: "core", symbol: "NIFTYBEES", units: 10, createdAt: "2026-11-19" },
        { kind: "deposit", amount: 500, pocket: "core", createdAt: "2026-06-01" },
        { kind: "withdrawal", amount: 200, pocket: "core", createdAt: "2026-07-01" },
        { kind: "sale_proceeds", amount: 300, pocket: "core", symbol: "NIFTYBEES", units: 2, createdAt: "2026-08-01" },
        { kind: "income_units", amount: 0, pocket: "core", symbol: "LIQUIDBEES", units: 3, createdAt: "2026-08-15" },
      ],
    });
    expect(flows).toEqual([
      { date: "2026-03-02", amount: 1000, kind: "contribution" },
      { date: "2026-06-01", amount: 500, kind: "contribution" },
      { date: "2026-07-01", amount: 200, kind: "withdrawal" },
    ]);
  });

  it("never formats a near-zero loss as minus zero", () => {
    for (const value of [-0.2, -0, 0, 0.2]) {
      expect(formatSignedInr(value)).toBe("₹0");
      expect(formatSignedInr(value)).not.toMatch(/−₹0|-₹0/);
    }
    expect(formatSignedMoney(21_294.34)).toBe("+₹21,294.34");
    expect(formatSignedMoney(-0.004)).toBe("₹0");
    expect(formatSignedMoney(-0.004)).not.toMatch(/−₹0|-₹0/);
    expect(formatSignedPct(-0.04)).toBe("0.0%");
    expect(formatSignedPct(-0)).toBe("0.0%");
    expect(formatSignedPct(-0.04)).not.toMatch(/−0\.0%|-0\.0%/);
  });
});

describe("Nifty shadow portfolio", () => {
  const closes = [
    { date: "2026-03-02", close: 20_000 },
    { date: "2026-06-01", close: 22_000 },
    { date: "2026-09-01", close: 24_000 },
  ];

  it("buys on each contribution date and sells on a withdrawal", () => {
    const shadow = niftyShadow([
      { date: "2026-03-02", amount: 20_000, kind: "contribution" },
      { date: "2026-06-01", amount: 11_000, kind: "contribution" },
      { date: "2026-09-01", amount: 2_400, kind: "withdrawal" },
    ], closes);
    expect(shadow.series[0]?.units).toBeCloseTo(1, 6);
    expect(shadow.series[1]?.units).toBeCloseTo(1.5, 6);
    expect(shadow.units).toBeCloseTo(1.4, 6);
    expect(shadow.value).toBeCloseTo(33_600, 2);
    expect(shadow.returnPct).toBeCloseTo(((33_600 + 2_400 - 31_000) / 31_000) * 100, 6);
  });

  it("uses the next close when the cash-flow date has none", () => {
    const shadow = niftyShadow([{ date: "2026-03-01", amount: 20_000, kind: "contribution" }], closes);
    expect(shadow.adjustments).toEqual([{ flowDate: "2026-03-01", usedDate: "2026-03-02" }]);
    expect(shadow.units).toBeCloseTo(1, 6);
  });

  it("keeps shadow units still when the only extra event is an internal sale", () => {
    const withSale = externalFlows({
      lots: [{ date: "2026-03-02", units: 100, price: 200 }],
      ledger: [{ kind: "sale_proceeds", amount: 5_000, pocket: "core", symbol: "NIFTYBEES", units: 20, createdAt: "2026-06-01" }],
    });
    const shadow = niftyShadow(withSale, closes);
    expect(shadow.units).toBeCloseTo(1, 6);
  });

  it("uses the same external-flow return and a Nifty BeES book nearly overlaps the shadow", () => {
    const book = buildLongGamePresentation({
      today: "2026-06-01",
      holdings: [{ pocket: "core", symbol: "NIFTYBEES", units: 100, average: 200 }],
      ledger: [{ kind: "opening_holding", amount: 20_000, pocket: "core", symbol: "NIFTYBEES", units: 100, createdAt: "2026-03-02" }],
      lots: [lot({ id: 1, qtyOpen: 100, qtyOriginal: 100, price: 200, acquiredOn: "2026-03-02", taxDateAssumption: "tradebook" })],
      marks: [],
      closes: [
        { symbol: "NIFTYBEES", date: "2026-03-02", close: 200 },
        { symbol: "NIFTYBEES", date: "2026-06-01", close: 220 },
      ],
      nifty: closes.slice(0, 2),
      sessions: ["2026-03-02", "2026-06-01"],
      cash: 0,
    });
    expect(book.longReturnPct).toBeCloseTo(book.niftyReturnPct ?? 0, 6);
    expect(book.vsNiftyPp).toBeCloseTo(0, 6);
    expect(book.chart[1]?.value).toBeCloseTo(book.chart[1]?.nifty ?? 0, 4);
    expect(book.chartNote).toBeNull();
  });
});

describe("holdings contribution", () => {
  it("splits the total from unrounded gains and hides a zero total", () => {
    const prices = new Map<string, ResolvedPrice>([
      ["NIFTYBEES", price({ source: "daily_close", price: 11.5, at: "2026-11-18" })],
      ["GOLDBEES", price({ source: "daily_close", price: 9.5, at: "2026-11-18" })],
    ]);
    const rows = valueHoldings([
      { pocket: "core", symbol: "NIFTYBEES", units: 100, average: 10 },
      { pocket: "core", symbol: "GOLDBEES", units: 100, average: 10 },
    ], prices);
    expect(rows[0]?.invested).toBe(1000);
    expect(rows[0]?.value).toBeCloseTo(1150, 6);
    expect(rows[0]?.gain).toBeCloseTo(150, 6);
    expect(rows[1]?.gain).toBeCloseTo(-50, 6);
    expect(rows[0]?.contribution).toBeCloseTo(150, 6);
    expect(rows[1]?.contribution).toBeCloseTo(-50, 6);
    const sum = rows.reduce((total, row) => total + (row.contribution ?? 0), 0);
    expect(sum).toBeCloseTo(100, 6);
    expect(gainContribution(10, 0)).toBeNull();
    expect(rows.reduce((total, row) => total + row.value, 0)).toBeCloseTo(2100, 6);
  });
});

describe("FIFO lots", () => {
  it("returns six tradebook lots and values the open quantity", () => {
    const dates = ["2026-03-02", "2026-04-07", "2026-05-11", "2026-06-16", "2026-07-20", "2026-09-08"];
    const lots = dates.map((date, index) => lot({
      id: index + 1,
      qtyOpen: index === 5 ? 94 : 140,
      qtyOriginal: index === 5 ? 120 : 140,
      price: 250 + index,
      acquiredOn: date,
      acquisitionDate: date,
      taxDateAssumption: "tradebook",
      estimated: false,
    }));
    const shown = presentLots(lots, new Map([["NIFTYBEES", 290.6]]));
    expect(shown).toHaveLength(6);
    expect(shown.map((row) => row.date)).toEqual(dates);
    expect(shown.every((row) => row.quality == null)).toBe(true);
    const last = shown[5];
    expect(last?.units).toBe(94);
    expect(last?.cost).toBeCloseTo(94 * 255, 6);
    expect(last?.value).toBeCloseTo(94 * 290.6, 6);
    expect(last?.longTermDate).toBe(addDays("2026-09-08", TAX.equity.longTermDays));
  });

  it("labels an assumed date and uses the tax config for a real tradebook date", () => {
    const trade = presentLot(lot({
      id: 1,
      taxDateAssumption: "tradebook",
      acquiredOn: "2026-03-02",
      acquisitionDate: "2026-03-02",
    }), 10, { ...TAX, equity: { ...TAX.equity, longTermDays: 10 } });
    expect(trade.quality).toBeNull();
    expect(trade.longTermDate).toBe("2026-03-12");
    const assumed = presentLot(lot({
      id: 2,
      taxDateAssumption: "registration_plus_12_months",
      acquiredOn: "2026-11-19",
      acquisitionDate: null,
      registeredOn: "2026-11-19",
      estimated: false,
    }), 10);
    expect(assumed.quality).toBe("Assumed");
    expect(assumed.longTermDate).toBe("2027-11-19");
    const estimated = presentLot(lot({
      id: 3,
      taxDateAssumption: "month_start",
      acquiredOn: "2026-03-01",
      acquisitionDate: "2026-03-01",
      estimated: true,
    }), 10);
    expect(estimated.quality).toBe("Estimated");
  });
});

describe("Long Game chart", () => {
  const nifty = [
    { date: "2025-11-18", close: 19_000 },
    { date: "2026-03-02", close: 20_000 },
    { date: "2026-08-18", close: 21_000 },
    { date: "2026-08-19", close: 21_100 },
    { date: "2026-11-18", close: 22_000 },
  ];

  it("steps money added on the lot dates and plots the shadow, without a price before the first candle", () => {
    const points = buildLongGameHistory({
      sessions: nifty.map((row) => row.date),
      lots: [
        { symbol: "NIFTYBEES", date: "2026-03-02", units: 100, price: 200 },
        { symbol: "NIFTYBEES", date: "2026-08-19", units: 50, price: 210 },
      ],
      flows: [
        { date: "2025-11-18", amount: 1_000, kind: "contribution" },
        { date: "2026-03-02", amount: 20_000, kind: "contribution" },
        { date: "2026-08-19", amount: 10_500, kind: "contribution" },
      ],
      closes: { NIFTYBEES: [{ date: "2026-08-19", close: 210 }, { date: "2026-11-18", close: 220 }] },
      nifty,
    });
    const firstLot = points.find((point) => point.date === "2026-03-02");
    expect(firstLot?.value).toBeNull();
    expect(firstLot?.moneyAdded).toBe(21_000);
    expect(firstLot?.nifty).toBeCloseTo(1_000 * (20_000 / 19_000) + 20_000, 2);
    expect(points.find((point) => point.date === "2026-08-19")?.moneyAdded).toBe(31_500);
    expect(points.at(-1)?.value).toBeCloseTo(150 * 220, 4);
    expect(points.at(-1)?.nifty).toBeCloseTo(1_000 * (22_000 / 19_000) + 20_000 * (22_000 / 20_000) + 10_500 * (22_000 / 21_100), 2);
    const year = sliceChart(points, "1Y", "2026-11-19");
    const three = sliceChart(points, "3M", "2026-11-19");
    expect(year[0]?.date).toBe("2025-11-18");
    expect(three[0]?.date).toBe("2026-08-18");
    expect(three[1]?.date).toBe("2026-08-19");
    expect(LONG_GAME_CHART_COLOURS).toEqual({ value: "#F2A20C", moneyAdded: "#14161C", nifty: "#2F6FB5" });
    expect(Object.values(LONG_GAME_CHART_COLOURS)).not.toContain("#6B4FB3");
    const chart = readFileSync(new URL("../../components/mlive/long-game-chart.tsx", import.meta.url), "utf8");
    expect(chart).toContain("LONG_GAME_CHART_COLOURS");
    expect(chart).not.toContain("#6B4FB3");
    expect(chart).toContain("3M");
    expect(chart).toContain("Money added");
    expect(chartNeedsLiveNote([price({ source: "kite_holding", price: 1, at: "2026-11-19T03:12:00.000Z" })])).toBe(true);
    expect(CHART_LIVE_NOTE).toMatch(/daily closes/);
  });
});

describe("canonical Long Game symbols", () => {
  it("follows the secondary setting and keeps an attributed ETF", () => {
    expect(longGameEtfSymbols("mid")).toEqual(["NIFTYBEES", "MID150BEES", "GOLDBEES", "LIQUIDBEES"]);
    expect(longGameEtfSymbols("next")).toEqual(["NIFTYBEES", "JUNIORBEES", "GOLDBEES", "LIQUIDBEES"]);
    expect(longGameEtfSymbols("mid", ["JUNIORBEES", "INFY"])).toEqual([
      "NIFTYBEES",
      "MID150BEES",
      "GOLDBEES",
      "LIQUIDBEES",
      "JUNIORBEES",
    ]);
    expect(longtermDailyFrom(null)).toBe("2026-03-01");
    expect(longtermDailyFrom("2026-04-01")).toBe("2026-03-01");
    expect(longtermDailyFrom("2026-02-11")).toBe("2026-02-11");
    expect(kiteMarksToStore([
      { tradingsymbol: "NIFTYBEES", lastPrice: 290.6 },
      { tradingsymbol: "INFY", lastPrice: 100 },
      { tradingsymbol: "GOLDBEES", lastPrice: 0 },
    ], longGameEtfSymbols("mid"))).toEqual([{ symbol: "NIFTYBEES", price: 290.6, source: "kite_holding" }]);
  });
});

function lot(partial: Partial<LotInput> & Pick<LotInput, "id">): LotInput {
  return {
    pocket: "core",
    symbol: "NIFTYBEES",
    qtyOpen: 10,
    qtyOriginal: 10,
    price: 100,
    acquiredOn: "2026-03-02",
    acquisitionDate: "2026-03-02",
    taxDateAssumption: "tradebook",
    registeredOn: "2026-11-19",
    estimated: false,
    ...partial,
  };
}
