import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPnl, type BuildPnlInput, type PnlChargeItem, type PnlFill, type PnlPosition } from "@/lib/mlive/pnl";
import { ChartsBoard } from "./charts-board";
import { ReportsPnl } from "./reports-pnl";

const base: BuildPnlInput = {
  positions: [],
  fills: [],
  chargeItems: [],
  ledger: [{ id: 1, kind: "deposit", amount: 80000, ts: "2026-10-01T04:00:00.000Z" }],
  equity: [],
  marks: {},
  gtts: [],
  ohlcv: [],
  today: "2026-11-09",
  range: "all",
  strategy: "all",
};

function closedTrades(count: number): BuildPnlInput {
  const positions: PnlPosition[] = [];
  const fills: PnlFill[] = [];
  const chargeItems: PnlChargeItem[] = [];
  for (let i = 1; i <= count; i += 1) {
    const day = String(i).padStart(2, "0");
    const entry = `2026-10-${day}`;
    const exit = `2026-10-${day}`;
    const gross = i % 3 === 0 ? -40 : 80;
    positions.push({
      id: i,
      symbol: `T${i}`,
      strategy: i % 2 ? "rs" : "ema",
      qty: 0,
      avgPrice: 100,
      openedAt: `${entry}T04:00:00.000Z`,
      closedAt: `${exit}T10:00:00.000Z`,
      trendStop: 90,
      initialStop: 90,
      exitReason: "trend_stop",
    });
    fills.push(
      { id: i * 2, positionId: i, side: "BUY", qty: 10, price: 100, ts: `${entry}T04:00:00.000Z` },
      { id: i * 2 + 1, positionId: i, side: "SELL", qty: 10, price: 100 + gross / 10, ts: `${exit}T10:00:00.000Z` }
    );
    chargeItems.push({
      id: i,
      positionId: i,
      side: "SELL",
      intraday: true,
      source: "formula",
      ts: `${exit}T10:00:00.000Z`,
      brokerage: 10,
      stt: 0,
      exchange: 0,
      sebi: 0,
      stamp: 0,
      gst: 0,
      dp: 0,
      total: 10,
    });
  }
  return { ...base, positions, fills, chargeItems };
}

function html(count: number): string {
  const pnl = buildPnl(count ? closedTrades(count) : base);
  return renderToStaticMarkup(createElement(ChartsBoard, { pnl }));
}

describe("charts and reports boards", () => {
  it("renders the empty-state copy and mounts with 0, 1 and 12 trades", () => {
    const none = html(0);
    const one = html(1);
    const twelve = html(12);
    expect(none).toContain("Needs 5 closed trades · you have 0.");
    expect(none).toContain("Needs 10 closed trades · you have 0.");
    expect(one).toContain("Needs 5 closed trades · you have 1.");
    expect(one).toContain("Needs 10 closed trades · you have 1.");
    expect(twelve).not.toContain("Needs 5 closed trades");
    expect(twelve).not.toContain("Needs 10 closed trades");
    expect(none + one + twelve).not.toContain("Down from peak");
    expect(none + one + twelve).not.toContain("2026-W");
    const report = renderToStaticMarkup(createElement(ReportsPnl, { pnl: buildPnl(closedTrades(1)), onOpen: () => undefined }));
    expect(report).not.toContain("Down from peak");
    expect(report).not.toContain("Where the money went");
    expect(report).not.toContain("of gross");
    expect(report).toContain("Realised");
    expect(report).toContain("Unrealised");
    expect(report).not.toContain("Not split yet");
  });
});
