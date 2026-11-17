import { describe, expect, it } from "vitest";
import { parseAmfiGoldNav, parseNiftyTriResponse, parseNseFixedIncomeResponse } from "./data";

describe("Long Game official-source parsers", () => {
  it("reads the NSE Indices TRI response and sorts it", () => {
    const raw = JSON.stringify([
      { Date: "04 Jan 2011", TotalReturnsIndex: "101.5" },
      { Date: "03 Jan 2011", TotalReturnsIndex: "100.0" },
    ]);
    expect(parseNiftyTriResponse(raw)).toEqual([
      { date: "2011-01-03", value: 100 },
      { date: "2011-01-04", value: 101.5 },
    ]);
  });

  it("reads old AMFI Gold BeES rows without assuming a fixed NAV column", () => {
    const raw = [
      "Scheme Code;Scheme Name;ISIN;Other;NAV;Date",
      "105085;Gold Benchmark Exchange Traded Scheme (Gold BeES);;;;;2002.7485;03-Jan-2011",
      "999999;Unrelated Scheme;;;;;42.00;03-Jan-2011",
    ].join("\n");
    expect(parseAmfiGoldNav(raw)).toEqual([{ date: "2011-01-03", value: 2002.7485 }]);
  });

  it("reads nested NSE fixed-income records", () => {
    const raw = JSON.stringify({
      data: {
        indexCloseOnlineRecords: [
          { EOD_TIMESTAMP: "03-01-2011", EOD_CLOSE_INDEX_VAL: "1,000.00" },
          { EOD_TIMESTAMP: "04-01-2011", EOD_CLOSE_INDEX_VAL: "1000.20" },
        ],
      },
    });
    expect(parseNseFixedIncomeResponse(raw)).toEqual([
      { date: "2011-01-03", value: 1000 },
      { date: "2011-01-04", value: 1000.2 },
    ]);
  });
});
