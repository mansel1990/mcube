import { describe, expect, it } from "vitest";
import { estimateCharges } from "./charges";
import { decryptToken, encryptToken } from "./crypto";
import { isTradingDay, nextTradingDay, previousTradingDay, todayIst } from "./calendar";
import {
  EXIT_EMA,
  EXIT_RS,
  adjustPeak,
  applyCashflow,
  atr,
  breakerTripped,
  canApproveDecision,
  clampSellQty,
  coversDecision,
  emaLast,
  entryBelowEma,
  fillDeltaPrice,
  gttExitPlan,
  gttLastPrice,
  gttPrices,
  gttQtyAction,
  haltReasons,
  heldOutsideSystem,
  ideaRejectReason,
  initialStop,
  isChasing,
  isExcluded,
  kiteCashGap,
  limitCrossed,
  limitPrice,
  makeTag,
  mergeDayDecisions,
  nextTrendStop,
  preflightSessionPlan,
  rejectIsKnown,
  priceSkip,
  pushUserIds,
  rankIdeas,
  rowInBook,
  rawSignalScore,
  reconcile,
  sessionIsHalted,
  sizeOrder,
  slotAvailable,
  spendableCash,
  systemCash,
  usesDailySlot,
  type Bar,
  type HaltInput,
  type IdeaCheck,
} from "./rules";

const FUND = 80_000;

function flatBars(n: number, close: number, range = 10): Bar[] {
  return Array.from({ length: n }, () => ({ high: close + range / 2, low: close - range / 2, close, volume: 1000 }));
}

const clear: HaltInput = {
  stateReadable: true,
  ledgerReadable: true,
  eodPresent: true,
  kiteSession: true,
  holdingsReadable: true,
  marginsReadable: true,
  bhavcopyPresent: true,
  unknownReject: false,
};

const openIdea: IdeaCheck = {
  heldBySystem: false,
  heldBySanjay: false,
  excluded: false,
  sectorCount: 0,
  maxPerSector: 2,
  historyDays: 40,
  badData: false,
  chasing: false,
  belowMinAfterSizing: false,
  entryBelowStop: false,
};

describe("sizing table (fund ₹80,000, risk ₹800, cap ₹20,000)", () => {
  const rows: [number, number, number, number | null, string][] = [
    [2065, 1978, 50_000, 9, "ok"],
    [3718, 3480, 50_000, 3, "ok"],
    [1952, 1915, 50_000, 10, "ok"],
    [2065, 1978, 10_708, 5, "ok"],
    [21_500, 20_600, 50_000, null, "too_expensive"],
    [2065, 1978, 7_000, null, "no_funds"],
  ];

  it.each(rows)("entry %s stop %s spendable %s", (entry, stop, spendable, qty, reason) => {
    const result = sizeOrder({ fund: FUND, entry, stop, spendable });
    expect(result.reason).toBe(reason);
    if (qty == null) expect(result.qty).toBe(0);
    else expect(result.qty).toBe(qty);
  });

  it("writes the audit sum for the ₹80,740 example", () => {
    const result = sizeOrder({ fund: 80_740, entry: 2065, stop: 1978, spendable: 29_000 });
    expect(result.qty).toBe(9);
    expect(result.text).toBe("risk ₹807 ÷ (2065−1978) = 9 · cap 9 · cash 14 → 9");
  });

  it("calls a risk-limited share below the minimum too small", () => {
    const result = sizeOrder({ fund: FUND, entry: 9_000, stop: 1_000, spendable: 50_000 });
    expect(result.qtyRisk).toBe(0);
    expect(result.reason).toBe("too_small");
  });
});

describe("cash", () => {
  it("spendable is the lower of system cash and Kite cash, minus the reserve", () => {
    expect(systemCash(80_000, 50_000, 2_000)).toBe(28_000);
    expect(spendableCash(28_000, 10_000, 500)).toBe(9_500);
    expect(kiteCashGap(28_000, 10_000)).toBe(18_000);
  });
});

describe("daily limits, exclusion, ownership", () => {
  it("counts every sent order once and never counts a GTT exit", () => {
    expect(usesDailySlot(false)).toBe(true);
    expect(usesDailySlot(true)).toBe(false);
    expect(slotAvailable(3, 4, false)).toBe(true);
    expect(slotAvailable(4, 4, false)).toBe(false);
    expect(slotAvailable(4, 4, true)).toBe(true);
  });

  it("excludes NIFTYBEES and every ETF", () => {
    expect(isExcluded("NIFTYBEES", ["NIFTYBEES"], false)).toBe(true);
    expect(isExcluded("niftybees", ["NIFTYBEES"], false)).toBe(true);
    expect(isExcluded("RELIANCE", ["NIFTYBEES"], false)).toBe(false);
    expect(isExcluded("ANYETF", [], true)).toBe(true);
  });

  it("never sells more than the system quantity and ignores Sanjay's extra shares", () => {
    expect(clampSellQty(12, 10)).toBe(10);
    expect(clampSellQty(4, 0)).toBe(0);
    expect(heldOutsideSystem(15, 10)).toBe(true);
    expect(heldOutsideSystem(10, 10)).toBe(false);
    expect(reconcile(10, 10)).toBe("ok");
    expect(reconcile(10, 7)).toBe("missing");
    expect(reconcile(10, 15)).toBe("extra_ignored");
  });
});

describe("breaker with a deposit", () => {
  it("trips at 25% and a deposit moves the peak by the same amount", () => {
    expect(breakerTripped(60_000, 80_000)).toBe(true);
    expect(breakerTripped(60_001, 80_000)).toBe(false);
    expect(adjustPeak(80_000, 10_000)).toBe(90_000);
    expect(adjustPeak(90_000, -5_000)).toBe(85_000);
  });

  it("stays paused after a deposit until Sanjay resumes", () => {
    const tripped = applyCashflow(
      { peak: 80_000, value: 60_000, status: "paused_by_breaker" },
      10_000
    );
    expect(tripped.peak).toBe(90_000);
    expect(tripped.value).toBe(70_000);
    expect(tripped.tripped).toBe(false);
    expect(tripped.status).toBe("paused_by_breaker");
  });

  it("does not treat a withdrawal as a trading loss", () => {
    const next = applyCashflow({ peak: 80_000, value: 80_000, status: "active" }, -20_000);
    expect(next.peak).toBe(60_000);
    expect(next.value).toBe(60_000);
    expect(next.tripped).toBe(false);
    expect(next.status).toBe("active");
  });
});

describe("chasing and do-nothing", () => {
  it("skips a live price more than 3% above the signal close", () => {
    expect(isChasing(103, 100)).toBe(false);
    expect(isChasing(103.01, 100)).toBe(true);
  });

  it.each([
    ["ledger", { ledgerReadable: false }, "ledger_failed"],
    ["state", { stateReadable: false }, "ledger_failed"],
    ["missing eod", { eodPresent: false }, "eod_missing"],
    ["no session", { kiteSession: false }, "no_kite_session"],
    ["holdings", { holdingsReadable: false }, "kite_unreadable"],
    ["margins", { marginsReadable: false }, "kite_unreadable"],
    ["bhavcopy", { bhavcopyPresent: false }, "bhavcopy_missing"],
    ["unknown reject", { unknownReject: true }, "order_rejected"],
  ] as const)("halts on %s", (_name, patch, reason) => {
    const reasons = haltReasons({ ...clear, ...patch });
    expect(reasons).toContain(reason);
    expect(sessionIsHalted({ ...clear, ...patch })).toBe(true);
  });

  it("does not halt the day for one reconciliation mismatch", () => {
    expect(sessionIsHalted(clear)).toBe(false);
    expect(reconcile(4, 0)).toBe("missing");
  });

  it("skips one symbol for bad prices and leaves the others alone", () => {
    expect(priceSkip({ yahooPrevClose: 103, bhavClose: 100, live: 100, lastClose: 100, volume: 10, corporateAction: false })).toBe("yahoo_mismatch");
    expect(priceSkip({ yahooPrevClose: 101, bhavClose: 100, live: 130, lastClose: 100, volume: 10, corporateAction: false })).toBe("price_jump");
    expect(priceSkip({ yahooPrevClose: 101, bhavClose: 100, live: 130, lastClose: 100, volume: 10, corporateAction: true })).toBeNull();
    expect(priceSkip({ yahooPrevClose: 100, bhavClose: 100, live: 100, lastClose: 100, volume: 0, corporateAction: false })).toBe("zero_volume");
    expect(haltReasons(clear)).toEqual([]);
  });
});

describe("idea filters and rank", () => {
  it("rejects each filter in section 5.5", () => {
    expect(ideaRejectReason({ ...openIdea, heldBySystem: true })).toBe("held");
    expect(ideaRejectReason({ ...openIdea, heldBySanjay: true })).toBe("held");
    expect(ideaRejectReason({ ...openIdea, excluded: true })).toBe("excluded");
    expect(ideaRejectReason({ ...openIdea, sectorCount: 2 })).toBe("sector_cap");
    expect(ideaRejectReason({ ...openIdea, historyDays: 19 })).toBe("short_history");
    expect(ideaRejectReason({ ...openIdea, badData: true })).toBe("bad_data");
    expect(ideaRejectReason({ ...openIdea, chasing: true })).toBe("chasing");
    expect(ideaRejectReason({ ...openIdea, entryBelowStop: true })).toBe("entry_below_stop");
    expect(ideaRejectReason({ ...openIdea, belowMinAfterSizing: true })).toBe("too_small");
    expect(ideaRejectReason(openIdea)).toBeNull();
  });

  it("puts RS ahead of EMA on a tied score, then uses live return after 20 trades each", () => {
    const ideas = [
      { symbol: "AAA", strategy: "ema" as const, score: 2 },
      { symbol: "BBB", strategy: "rs" as const, score: 2 },
    ];
    expect(rankIdeas(ideas).map((idea) => idea.symbol)).toEqual(["BBB", "AAA"]);
    const live = rankIdeas(ideas, { rsTrades: 20, emaTrades: 20, rsPerTrade: 0.2, emaPerTrade: 1.6 });
    expect(live.map((idea) => idea.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("normalises inside each strategy", () => {
    const ranked = rankIdeas([
      { symbol: "LOW", strategy: "rs", score: 1 },
      { symbol: "HIGH", strategy: "rs", score: 3 },
    ]);
    expect(ranked[0]).toMatchObject({ symbol: "HIGH", norm: 1 });
    expect(ranked[1].norm).toBe(0);
  });

  it("builds a raw score from strength, rsi and volume", () => {
    const strong = rawSignalScore({ signal_strength: "Strong", rsi: 50, volume_ratio: 2 });
    const weak = rawSignalScore({ signal_strength: "Weak", rsi: 50, volume_ratio: 2 });
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("exits", () => {
  it("sizes the RS initial stop as signal close minus 2.5 ATR", () => {
    const bars = flatBars(20, 100, 10);
    const stop = initialStop("rs", bars, 100, EXIT_RS);
    expect(stop).toBeCloseTo(75, 6);
  });

  it("ratchets the chandelier stop up and sells a close underneath it", () => {
    const bars = flatBars(30, 100, 10);
    bars.push({ high: 130, low: 120, close: 128, volume: 1000 });
    const first = nextTrendStop({ strategy: "rs", bars, entryIndex: 10, previousStop: 70, params: EXIT_RS });
    expect(first).not.toBeNull();
    expect(first!.stop).toBeGreaterThan(70);
    const held = nextTrendStop({
      strategy: "rs",
      bars: bars.slice(0, -1),
      entryIndex: 10,
      previousStop: first!.stop,
      params: EXIT_RS,
    });
    expect(held!.stop).toBe(first!.stop);
    const broken = [...bars.slice(0, -1), { high: 80, low: 60, close: first!.stop - 1, volume: 1000 }];
    const sold = nextTrendStop({ strategy: "rs", bars: broken, entryIndex: 10, previousStop: first!.stop, params: EXIT_RS });
    expect(sold!.closeBelow).toBe(true);
    expect(sold!.stop).toBeGreaterThanOrEqual(first!.stop);
  });

  it("uses the 20-day EMA for EMA and skips an entry below it", () => {
    const bars = flatBars(25, 100, 2);
    const ema = emaLast(bars.map((bar) => bar.close), 20);
    expect(ema).toBeCloseTo(100, 5);
    const stop = initialStop("ema", bars, 100, EXIT_EMA);
    expect(stop).toBeCloseTo(100, 5);
    expect(entryBelowEma(limitPrice(99), stop!)).toBe(true);
    expect(entryBelowEma(limitPrice(100), stop!)).toBe(false);
    const dipped = [...bars, { high: 99, low: 90, close: 95, volume: 1000 }];
    const update = nextTrendStop({ strategy: "ema", bars: dipped, entryIndex: 5, previousStop: 100, params: EXIT_EMA });
    expect(update!.stop).toBe(100);
    expect(update!.closeBelow).toBe(true);
    const lifted = [...bars, { high: 140, low: 130, close: 135, volume: 1000 }];
    const higher = nextTrendStop({ strategy: "ema", bars: lifted, entryIndex: 5, previousStop: 100, params: EXIT_EMA });
    expect(higher!.stop).toBeGreaterThan(100);
  });

  it("uses a simple average of the last 14 true ranges", () => {
    const bars: Bar[] = [{ high: 10, low: 0, close: 10 }];
    for (let i = 1; i <= 15; i++) bars.push({ high: 10 + i, low: 10, close: 10 });
    const trs = bars.slice(1).map((bar, index) => Math.max(bar.high - bar.low, Math.abs(bar.high - bars[index].close), Math.abs(bar.low - bars[index].close)));
    const last = trs.slice(-14);
    const mean = last.reduce((sum, n) => sum + n, 0) / 14;
    expect(atr(bars, 14)).toBeCloseTo(mean, 8);
    expect(mean).toBeCloseTo(8.5, 8);
  });

  it("places the GTT 3% under the stop and the limit 0.5% under the trigger", () => {
    expect(gttPrices(1978, 0.03)).toEqual({ trigger: 1918.65, limit: 1909.05 });
  });

  it("builds an alphanumeric tag of at most 20 characters", () => {
    expect(makeTag("BUY", "7F3K2")).toBe("mliveB7F3K2");
    expect(makeTag("SELL", "7F3K2").length).toBeLessThanOrEqual(20);
    expect(() => makeTag("BUY", "bad tag")).toThrow();
  });
});

describe("charges and token crypto", () => {
  it("charges a sell more than a buy because of the DP fee", () => {
    const buy = estimateCharges("BUY", 15_000);
    const sell = estimateCharges("SELL", 15_000);
    expect(sell.dp).toBe(15.93);
    expect(sell.total).toBeGreaterThan(buy.total);
    expect(buy.stamp).toBeGreaterThan(0);
    expect(sell.stamp).toBe(0);
  });

  it("round-trips a Kite token", () => {
    const key = "test-passphrase-for-mlive";
    const blob = encryptToken("access-token-value", key);
    expect(blob).not.toContain("access-token-value");
    expect(decryptToken(blob, key)).toBe("access-token-value");
    expect(() => decryptToken(blob, "other-passphrase")).toThrow();
  });
});

describe("go-live session rules", () => {
  const holidays = new Set(["2026-11-10"]);

  it("dates a 19:45 sell for the next session, which the morning sells job reads", () => {
    const evening = new Date("2026-11-05T19:45:00+05:30");
    const tradeDate = nextTradingDay(todayIst(evening), holidays);
    const morning = new Date("2026-11-06T09:20:00+05:30");
    expect(tradeDate).toBe("2026-11-06");
    expect(todayIst(morning)).toBe(tradeDate);
    expect(nextTradingDay(todayIst(new Date("2026-11-06T19:45:00+05:30")), holidays)).toBe("2026-11-09");
  });

  it("waits for a Kite session before 09:10 and halts only on the final run", () => {
    const waiting = preflightSessionPlan({ minute: 8 * 60 + 40, reasons: ["no_kite_session", "kite_unreadable"], status: "active", haltReason: null });
    expect(waiting).toMatchObject({ halt: false, alert: "wait" });
    const final = preflightSessionPlan({ minute: 9 * 60 + 10, reasons: ["no_kite_session"], status: "active", haltReason: null });
    expect(final).toMatchObject({ halt: true, haltReason: "no_kite_session" });
    const cleared = preflightSessionPlan({ minute: 9 * 60 + 5, reasons: [], status: "halted_today", haltReason: "no_kite_session" });
    expect(cleared).toMatchObject({ halt: false, clearHalt: true });
    const other = preflightSessionPlan({ minute: 8 * 60 + 40, reasons: ["bhavcopy_missing", "no_kite_session"], status: "active", haltReason: null });
    expect(other.halt).toBe(true);
    expect(other.haltReason).toContain("bhavcopy_missing");
  });

  it("keeps one decision per idea when preflight runs twice", () => {
    const first = [
      { ideaId: 1, positionId: null, side: "BUY" as const, outcome: "proposed", symbol: "INFY" },
      { ideaId: 2, positionId: null, side: "BUY" as const, outcome: "skipped", symbol: "TCS" },
    ];
    const second = [
      { ideaId: 1, positionId: null, side: "BUY" as const, outcome: "proposed", symbol: "INFY" },
      { ideaId: 2, positionId: null, side: "BUY" as const, outcome: "proposed", symbol: "TCS" },
    ];
    const once = mergeDayDecisions([], first);
    const twice = mergeDayDecisions(once, second);
    expect(twice).toHaveLength(2);
    expect(twice.map((row) => row.ideaId).sort()).toEqual([1, 2]);
    const kept = mergeDayDecisions(
      [{ ideaId: 1, positionId: null, side: "BUY", outcome: "approved", symbol: "INFY" }],
      [{ ideaId: 1, positionId: null, side: "BUY", outcome: "proposed", symbol: "INFY" }]
    );
    expect(kept[0].outcome).toBe("approved");
  });

  it("treats an existing order or an open buy in the same symbol as already sent", () => {
    expect(coversDecision(true, false)).toBe(true);
    expect(coversDecision(false, true)).toBe(true);
    expect(coversDecision(false, false)).toBe(false);
  });

  it("cancels a GTT after a full sell and shrinks it after a partial sell", () => {
    expect(gttQtyAction(0, 10)).toBe("cancel");
    expect(gttQtyAction(4, 10)).toBe("resize");
    expect(gttQtyAction(10, 10)).toBe("keep");
  });

  it("tracks a triggered GTT by its child order instead of closing the position", () => {
    expect(gttExitPlan({ status: "active" })).toEqual({ action: "ignore" });
    expect(gttExitPlan({ status: "triggered", orders: [{ result: { order_result: { order_id: "100", status: "success", rejection_reason: "" } } }] })).toEqual({
      action: "track",
      orderId: "100",
    });
    expect(gttExitPlan({ status: "triggered", orders: [] }).action).toBe("problem");
    expect(gttExitPlan({ status: "triggered", orders: [{ result: { order_result: { order_id: "100", status: "rejected", rejection_reason: "circuit limit" } } }] }).action).toBe("problem");
  });

  it("prices a partial buy from the change in the cumulative average and keeps the order open", () => {
    expect(fillDeltaPrice(0, 0, 10, 100)).toBe(100);
    expect(fillDeltaPrice(10, 100, 15, 102)).toBeCloseTo(106, 8);
    expect(limitCrossed("BUY", 99, 100)).toBe(true);
    expect(limitCrossed("BUY", 101, 100)).toBe(false);
    expect(limitCrossed("SELL", 101, 100)).toBe(true);
  });

  it("halts on an unknown reject and lets the known Kite messages through", () => {
    expect(rejectIsKnown("Insufficient funds in your account")).toBe(true);
    expect(rejectIsKnown("Order price is outside the circuit limit")).toBe(true);
    expect(rejectIsKnown("Tick size is 0.05")).toBe(true);
    expect(rejectIsKnown("Quantity freeze for this instrument")).toBe(true);
    expect(rejectIsKnown("Holdings not available")).toBe(true);
    expect(rejectIsKnown("RMS rejected the order")).toBe(false);
    expect(rejectIsKnown("price")).toBe(false);
  });
});

describe("dry book, push ids, and GTT last price", () => {
  it("includes dry rows while dry run is on and hides them when it is off", () => {
    expect(rowInBook(true, true)).toBe(true);
    expect(rowInBook(false, true)).toBe(true);
    expect(rowInBook(true, false)).toBe(false);
    expect(rowInBook(false, false)).toBe(true);
  });

  it("lets Approve and Skip act on a dry decision for this session or the next", () => {
    expect(canApproveDecision({ outcome: "proposed", tradeDate: "2026-11-06", today: "2026-11-06", next: "2026-11-09", dryRun: true })).toBe(true);
    expect(canApproveDecision({ outcome: "proposed", tradeDate: "2026-11-09", today: "2026-11-06", next: "2026-11-09", dryRun: true })).toBe(true);
    expect(canApproveDecision({ outcome: "sent", tradeDate: "2026-11-06", today: "2026-11-06", next: "2026-11-09", dryRun: true })).toBe(false);
    expect(canApproveDecision({ outcome: "proposed", tradeDate: "2026-11-05", today: "2026-11-06", next: "2026-11-09", dryRun: true })).toBe(false);
  });

  it("uses the Mongo _id when the user document has no id field", () => {
    const oid = { toString: () => "69abc" };
    expect(pushUserIds({ _id: oid })).toEqual(["69abc"]);
    expect(pushUserIds({ id: "session-id", _id: oid })).toEqual(["session-id", "69abc"]);
    expect(pushUserIds(null)).toEqual([]);
  });

  it("prices a GTT from the live quote, then the last close, then the average", () => {
    expect(gttLastPrice(2065, 2000, 1900)).toBe(2065);
    expect(gttLastPrice(null, 2000, 1900)).toBe(2000);
    expect(gttLastPrice(0, null, 1900)).toBe(1900);
  });
});

describe("trading calendar", () => {
  const holidays = new Set(["2026-11-10", "2026-11-24"]);

  it("skips weekends and seeded holidays", () => {
    expect(isTradingDay("2026-11-06", holidays)).toBe(true);
    expect(isTradingDay("2026-11-07", holidays)).toBe(false);
    expect(isTradingDay("2026-11-10", holidays)).toBe(false);
    expect(nextTradingDay("2026-11-06", holidays)).toBe("2026-11-09");
    expect(previousTradingDay("2026-11-11", holidays)).toBe("2026-11-09");
  });
});
