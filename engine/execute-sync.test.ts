import { beforeEach, describe, expect, it, vi } from "vitest";

const applyFill = vi.fn();
const queries: string[] = [];

vi.mock("./book", () => ({
  applyFill,
  rejectIsKnown: () => true,
}));

vi.mock("./load", () => ({
  loadSettings: async () => ({ dryRun: false }),
  setState: vi.fn(),
}));

vi.mock("./db", () => ({
  num: (value: unknown) => Number(value ?? 0),
  q: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM mlive.mlive_orders WHERE dry_run = false")) {
      return [{
        id: 7,
        tag: "mliveSABC123",
        side: "SELL",
        symbol: "INFY",
        filled_qty: 2,
        avg_price: 100,
        decision_id: null,
        kite_order_id: "K-1",
        status: "OPEN",
        kind: "order",
        dry_run: false,
      }];
    }
    return [];
  },
}));

vi.mock("./kite", () => ({
  MliveKite: class {
    async orders() {
      return [{
        order_id: "K-1",
        tag: "mliveSABC123",
        status: "CANCELLED",
        status_message: null,
        filled_quantity: 5,
        average_price: 101,
      }];
    }

    async gtts() {
      return [];
    }
  },
}));

vi.mock("./alerts", () => ({ raiseAlert: vi.fn() }));

describe("broker order reconciliation", () => {
  beforeEach(() => {
    applyFill.mockClear();
    queries.length = 0;
  });

  it("settles a final partial fill before recording cancellation", async () => {
    const { syncBroker } = await import("./execute");
    await syncBroker(42);

    expect(applyFill).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 7,
      filledQty: 5,
      previousFilled: 2,
      orderStatus: "CANCELLED",
    }));
    expect(queries.some((sql) => sql.includes("SET status = $2, reject_reason = $3"))).toBe(true);
  });
});
