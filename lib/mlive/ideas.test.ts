import { describe, expect, it } from "vitest";
import { actionLabel, applyLivePrices, buildIdeas, quoteState, scannerFacts, stopBroken, type IdeaBar, type IdeaDecision, type IdeaOrder, type IdeaPosition, type IdeaRow } from "./ideas";

function idea(partial: Partial<IdeaRow> & Pick<IdeaRow, "id" | "symbol">): IdeaRow {
  return {
    scanDate: "2026-11-09",
    validFor: "2026-11-10",
    strategy: "ema",
    score: 1,
    signalClose: 100,
    initialStop: 95,
    sector: "Test",
    raw: null,
    ...partial,
  };
}

function closes(symbol: string, start: string, values: number[], lows?: number[]): IdeaBar[] {
  const [year, month, day] = start.split("-").map(Number);
  return values.map((close, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    const iso = date.toISOString().slice(0, 10);
    return { symbol, date: iso, close, low: lows?.[index] ?? close };
  });
}

describe("buildIdeas", () => {
  it("maps each engine outcome onto one status", () => {
    const rows = [
      idea({ id: 1, symbol: "PROP" }),
      idea({ id: 2, symbol: "APPR" }),
      idea({ id: 3, symbol: "WORK" }),
      idea({ id: 4, symbol: "FILL" }),
      idea({ id: 5, symbol: "SKIP" }),
      idea({ id: 6, symbol: "NONE" }),
      idea({ id: 7, symbol: "OLD" }),
    ];
    const decisions: IdeaDecision[] = [
      { id: 1, ideaId: 1, tradeDate: "2026-11-10", outcome: "proposed", reasonCode: "ranked", sizing: { qty: 4, limit: 101, stop: 95 }, positionId: null },
      { id: 2, ideaId: 2, tradeDate: "2026-11-10", outcome: "approved", reasonCode: "ranked", sizing: null, positionId: null },
      { id: 3, ideaId: 3, tradeDate: "2026-11-10", outcome: "sent", reasonCode: "ranked", sizing: { qty: 4, limit: 101, stop: 95 }, positionId: null },
      { id: 4, ideaId: 4, tradeDate: "2026-11-10", outcome: "sent", reasonCode: "ranked", sizing: { qty: 4, limit: 101, stop: 95 }, positionId: 9 },
      { id: 5, ideaId: 5, tradeDate: "2026-11-10", outcome: "skipped", reasonCode: "pacing_day", limitCount: 2, sizing: null, positionId: null },
      { id: 7, ideaId: 7, tradeDate: "2026-11-10", outcome: "expired", reasonCode: null, sizing: null, positionId: null },
    ];
    const orders: IdeaOrder[] = [
      { id: 1, decisionId: 3, side: "BUY", status: "OPEN", qty: 4, filled: 0, avgPrice: null },
      { id: 2, decisionId: 4, side: "BUY", status: "COMPLETE", qty: 4, filled: 4, avgPrice: 100 },
    ];
    const positions: IdeaPosition[] = [
      { id: 9, symbol: "FILL", strategy: "ema", qty: 4, avgPrice: 100, openedOn: "2026-11-10", closed: true, realisedPnl: 12 },
    ];
    const built = buildIdeas(rows, decisions, orders, positions, [], "2026-11-10");
    const by = Object.fromEntries(built.map((row) => [row.symbol, row]));
    expect(by.PROP.status).toBe("waiting_approval");
    expect(by.APPR.status).toBe("approved");
    expect(by.WORK.status).toBe("working");
    expect(by.FILL.status).toBe("bought");
    expect(by.SKIP.status).toBe("skipped");
    expect(by.SKIP.reasonCode).toBe("pacing_day");
    expect(by.SKIP.sentence).toContain("Not bought");
    expect(by.NONE.status).toBe("not_decided");
    expect(by.OLD.status).toBe("expired");
  });

  it("measures risk from the signal and distance from the live price", () => {
    const [row] = buildIdeas(
      [idea({ id: 1, symbol: "LIVE", signalClose: 100, initialStop: 95, livePrice: 90 })],
      [],
      [],
      [],
      [],
      "2026-11-10",
    );
    expect(row.riskPct).toBeCloseTo(0.05, 6);
    expect(row.distanceToStopPct).toBeCloseTo(((90 - 95) / 90) * 100, 2);
    expect(row.aboveStop).toBe(false);
  });

  it("counts later trading sessions, and stays null when the tape has not got there", () => {
    const bars: IdeaBar[] = [
      { symbol: "GAP", date: "2026-11-02", close: 100, low: 100 },
      { symbol: "GAP", date: "2026-11-03", close: 101, low: 100 },
      { symbol: "GAP", date: "2026-11-04", close: 102, low: 101 },
      { symbol: "GAP", date: "2026-11-05", close: 103, low: 102 },
      { symbol: "GAP", date: "2026-11-06", close: 104, low: 103 },
      { symbol: "GAP", date: "2026-11-09", close: 110, low: 108 },
    ];
    const [row] = buildIdeas(
      [idea({ id: 1, symbol: "GAP", scanDate: "2026-11-02", signalClose: 100, initialStop: 90 })],
      [],
      [],
      [],
      bars,
      "2026-11-12",
    );
    expect(row.after5).toBe(10);
    expect(row.after10).toBeNull();
    expect(row.after20).toBeNull();
    expect(row.maxUp).toBe(10);
  });

  it("calls a skip dodged, missed, or a buy won", () => {
    const down = closes("DOWN", "2026-11-03", [100, 99, 98, 98, 98, 97, 97, 97, 96, 96, 96]);
    const up = closes("UP", "2026-11-03", Array.from({ length: 11 }, (_, i) => (i === 0 ? 100 : 106)), Array.from({ length: 11 }, () => 99));
    const broke = closes("BROKE", "2026-11-03", Array.from({ length: 11 }, (_, i) => (i === 0 ? 100 : i === 1 ? 99 : 106)), Array.from({ length: 11 }, (_, i) => (i === 1 ? 90 : 100)));
    const wonBars = closes("WON", "2026-11-03", [100]);
    const rows = [
      idea({ id: 1, symbol: "DOWN", scanDate: "2026-11-03", signalClose: 100, initialStop: 90 }),
      idea({ id: 2, symbol: "UP", scanDate: "2026-11-03", signalClose: 100, initialStop: 95 }),
      idea({ id: 3, symbol: "BROKE", scanDate: "2026-11-03", signalClose: 100, initialStop: 95 }),
      idea({ id: 4, symbol: "WON", scanDate: "2026-11-03", signalClose: 100, initialStop: 95 }),
    ];
    const decisions: IdeaDecision[] = [
      { id: 1, ideaId: 1, tradeDate: "2026-11-04", outcome: "skipped", reasonCode: "pacing_day", sizing: null, positionId: null },
      { id: 2, ideaId: 2, tradeDate: "2026-11-04", outcome: "skipped", reasonCode: "pacing_day", sizing: null, positionId: null },
      { id: 3, ideaId: 3, tradeDate: "2026-11-04", outcome: "skipped", reasonCode: "pacing_day", sizing: null, positionId: null },
      { id: 4, ideaId: 4, tradeDate: "2026-11-04", outcome: "sent", reasonCode: "ranked", sizing: { qty: 1, limit: 100, stop: 95 }, positionId: 1 },
    ];
    const orders: IdeaOrder[] = [
      { id: 1, decisionId: 4, side: "BUY", status: "COMPLETE", qty: 1, filled: 1, avgPrice: 100 },
    ];
    const positions: IdeaPosition[] = [
      { id: 1, symbol: "WON", strategy: "ema", qty: 0, avgPrice: 100, openedOn: "2026-11-04", closed: true, realisedPnl: 10 },
    ];
    const built = buildIdeas(rows, decisions, orders, positions, [...down, ...up, ...broke, ...wonBars], "2026-11-20");
    const by = Object.fromEntries(built.map((row) => [row.symbol, row.verdict]));
    expect(by.DOWN).toBe("skipped_dodged");
    expect(by.UP).toBe("skipped_missed");
    expect(by.BROKE).toBe("skipped_dodged");
    expect(by.WON).toBe("bought_won");
  });

  it("keeps the 9 Nov book: MPHASIS and ZYDUSLIFE bought, FEDERALBNK and INDUSTOWER paced out", () => {
    const rows: IdeaRow[] = [
      {
        id: 6, scanDate: "2026-11-06", validFor: "2026-11-09", symbol: "MPHASIS", strategy: "ema", score: 1,
        signalClose: 2520, initialStop: 2485.09, sector: "Information Technology",
        raw: { rsi: "55.01", volume_ratio: "6.30", signal_strength: "Strong" },
      },
      {
        id: 7, scanDate: "2026-11-06", validFor: "2026-11-09", symbol: "ZYDUSLIFE", strategy: "ema", score: 0.11217,
        signalClose: 1197.9, initialStop: 1175.4, sector: "Healthcare",
        raw: { rsi: "56.37", volume_ratio: "1.07", signal_strength: "Moderate" },
        livePrice: 1216,
      },
      {
        id: 8, scanDate: "2026-11-06", validFor: "2026-11-09", symbol: "FEDERALBNK", strategy: "ema", score: 0.088507,
        signalClose: 340.1, initialStop: 338.23, sector: "Financial Services",
        raw: { rsi: "52.46", volume_ratio: "0.94" },
      },
      {
        id: 9, scanDate: "2026-11-06", validFor: "2026-11-09", symbol: "INDUSTOWER", strategy: "ema", score: 0,
        signalClose: 383.1, initialStop: 382.15, sector: "Telecommunication",
        raw: { rsi: "51.27", volume_ratio: "0.40" },
      },
    ];
    const decisions: IdeaDecision[] = [
      { id: 41, ideaId: 6, tradeDate: "2026-11-09", outcome: "sent", reasonCode: "ranked", sizing: { qty: 7, limit: 2532.6, stop: 2485.09, notional: 17728.2 }, positionId: null },
      { id: 42, ideaId: 7, tradeDate: "2026-11-09", outcome: "sent", reasonCode: "ranked", sizing: { qty: 16, limit: 1203.9, stop: 1175.4, notional: 19262.4 }, positionId: null },
      { id: 43, ideaId: 8, tradeDate: "2026-11-09", outcome: "skipped", reasonCode: "pacing_strategy", limitCount: 2, sizing: null, positionId: null },
      { id: 44, ideaId: 9, tradeDate: "2026-11-09", outcome: "skipped", reasonCode: "pacing_day", limitCount: 2, sizing: null, positionId: null },
    ];
    const orders: IdeaOrder[] = [
      { id: 1, decisionId: 41, side: "BUY", status: "COMPLETE", qty: 7, filled: 7, avgPrice: 2438.5 },
      { id: 2, decisionId: 42, side: "BUY", status: "COMPLETE", qty: 16, filled: 16, avgPrice: 1203.9 },
      { id: 3, decisionId: 41, side: "SELL", status: "COMPLETE", qty: 7, filled: 7, avgPrice: 2444.8 },
    ];
    const positions: IdeaPosition[] = [
      { id: 1, symbol: "MPHASIS", strategy: "ema", qty: 0, avgPrice: 2438.5, openedOn: "2026-11-09", closed: true, realisedPnl: 33.14 },
      { id: 2, symbol: "ZYDUSLIFE", strategy: "ema", qty: 16, avgPrice: 1203.9, openedOn: "2026-11-09", closed: false, realisedPnl: 0 },
    ];
    const built = buildIdeas(rows, decisions, orders, positions, [], "2026-11-12");
    const by = Object.fromEntries(built.map((row) => [row.symbol, row]));
    expect(by.MPHASIS.status).toBe("bought");
    expect(by.MPHASIS.positionId).toBe(1);
    expect(by.MPHASIS.verdict).toBe("bought_won");
    expect(by.MPHASIS.pnl).toBe(33.14);
    expect(by.MPHASIS.fillPrice).toBe(2438.5);
    expect(by.MPHASIS.facts.map((fact) => fact.label)).toEqual(["RSI", "Vol", "Strength"]);
    expect(by.MPHASIS.facts.some((fact) => fact.label === "RS")).toBe(false);
    expect(by.MPHASIS.held).toBe(false);
    expect(by.ZYDUSLIFE.status).toBe("bought");
    expect(by.ZYDUSLIFE.positionOpen).toBe(true);
    expect(by.ZYDUSLIFE.pnl).toBeCloseTo((1216 - 1203.9) * 16, 2);
    expect(by.ZYDUSLIFE.verdict).toBe("bought_won");
    expect(by.ZYDUSLIFE.sizing).toMatchObject({ qty: 16, notional: 19262.4, risk: 456 });
    expect(by.FEDERALBNK.status).toBe("skipped");
    expect(by.FEDERALBNK.reasonCode).toBe("pacing_strategy");
    expect(by.FEDERALBNK.action).toBe("Skipped · pacing");
    expect(by.INDUSTOWER.status).toBe("skipped");
    expect(by.INDUSTOWER.reasonCode).toBe("pacing_day");
    expect(by.INDUSTOWER.action).toBe("Skipped · pacing");
    expect(by.ZYDUSLIFE.held).toBe(true);
  });

  it("judges a skip from the stop, the GTT, and the high and low", () => {
    const federal = Array.from({ length: 4 }, (_, i) => ({
      symbol: "FEDERALBNK",
      date: `2026-11-${String(10 + i).padStart(2, "0")}`,
      close: 101,
      high: i === 1 ? 105.3 : 102,
      low: 99.5,
    }));
    const tcs = Array.from({ length: 4 }, (_, i) => ({
      symbol: "TCS",
      date: `2026-11-${String(10 + i).padStart(2, "0")}`,
      close: 99.5,
      high: 100.4,
      low: i === 1 ? 98.8 : 99.2,
    }));
    const early = Array.from({ length: 2 }, (_, i) => ({
      symbol: "EARLY",
      date: `2026-11-${String(10 + i).padStart(2, "0")}`,
      close: 106,
      high: 106,
      low: 99,
    }));
    const rows = [
      idea({ id: 1, symbol: "FEDERALBNK", scanDate: "2026-11-09", signalClose: 100, initialStop: 98 }),
      idea({ id: 2, symbol: "TCS", scanDate: "2026-11-09", signalClose: 100, initialStop: 98.5 }),
      idea({ id: 3, symbol: "EARLY", scanDate: "2026-11-09", signalClose: 100, initialStop: 95 }),
    ];
    const decisions: IdeaDecision[] = rows.map((row) => ({
      id: row.id, ideaId: row.id, tradeDate: "2026-11-10", outcome: "skipped", reasonCode: "pacing_day", sizing: null, positionId: null,
    }));
    const built = buildIdeas(rows, decisions, [], [], [...federal, ...tcs, ...early], "2026-11-20");
    const by = Object.fromEntries(built.map((row) => [row.symbol, row]));
    expect(by.FEDERALBNK.verdict).toBe("skipped_missed");
    expect(by.FEDERALBNK.maxUp).toBeCloseTo(5.3, 2);
    expect(by.FEDERALBNK.maxDown).toBeCloseTo(-0.5, 2);
    expect(by.TCS.verdict).toBe("skipped_neutral");
    expect(by.TCS.maxDown).toBeCloseTo(-1.2, 2);
    expect(by.EARLY.verdict).toBe("too_early");
    expect(stopBroken({ symbol: "X", date: "2026-11-10", close: 100, low: 96 }, 100, 0.03)).toBe(true);
    expect(stopBroken({ symbol: "X", date: "2026-11-10", close: 100, low: 96 }, 100, 0.05)).toBe(false);
    expect(stopBroken({ symbol: "X", date: "2026-11-10", close: 99, low: 98 }, 100, 0.03)).toBe(true);
  });

  it("names the skip and hides a quote from before the open", () => {
    expect(actionLabel("skipped", "no_funds")).toBe("Skipped · no cash");
    expect(actionLabel("skipped", "too_close_to_stop")).toBe("Skipped · near stop");
    expect(actionLabel("skipped", "entry_below_stop")).toBe("Skipped · near stop");
    expect(actionLabel("skipped", "held")).toBe("Skipped · already held");
    expect(actionLabel("skipped", "sector_cap")).toBe("Skipped · sector full");
    expect(actionLabel("skipped", "ranked", true)).toBe("Cancelled");
    expect(scannerFacts({ rsi: 55, volume_ratio: 1.2 }, "ema").map((fact) => fact.label)).toEqual(["RSI", "Vol"]);
    expect(scannerFacts({ rs: 4.2 }, "rs").some((fact) => fact.label === "RS")).toBe(true);
    const [row] = buildIdeas(
      [idea({ id: 1, symbol: "TCS", signalClose: 100, initialStop: 95 })],
      [{ id: 1, ideaId: 1, tradeDate: "2026-11-13", outcome: "skipped", reasonCode: "held", sizing: null, positionId: null }],
      [],
      [],
      [],
      "2026-11-13",
    );
    expect(row.held).toBe(true);
    expect(row.action).toBe("Skipped · already held");
    const morning = new Date("2026-11-13T02:30:00.000Z");
    const session = new Date("2026-11-13T04:30:00.000Z");
    expect(quoteState(morning, "2026-11-13T04:00:00.000Z", "2026-11-13")).toBe("pre-open");
    expect(quoteState(session, "2026-11-12T10:00:00.000Z", "2026-11-13")).toBe("pre-open");
    expect(quoteState(session, "2026-11-13T04:00:00.000Z", "2026-11-13")).toBe("live");
    const [stale] = applyLivePrices([row], { TCS: { price: 101, asOf: "2026-11-12T10:00:00.000Z" } }, { now: session, today: "2026-11-13" });
    expect(stale.quote).toBe("pre-open");
    expect(stale.livePrice).toBeNull();
    expect(stale.distanceToStopPct).toBeNull();
    const [fresh] = applyLivePrices([row], { TCS: { price: 101, asOf: "2026-11-13T04:00:00.000Z" } }, { now: session, today: "2026-11-13" });
    expect(fresh.quote).toBe("live");
    expect(fresh.livePrice).toBe(101);
  });
});
