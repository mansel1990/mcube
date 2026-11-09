import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayIst } from "@/lib/mlive/calendar";

const { getMargins, getInstruments, q, audit, raiseAlert } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getInstruments: vi.fn(),
  q: vi.fn(),
  audit: vi.fn(),
  raiseAlert: vi.fn(),
}));

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    getMargins,
    getInstruments,
  })),
}));

vi.mock("@/lib/mlive/crypto", () => ({
  decryptToken: () => "access-token",
}));

vi.mock("./db", () => ({
  q: (...args: unknown[]) => q(...args),
  asDate: (value: unknown) => {
    if (value == null) return null;
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  },
}));

vi.mock("./lock", () => ({
  withLock: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("./load", () => ({
  holidaySet: async () => new Set<string>(),
}));

vi.mock("./audit", () => ({
  audit: (...args: unknown[]) => audit(...args),
}));

vi.mock("./alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

const margins = JSON.parse(readFileSync(new URL("./__fixtures__/kite-margins-equity.json", import.meta.url), "utf8")) as {
  available: { live_balance: number; cash: number };
};

describe("Kite equity cash", () => {
  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    getMargins.mockReset();
    getInstruments.mockReset();
    q.mockReset();
    q.mockResolvedValue([{ access_token_enc: "enc", token_date: todayIst() }]);
  });

  it("reads a segment-shaped margins response", async () => {
    const { MliveKite } = await import("./kite");
    getMargins.mockResolvedValue(margins);
    await expect(new MliveKite(true).equityCash()).resolves.toBe(margins.available.live_balance);
    expect(getMargins).toHaveBeenCalledWith("equity");
  });

  it("reads the NSE equity tick and sends nothing when the tick is missing", async () => {
    const { MliveKite, clearTickCache } = await import("./kite");
    clearTickCache();
    getInstruments.mockResolvedValueOnce([
      { tradingsymbol: "INFY", exchange: "NSE", instrument_type: "EQ", tick_size: 0.05 },
      { tradingsymbol: "NIFTY", exchange: "NSE", instrument_type: "FUT", tick_size: 0.1 },
    ]);
    const kite = new MliveKite(false);
    await expect(kite.tickSize("infy")).resolves.toBe(0.05);
    await expect(kite.tickSize("NIFTY")).resolves.toBeNull();
    clearTickCache();
    getInstruments.mockRejectedValueOnce({ message: "Invalid session", error_type: "TokenException" });
    await expect(new MliveKite(false).tickSize("INFY")).resolves.toBeNull();
  });

  it("throws when the cash fields are missing and does not return 0", async () => {
    const { MliveKite } = await import("./kite");
    getMargins.mockResolvedValue({});
    await expect(new MliveKite(false).equityCash()).rejects.toThrow("Kite margins: cash missing in response");
  });

  it("fails the run, writes an audit and a problem alert, and places no order when cash cannot be read", async () => {
    const { runJob } = await import("./run");
    q.mockImplementation(async (text: string) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "12" }];
      return [];
    });
    await expect(
      runJob("approvals", async () => {
        throw new Error("Kite margins: cash missing in response");
      })
    ).rejects.toThrow("Kite margins: cash missing in response");
    const sql = q.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => text.includes("mlive_orders"))).toBe(false);
    expect(q).toHaveBeenCalledWith(
      expect.stringContaining("status = 'error'"),
      expect.arrayContaining([12])
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "run.error", runId: 12 }));
    expect(raiseAlert).toHaveBeenCalledWith(expect.objectContaining({ level: "problem", code: "engine_error", runId: 12 }));
  });
});
