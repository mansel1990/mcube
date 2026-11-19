import { describe, expect, it } from "vitest";
import { matchKiteUnits, parseTradebookCsv, reconstructFifo, tradebookChecksum } from "./tradebook";

const header = "Symbol,Trade Date,Trade Type,Quantity,Price";

function csv(rows: string[]): string {
  return [header, ...rows].join("\n");
}

describe("Console tradebook", () => {
  it("ignores other symbols and keeps one lot per remaining buy", () => {
    const fills = parseTradebookCsv(csv([
      "INFY,2024-01-02,buy,20,1500",
      "NIFTYBEES,2024-01-10,buy,10,240",
      "NIFTYBEES,2024-02-10,buy,5,250",
    ]), "NIFTYBEES");
    const lots = reconstructFifo(fills);
    expect(fills.every((row) => row.symbol === "NIFTYBEES")).toBe(true);
    expect(lots).toEqual([
      { date: "2024-01-10", units: 10, price: 240 },
      { date: "2024-02-10", units: 5, price: 250 },
    ]);
  });

  it("consumes partial sells from the oldest buy", () => {
    const lots = reconstructFifo(parseTradebookCsv(csv([
      "NIFTYBEES,2024-01-10,buy,10,240",
      "NIFTYBEES,2024-02-10,buy,5,250",
      "NIFTYBEES,2024-03-01,sell,4,260",
    ]), "NIFTYBEES"));
    expect(lots).toEqual([
      { date: "2024-01-10", units: 6, price: 240 },
      { date: "2024-02-10", units: 5, price: 250 },
    ]);
  });

  it("requires an exact match to the unattributed Kite units", () => {
    const lots = reconstructFifo(parseTradebookCsv(csv([
      "GOLDBEES,2024-05-01,buy,8,70",
    ]), "GOLDBEES"));
    const match = matchKiteUnits(lots, 8);
    expect(match.ok).toBe(true);
    if (match.ok) {
      expect(match.moneyAdded).toBe(560);
      expect(match.average).toBe(70);
    }
    const mismatch = matchKiteUnits(lots, 10);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.difference).toBe(-2);
  });

  it("checksums the file without returning the csv", async () => {
    const file = csv(["NIFTYBEES,2024-01-10,buy,1,200"]);
    const sum = await tradebookChecksum(file);
    expect(sum).toHaveLength(64);
    expect(sum).not.toContain("NIFTYBEES");
  });
});
