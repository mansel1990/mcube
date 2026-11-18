import { describe, expect, it } from "vitest";
import {
  assertLongtermImportRange,
  fingerprintLongtermDataset,
  GOLDBEES_SPLIT_EXPLANATION,
  LONGTERM_DATA_VERSION,
  normalizeGoldbeesNav,
  parseAmfiGoldNav,
  parseNiftyTriResponse,
  parseNseFixedIncomeResponse,
  pointVisibleToSample,
  visibleToSample,
} from "./data";
import { assertNoUnexplainedJumps, dailyJumps, goldSplitUnresolved } from "./audit";

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

  it("normalizes the Gold BeES 1:100 split and keeps held-back points out of a building fingerprint", () => {
    const raw = [
      { date: "2019-12-18", value: 4200 },
      { date: "2019-12-19", value: 42.2 },
    ];
    expect(normalizeGoldbeesNav(raw)).toEqual([
      { date: "2019-12-18", value: 42 },
      { date: "2019-12-19", value: 42.2 },
    ]);
    expect(GOLDBEES_SPLIT_EXPLANATION).toMatch(/2019-12-19/);
    expect(GOLDBEES_SPLIT_EXPLANATION).toMatch(/2019-12-23/);
    expect(GOLDBEES_SPLIT_EXPLANATION).toMatch(/1:100/);
    expect(LONGTERM_DATA_VERSION).toBe("longgame-data-v3");
    expect(goldSplitUnresolved(dailyJumps("goldbees_nav", raw))).toBe(true);
    expect(goldSplitUnresolved(dailyJumps("goldbees_nav", normalizeGoldbeesNav(raw)))).toBe(false);
    expect(() => assertLongtermImportRange("2010-01-01", "2024-01-02", false)).toThrow(/2023-12-31/);
    expect(() => assertLongtermImportRange("2024-01-01", "2026-11-18", true)).not.toThrow();

    const heldback = { seriesKey: "nifty50_tri", checksum: "held", rawFrom: "2024-01-01", rawTo: "2024-03-31" };
    const building = { seriesKey: "nifty50_tri", checksum: "build", rawFrom: "2023-01-01", rawTo: "2023-12-31" };
    expect(visibleToSample([building, heldback], "building", "2023-12-31")).toEqual([building]);
    expect(pointVisibleToSample("2024-01-02", "building", "2026-11-18")).toBe(false);
    const buildingPrint = fingerprintLongtermDataset({
      sample: "building",
      through: "2023-12-31",
      provenance: [building],
      ranges: [["nifty50_tri", 1, "2010-01-04", "2023-12-29"]],
    });
    const withHeldback = fingerprintLongtermDataset({
      sample: "building",
      through: "2023-12-31",
      provenance: [building, heldback],
      ranges: [["nifty50_tri", 1, "2010-01-04", "2023-12-29"]],
    });
    expect(buildingPrint).not.toBe(withHeldback);
    const scoped = fingerprintLongtermDataset({
      sample: "building",
      through: "2023-12-31",
      provenance: visibleToSample([building, heldback], "building", "2023-12-31"),
      ranges: [["nifty50_tri", 1, "2010-01-04", "2023-12-29"]],
    });
    expect(scoped).toBe(buildingPrint);
  });

  it("normalizes a Gold BeES drop that prints two sessions after the effective date", () => {
    const raw = [
      { date: "2019-12-18", value: 4000 },
      { date: "2019-12-19", value: 4050 },
      { date: "2019-12-20", value: 4100 },
      { date: "2019-12-23", value: 41.2 },
    ];
    expect(normalizeGoldbeesNav(raw)).toEqual([
      { date: "2019-12-18", value: 40 },
      { date: "2019-12-19", value: 40.5 },
      { date: "2019-12-20", value: 41 },
      { date: "2019-12-23", value: 41.2 },
    ]);
    expect(normalizeGoldbeesNav([
      { date: "2019-10-01", value: 3800 },
      { date: "2019-10-02", value: 3810 },
    ])).toEqual([
      { date: "2019-10-01", value: 38 },
      { date: "2019-10-02", value: 38.1 },
    ]);
    const already = [
      { date: "2019-12-18", value: 40 },
      { date: "2019-12-20", value: 40.8 },
      { date: "2019-12-23", value: 41.2 },
    ];
    expect(normalizeGoldbeesNav(already)).toEqual(already);
  });

  it("fails verification on an unnormalized -99% drop anywhere in a series", () => {
    const farFromTheSplit = [
      { date: "2021-06-01", value: 5000 },
      { date: "2021-06-02", value: 50 },
    ];
    expect(goldSplitUnresolved(dailyJumps("goldbees_nav", farFromTheSplit))).toBe(true);
    expect(() => assertNoUnexplainedJumps({ goldbees_nav: farFromTheSplit })).toThrow("unnormalized split drop at 2021-06-02");
    expect(() => assertNoUnexplainedJumps({
      nifty50_tri: [
        { date: "2018-02-01", value: 1000 },
        { date: "2018-02-02", value: 10 },
      ],
    })).toThrow("unnormalized split drop at 2018-02-02");
    expect(() => assertNoUnexplainedJumps({
      nifty_next50_tri: [
        { date: "2015-08-24", value: 1000 },
        { date: "2015-08-25", value: 800 },
      ],
    })).toThrow("unnormalized split drop at 2015-08-25");
    expect(() => assertNoUnexplainedJumps({
      goldbees_nav: [
        { date: "2019-12-20", value: 41 },
        { date: "2019-12-23", value: 41.2 },
      ],
    })).not.toThrow();
  });
});
