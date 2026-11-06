import { describe, expect, it } from "vitest";
import { guardOrder, type GuardContext, type GuardIntent } from "./guard";

function intent(patch: Partial<GuardIntent> = {}): GuardIntent {
  return {
    side: "BUY",
    symbol: "LUPIN",
    qty: 9,
    limitPrice: 2065,
    tag: "mliveB7F3K2",
    decisionId: "d1",
    product: "CNC",
    orderType: "LIMIT",
    isGttExit: false,
    ...patch,
  };
}

function ctx(patch: Partial<GuardContext> = {}): GuardContext {
  return {
    mode: "auto",
    status: "active",
    approved: true,
    fund: 80_000,
    spendable: 50_000,
    maxOrderPct: 0.25,
    excluded: false,
    systemQty: 0,
    buysSent: 0,
    sellsSent: 0,
    maxBuys: 4,
    maxSells: 4,
    decisionAlreadySent: false,
    frozen: false,
    openPositions: 1,
    maxOpenPositions: 6,
    isNewSymbol: true,
    sectorCount: 0,
    maxPerSector: 2,
    ...patch,
  };
}

describe("order guard", () => {
  it("lets a sized buy through", () => {
    expect(guardOrder(intent(), ctx()).ok).toBe(true);
  });

  it("stops the fifth buy and the fifth sell, but not a GTT exit", () => {
    expect(guardOrder(intent(), ctx({ buysSent: 4 })).reason).toBe("buy_limit");
    expect(guardOrder(intent({ side: "SELL", tag: "mliveS7F3K2" }), ctx({ systemQty: 9, sellsSent: 4 })).reason).toBe("sell_limit");
    const gtt = guardOrder(
      intent({ side: "SELL", tag: "mliveS7F3K2", isGttExit: true }),
      ctx({ systemQty: 9, sellsSent: 4, mode: "paused", status: "paused_by_user" })
    );
    expect(gtt.ok).toBe(true);
  });

  it("never sells an excluded name or more than the system owns", () => {
    expect(guardOrder(intent({ symbol: "NIFTYBEES" }), ctx({ excluded: true })).reason).toBe("excluded");
    expect(
      guardOrder(intent({ side: "SELL", tag: "mliveS7F3K2", qty: 11 }), ctx({ systemQty: 10 })).reason
    ).toBe("unowned_qty");
    expect(guardOrder(intent({ side: "SELL", tag: "mliveS7F3K2", qty: 10 }), ctx({ systemQty: 10 })).ok).toBe(true);
  });

  it("paces new buys without hiding the send cap", () => {
    expect(guardOrder(intent(), ctx({ buysSent: 0, newBuys: 2, maxNewBuys: 2 })).reason).toBe("pacing_day");
    expect(guardOrder(intent(), ctx({ buysSent: 4, newBuys: 2, maxNewBuys: 2 })).reason).toBe("buy_limit");
    expect(guardOrder(intent(), ctx({ strategyBuys: 2, maxBuysPerStrategy: 2 })).reason).toBe("pacing_strategy");
    expect(guardOrder(intent(), ctx({ openInStrategy: 4, maxOpenPerStrategy: 4 })).reason).toBe("strategy_full");
    expect(guardOrder(intent(), ctx({ deployed: 40_000, deployCap: 50_000 })).reason).toBe("pacing_cash");
    expect(guardOrder(intent(), ctx({ openInStrategy: 4, maxOpenPerStrategy: 4, isNewSymbol: false })).ok).toBe(true);
  });

  it("enforces the 25% cap and spendable cash", () => {
    expect(guardOrder(intent({ qty: 10, limitPrice: 2065 }), ctx()).reason).toBe("order_cap");
    expect(guardOrder(intent({ qty: 9, limitPrice: 2065 }), ctx({ spendable: 10_000 })).reason).toBe("spendable");
  });

  it("refuses orders when paused, halted, unapproved, frozen, or already sent", () => {
    expect(guardOrder(intent(), ctx({ mode: "paused", status: "paused_by_user" })).reason).toBe("paused_by_user");
    expect(guardOrder(intent(), ctx({ status: "paused_by_breaker" })).reason).toBe("paused_by_breaker");
    expect(guardOrder(intent(), ctx({ status: "halted_today" })).reason).toBe("halted_today");
    expect(guardOrder(intent(), ctx({ mode: "approve", approved: false })).reason).toBe("not_approved");
    expect(guardOrder(intent(), ctx({ mode: "auto", approved: false })).ok).toBe(true);
    expect(guardOrder(intent(), ctx({ frozen: true })).reason).toBe("frozen");
    expect(guardOrder(intent(), ctx({ decisionAlreadySent: true })).reason).toBe("duplicate_decision");
  });

  it("allows only CNC limit orders and refuses averaging down", () => {
    expect(guardOrder(intent({ orderType: "MARKET" }), ctx()).reason).toBe("order_type");
    expect(guardOrder(intent({ product: "MIS" }), ctx()).reason).toBe("product");
    expect(guardOrder(intent(), ctx({ systemQty: 4 })).reason).toBe("already_held");
    expect(guardOrder(intent({ tag: "kiteB1" }), ctx()).reason).toBe("tag");
  });

  it("enforces position and sector caps", () => {
    expect(guardOrder(intent(), ctx({ openPositions: 6 })).reason).toBe("max_positions");
    expect(guardOrder(intent(), ctx({ sectorCount: 2 })).reason).toBe("sector_cap");
  });
});
