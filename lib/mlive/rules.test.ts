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
  alertBody,
  alertLabel,
  auditInView,
  auditLabel,
  canApproveDecision,
  clampSellQty,
  alertClearedWith,
  collapseAlerts,
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
  actionsForEngineGroup,
  collapseAuditRows,
  decisionSentence,
  deployBaseline,
  engineGroup,
  engineSpendable,
  groupAuditByDay,
  ledgerDay,
  isBoughtOrSold,
  kiteAvailableCash,
  kiteCashGap,
  kiteCashMessage,
  limitCrossed,
  limitPrice,
  makeTag,
  mergeDayDecisions,
  nextTrendStop,
  preflightSessionPlan,
  rejectIsKnown,
  priceSkip,
  paceBuys,
  recheckDue,
  recheckEligible,
  recheckPlan,
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

describe("alerts and audit views", () => {
  it("folds the repeated Kite cash problem into one note", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      code: "kite_cash_low",
      level: "problem",
      message: "Kite cash is below system cash by ₹80000",
      seen: false,
    }));
    const grouped = collapseAlerts(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].repeat).toBe(7);
    expect(grouped[0].ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(alertLabel("problem")).toBe("Problem");
    expect(alertBody(grouped[0])).toMatch(/short of the book by ₹80000/);
    expect(alertBody(grouped[0])).not.toMatch(/below system cash/);
  });

  it("clears a morning check by code, and any other alert only for the same symbol", () => {
    const rows = [
      { id: 1, code: "kite_cash_low", symbol: null, message: "a", level: "problem", seen: false },
      { id: 2, code: "kite_cash_low", symbol: "HDFCBANK", message: "b", level: "problem", seen: false },
      { id: 3, code: "kite_login_needed", symbol: null, message: "login", level: "needs_you", seen: false },
      { id: 4, code: "kite_login_needed", symbol: null, message: "login again", level: "needs_you", seen: false },
      { id: 5, code: "approve_buy", symbol: "HDFCBANK", message: "buy hdfc", level: "needs_you", seen: false },
      { id: 6, code: "approve_buy", symbol: "HDFCBANK", message: "buy hdfc again", level: "needs_you", seen: false },
      { id: 7, code: "approve_buy", symbol: "INFY", message: "buy infy", level: "needs_you", seen: false },
      { id: 8, code: "approve_buy", symbol: null, message: "no stock", level: "needs_you", seen: false },
      { id: 9, code: "approve_buy", symbol: null, message: "no stock either", level: "needs_you", seen: false },
      { id: 10, code: "kite_cash_low", symbol: null, message: "already seen", level: "problem", seen: true },
    ];
    const grouped = collapseAlerts(rows);
    expect(grouped.map((group) => [group.code, group.ids])).toEqual([
      ["kite_cash_low", [1, 2]],
      ["kite_login_needed", [3, 4]],
      ["approve_buy", [5, 6]],
      ["approve_buy", [7]],
      ["approve_buy", [8]],
      ["approve_buy", [9]],
      ["kite_cash_low", [10]],
    ]);
    const clear = (id: number) => rows.filter((row) => !row.seen && alertClearedWith(rows.find((item) => item.id === id)!, row)).map((row) => row.id);
    expect(clear(2)).toEqual([1, 2]);
    expect(clear(4)).toEqual([3, 4]);
    expect(clear(6)).toEqual([5, 6]);
    expect(clear(7)).toEqual([7]);
    expect(clear(8)).toEqual([8]);
    expect(clear(9)).toEqual([9]);
  });

  it("reads the live Kite balance, then the cash balance", () => {
    expect(kiteAvailableCash({ available: { live_balance: 80500, cash: 80000 } })).toBe(80500);
    expect(kiteAvailableCash({ available: { cash: 80000 } })).toBe(80000);
    expect(kiteAvailableCash({ equity: { available: { live_balance: 1 } } })).toBe(1);
    expect(kiteAvailableCash({ equity: { available: { live_balance: 81234.5, cash: 100 } } })).toBe(81234.5);
    expect(kiteAvailableCash({ available: { live_balance: 0, cash: 80000 } })).toBe(0);
    expect(kiteAvailableCash(null)).toBeNull();
    expect(kiteAvailableCash({})).toBeNull();
    expect(kiteAvailableCash({ available: {} })).toBeNull();
    expect(kiteAvailableCash({ available: { live_balance: "80500" } })).toBeNull();
    expect(kiteAvailableCash({ available: { live_balance: Number.NaN } })).toBeNull();
  });

  it("names Kite cash and the trading limit", () => {
    expect(kiteCashMessage({ dryRun: true, system: 80000, kite: 0 })).toBe("Cash in Kite is ₹0, so no buys today.");
    expect(kiteCashMessage({ dryRun: false, system: 80000, kite: 20000 })).toBe("Cash in Kite is below the trading limit, so buys are smaller.");
    expect(engineSpendable(80000, 10000, 5000, 20000, 500)).toBe(19500);
    expect(engineSpendable(80000, 0, 0, 0, 500)).toBe(0);
  });

  it("splits the audit into buys, sells, the engine, and you", () => {
    const buy = { actor: "engine", action: "order.sent", side: "BUY" };
    const sell = { actor: "kite", action: "gtt.exit", side: "SELL" };
    const sized = { actor: "engine", action: "sizing", side: null };
    const you = { actor: "sanjay", action: "approval.approve", side: null };
    expect(auditInView(buy, "bought")).toBe(true);
    expect(auditInView(buy, "engine")).toBe(false);
    expect(auditInView(sell, "sold")).toBe(true);
    expect(auditInView(sell, "engine")).toBe(false);
    expect(auditInView(sized, "engine")).toBe(true);
    expect(auditInView(you, "you")).toBe(true);
    expect(auditInView(you, "engine")).toBe(false);
    expect(auditLabel("order.sent", "BUY")).toBe("Buy sent");
    expect(auditLabel("sizing", null)).toBe("Sized an order");
    expect(engineGroup("sizing")).toBe("sizing");
    expect(engineGroup("decision.skip")).toBe("skips");
    expect(engineGroup("stop.updated")).toBe("stops");
    expect(engineGroup("reconcile")).toBe("holdings");
    expect(engineGroup("run.preflight")).toBe("runs");
    expect(engineGroup("run.error")).toBe("problems");
    expect(engineGroup("order.cancelled")).toBe("other");
    expect(auditLabel("run.preflight", null)).toBe("Morning check");
    expect(actionsForEngineGroup("sizing")).toEqual(["sizing"]);
    expect(actionsForEngineGroup("all")).toBeNull();
  });

  it("folds the same engine line on the same day and keeps the days apart", () => {
    const rows = [
      { id: 3, ts: "2026-11-06T04:30:00.000Z", action: "sizing", symbol: "HDFCBANK", reason: "12 × ₹1628" },
      { id: 2, ts: "2026-11-06T03:30:00.000Z", action: "sizing", symbol: "HDFCBANK", reason: "12 × ₹1628" },
      { id: 4, ts: "2026-11-06T05:00:00.000Z", action: "sizing", symbol: "INFY", reason: "12 × ₹1628" },
      { id: 1, ts: "2026-11-05T10:00:00.000Z", action: "sizing", symbol: "HDFCBANK", reason: "12 × ₹1628" },
    ];
    const folded = collapseAuditRows(rows);
    expect(folded.map((row) => [row.symbol, row.repeat, row.id])).toEqual([
      ["INFY", 1, 4],
      ["HDFCBANK", 2, 3],
      ["HDFCBANK", 1, 1],
    ]);
    expect(groupAuditByDay(folded).map((group) => [group.day, group.rows.length])).toEqual([
      ["2026-11-06", 2],
      ["2026-11-05", 1],
    ]);
  });
});

describe("decision sentences, re-check, and bought-or-sold", () => {
  const ready = { outcome: "proposed", qty: 12, limit: 1628.1, stop: 1601.58 };

  it("writes a plain sentence for each skip and for a buy that is ready or done", () => {
    expect(decisionSentence({ outcome: "skipped", reasonCode: "no_funds", qty: 12, notional: 19537 })).toBe(
      "Not bought: no cash in Kite. Would be 12 shares ≈ ₹19,537."
    );
    expect(decisionSentence({ outcome: "skipped", reasonCode: "too_small", minOrderInr: 8000 })).toBe(
      "Not bought: under the ₹8,000 minimum."
    );
    expect(decisionSentence({ outcome: "skipped", reasonCode: "sector_cap", sector: "Banks", sectorCount: 2 })).toBe(
      "Not bought: already 2 stocks in Banks."
    );
    expect(decisionSentence({ outcome: "skipped", reasonCode: "held" })).toBe("Not bought: already held.");
    expect(decisionSentence({ outcome: "skipped", reasonCode: "excluded" })).toBe("Not bought: on the exclude list.");
    expect(decisionSentence({ outcome: "skipped", reasonCode: "chasing" })).toBe(
      "Not bought: the price has run too far above the signal."
    );
    expect(decisionSentence({ outcome: "skipped", reasonCode: "entry_below_stop" })).toBe(
      "Not bought: the entry is below the stop."
    );
    expect(decisionSentence({ outcome: "skipped", reasonCode: "bad_data" })).toBe("Not bought: the price data is not usable.");
    expect(decisionSentence({ outcome: "skipped", reasonCode: "limit" })).toBe("Not bought: the daily buy limit is already full.");
    expect(decisionSentence(ready)).toBe("Ready: 12 shares at ₹1,628.10, stop ₹1,601.58.");
    expect(decisionSentence({ ...ready, outcome: "approved" })).toBe("Ready: 12 shares at ₹1,628.10, stop ₹1,601.58.");
    expect(decisionSentence({ outcome: "sent", qty: 12, limit: 1628.1 })).toBe("Bought 12 at ₹1,628.10.");
    expect(decisionSentence({ outcome: "filled", qty: 12, limit: 1628.1 })).toBe("Bought 12 at ₹1,628.10.");
  });

  it("summarises a day instead of repeating the same skip", () => {
    const cash = (symbol: string) => ({
      symbol,
      outcome: "skipped",
      reasonCode: "no_funds",
      sentence: "Not bought: no cash in Kite.",
    });
    const day = ledgerDay([cash("HDFCBANK"), cash("INFY"), cash("TCS"), cash("WIPRO"), cash("RELIANCE")]);
    expect(day.label).toBe("No buys");
    expect(day.detail).toBe("5 names not bought: no cash in Kite.");
    expect(day.items).toHaveLength(5);
    expect(ledgerDay([{ symbol: "HDFCBANK", outcome: "skipped", reasonCode: "held", sentence: "Not bought: already held." }]).detail)
      .toBe("HDFCBANK not bought: already held.");
    const mixed = ledgerDay([
      { symbol: "TRENT", outcome: "sent", side: "BUY", sentence: "Bought 4 at ₹4,980.00." },
      cash("COFORGE"),
      { symbol: "LUPIN", outcome: "skipped", reasonCode: "sector_cap", sentence: "Not bought: already 2 stocks in Banks." },
    ]);
    expect(mixed.label).toBe("1 buy");
    expect(mixed.detail).toBe("TRENT: Bought 4 at ₹4,980.00. COFORGE not bought: no cash in Kite. LUPIN not bought: sector already full.");
    expect(ledgerDay([{ symbol: "LUPIN", outcome: "proposed", sentence: "Ready: 9 shares at ₹2,065.00." }]).label).toBe("Waiting for you");
    expect(ledgerDay([]).detail).toBe("Nothing was decided.");
  });

  it("turns a no-funds skip into a proposal when cash can size it, and leaves held and sector skips", () => {
    const limits = { buysSent: 0, maxBuys: 4, openPositions: 0, maxPositions: 6, sectorCount: 0, maxPerSector: 2 };
    const funded = sizeOrder({ fund: 80_000, entry: 100, stop: 90, spendable: 20_000 });
    const empty = sizeOrder({ fund: 80_000, entry: 100, stop: 90, spendable: 0 });
    expect(funded.reason).toBe("ok");
    expect(recheckPlan({ outcome: "skipped", reasonCode: "no_funds", sizingReason: funded.reason, ...limits })).toBe("propose");
    expect(recheckPlan({ outcome: "skipped", reasonCode: "no_funds", sizingReason: empty.reason, ...limits })).toBe("leave");
    expect(recheckPlan({ outcome: "skipped", reasonCode: "held", sizingReason: "ok", ...limits })).toBe("leave");
    expect(recheckPlan({ outcome: "skipped", reasonCode: "sector_cap", sizingReason: "ok", ...limits })).toBe("leave");
    expect(recheckDue(10 * 60 + 7, true)).toBe(true);
    expect(recheckDue(10 * 60 + 7, false)).toBe(false);
    expect(recheckDue(9 * 60 + 10, true)).toBe(false);
    expect(recheckEligible("skipped", "pacing_day")).toBe(true);
    expect(recheckEligible("skipped", "pacing_strategy")).toBe(true);
    expect(recheckEligible("skipped", "pacing_cash")).toBe(true);
    expect(recheckEligible("skipped", "strategy_full")).toBe(false);
    expect(recheckEligible("skipped", "held")).toBe(false);
  });

  it("paces new buys, and the stricter of the day pace and the send cap wins", () => {
    const limits = {
      maxNewBuysPerDay: 2,
      maxBuysPerDay: 4,
      maxBuysPerStrategyPerDay: 2,
      maxOpenPerStrategy: 4,
      maxDailyDeployPct: 0.5,
      engineCanUseNow: 100_000,
    };
    const book = {
      newBuys: 0,
      strategyBuys: { rs: 0, ema: 0 },
      openInStrategy: { rs: 0, ema: 0 },
      deployed: 0,
      baseline: null as number | null,
    };
    const ema = ["A", "B", "C", "D", "E"].map((symbol) => ({ symbol, strategy: "ema" as const, notional: 1_000 }));
    const five = paceBuys(ema, book, limits);
    expect(five.results.filter((row) => row.outcome === "proposed")).toHaveLength(2);
    expect(five.results.filter((row) => row.reason === "pacing_day")).toHaveLength(3);
    expect(five.book.baseline).toBe(100_000);
    expect(decisionSentence({ outcome: "skipped", reasonCode: "pacing_day", limitCount: 2 })).toBe(
      "Not bought: already 2 new buys today."
    );

    const freed = paceBuys([{ symbol: "F", strategy: "ema", notional: 1_000 }], { ...book, newBuys: 1 }, limits);
    expect(freed.results[0]?.outcome).toBe("proposed");
    const full = paceBuys([{ symbol: "G", strategy: "ema", notional: 1_000 }], { ...book, newBuys: 2 }, limits);
    expect(full.results[0]?.reason).toBe("pacing_day");

    const sendCap = paceBuys(ema, book, { ...limits, maxNewBuysPerDay: 5, maxBuysPerStrategyPerDay: 5 });
    expect(sendCap.results.filter((row) => row.outcome === "proposed")).toHaveLength(4);
    expect(sendCap.results[4]?.reason).toBe("limit");

    const strategy = paceBuys(
      [{ symbol: "H", strategy: "ema", notional: 1_000 }],
      { ...book, strategyBuys: { rs: 0, ema: 2 } },
      limits
    );
    expect(strategy.results[0]?.reason).toBe("pacing_strategy");
    expect(decisionSentence({ outcome: "skipped", reasonCode: "pacing_strategy", strategy: "ema", limitCount: 2 })).toBe(
      "Not bought: already 2 EMA buys today."
    );

    const open = paceBuys(
      [{ symbol: "I", strategy: "rs", notional: 1_000 }],
      { ...book, openInStrategy: { rs: 4, ema: 0 } },
      limits
    );
    expect(open.results[0]?.reason).toBe("strategy_full");
    expect(decisionSentence({ outcome: "skipped", reasonCode: "strategy_full", strategy: "rs", limitCount: 4 })).toBe(
      "Not bought: already 4 RS positions open."
    );

    const cash = paceBuys(
      [
        { symbol: "J", strategy: "ema", notional: 40_000 },
        { symbol: "K", strategy: "rs", notional: 20_000 },
      ],
      book,
      limits
    );
    expect(cash.results.map((row) => row.reason)).toEqual(["ok", "pacing_cash"]);
    expect(cash.book.deployed).toBe(40_000);
    expect(decisionSentence({ outcome: "skipped", reasonCode: "pacing_cash" })).toBe("Not bought: today's buy budget is used.");
  });

  it("drops a zero morning baseline once Kite cash arrives, and never lowers a real one", () => {
    const engineNow = engineSpendable(80_000, 0, 0, 80_500, 500);
    expect(engineNow).toBe(79_500);
    expect(deployBaseline(0, 0, 0)).toBeNull();
    expect(deployBaseline(null, 0, 0)).toBeNull();
    expect(deployBaseline(0, 0, engineNow)).toBe(79_500);
    expect(deployBaseline(10_000, 0, engineNow)).toBe(79_500);
    expect(deployBaseline(90_000, 0, engineNow)).toBe(90_000);

    const cap = engineNow * 0.5;
    expect(Math.round(cap)).toBe(39_750);
    const limits = {
      maxNewBuysPerDay: 2,
      maxBuysPerDay: 4,
      maxBuysPerStrategyPerDay: 2,
      maxOpenPerStrategy: 4,
      maxDailyDeployPct: 0.5,
      engineCanUseNow: engineNow,
    };
    const book = {
      newBuys: 0,
      strategyBuys: { rs: 0, ema: 0 },
      openInStrategy: { rs: 0, ema: 0 },
      deployed: 0,
      baseline: 0 as number | null,
    };
    const lupin = sizeOrder({ fund: 80_000, entry: 500, stop: 470, spendable: engineNow });
    const trent = sizeOrder({ fund: 80_000, entry: 480, stop: 450, spendable: engineNow });
    expect(lupin.reason).toBe("ok");
    expect(trent.reason).toBe("ok");
    expect(lupin.notional + trent.notional).toBeLessThanOrEqual(cap);
    const ideas = [
      { symbol: "LUPIN", strategy: "ema" as const, notional: lupin.notional },
      { symbol: "TRENT", strategy: "rs" as const, notional: trent.notional },
    ];
    let state = book;
    const reasons: string[] = [];
    for (const idea of ideas) {
      const step = paceBuys([idea], state, limits);
      state = step.book;
      reasons.push(step.results[0]?.reason ?? "");
      expect(recheckPlan({
        outcome: "skipped",
        reasonCode: "pacing_cash",
        sizingReason: "ok",
        buysSent: 0,
        maxBuys: 4,
        openPositions: 0,
        maxPositions: 6,
        sectorCount: 0,
        maxPerSector: 2,
      })).toBe("propose");
    }
    expect(reasons).toEqual(["ok", "ok"]);
    expect(state.baseline).toBe(79_500);
    expect(paceBuys([], { ...book, baseline: null }, limits).book.baseline).toBeNull();
  });

  it("keeps skipped decisions out of what was bought and sold", () => {
    const rows = [
      { kind: "decision" as const, status: "skipped", dryRun: false },
      { kind: "order" as const, status: "COMPLETE", dryRun: false },
      { kind: "order" as const, status: "COMPLETE", dryRun: true },
      { kind: "gtt_exit" as const, status: "COMPLETE", dryRun: false },
      { kind: "order" as const, status: "CANCELLED", dryRun: false },
    ];
    expect(rows.filter((row) => isBoughtOrSold(row, false)).map((row) => row.kind)).toEqual(["order", "gtt_exit", "order"]);
    expect(rows.filter((row) => isBoughtOrSold(row, true))).toHaveLength(4);
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
