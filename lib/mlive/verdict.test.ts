import { describe, expect, it } from "vitest";
import { beforeOpenSentence, buyWindowReading, decisionRows, decisionSkips, firstLoginClock, noBuyReason, verdictSentence } from "./verdict";

describe("verdict sentence", () => {
  it("describes a normal day with a late login", () => {
    expect(verdictSentence({
      bought: ["HEROMOTOCO"],
      sold: [],
      skipped: 2,
      stopsRaised: 2,
      lateLogin: true,
      waitingForLogin: false,
      rulesBroken: 0,
    })).toBe("Bought HEROMOTOCO after a late login. Two ideas skipped, nothing sold. Stops raised on two holdings in the evening.");
  });

  it("describes a day with nothing to do", () => {
    expect(verdictSentence({
      bought: [],
      sold: [],
      skipped: 0,
      stopsRaised: 0,
      lateLogin: false,
      waitingForLogin: false,
      rulesBroken: 0,
    })).toBe("Nothing to buy today; holdings unchanged.");
  });

  it("says buys are held while Kite is logged out", () => {
    expect(verdictSentence({
      bought: [],
      sold: [],
      skipped: 0,
      stopsRaised: 0,
      lateLogin: false,
      waitingForLogin: true,
      rulesBroken: 0,
    })).toBe("Waiting for Kite login; buys held.");
  });

  it("names a sell without a comma splice", () => {
    expect(verdictSentence({
      bought: [],
      sold: ["MPHASIS"],
      skipped: 0,
      stopsRaised: 0,
      lateLogin: false,
      waitingForLogin: false,
      rulesBroken: 0,
    })).toBe("Nothing skipped; sold MPHASIS.");
  });

  it("says why no buy went out", () => {
    const quiet = { bought: [] as string[], sold: [] as string[], skipped: 2, stopsRaised: 0, lateLogin: false, waitingForLogin: false, rulesBroken: 0 };
    expect(verdictSentence({ ...quiet, noBuyReason: "no-ideas", skipped: 0 })).toBe("No ideas from last night's scan.");
    expect(verdictSentence({ ...quiet, noBuyReason: "late-kite", skipped: 0 })).toBe("Kite connected after 10:00, so no buys today.");
    expect(verdictSentence({
      ...quiet,
      noBuyReason: "all-skipped",
      skipNames: ["METROPOLIS", "PERSISTENT"],
      sold: ["MPHASIS"],
    })).toBe("All ideas skipped: METROPOLIS and PERSISTENT; sold MPHASIS.");
  });

  it("adds a broken rule", () => {
    expect(verdictSentence({
      bought: [],
      sold: [],
      skipped: 0,
      stopsRaised: 0,
      lateLogin: false,
      waitingForLogin: false,
      rulesBroken: 1,
    })).toBe("Nothing to buy today; holdings unchanged. One rule did not hold.");
  });
});

describe("decision rows", () => {
  it("leaves out ideas skipped only because they are already held", () => {
    const out = decisionRows([
      { time: "09:46", action: "fill", symbol: "HEROMOTOCO", side: "BUY", qty: 3, reason: "RS signal." },
      { time: "09:46", action: "decision.skip", symbol: "TCS", side: "BUY", qty: null, reason: "Not bought: already held.", code: "held" },
      { time: "09:47", action: "decision.skip", symbol: "INFY", side: "BUY", qty: null, reason: "Not bought: no cash in Kite." },
    ]);
    expect(out.heldLeftOut).toBe(1);
    expect(out.rows.map((row) => row.pill)).toEqual(["Bought 3", "Skipped"]);
  });

  it("does not treat a job that waited for Kite as an idea skip", () => {
    const out = decisionRows([
      { time: "09:20", action: "buys.skipped", symbol: null, side: null, qty: null, reason: "no_kite_session" },
      { time: "09:46", action: "decision.skip", symbol: "METROPOLIS", side: "BUY", qty: null, reason: "Not bought: already 2 new buys today." },
    ]);
    expect(out.rows.map((row) => `${row.pill} ${row.symbol}`.trim())).toEqual(["Skipped METROPOLIS"]);
  });
});

describe("decision skips", () => {
  it("counts skip outcomes and leaves out a name already held", () => {
    expect(decisionSkips([
      { symbol: "METROPOLIS", outcome: "skipped", reasonCode: "pacing_day", reason: "Not bought: already 2 new buys today." },
      { symbol: "PERSISTENT", outcome: "budget", reasonCode: "no_funds", reason: "Not bought: no cash in Kite." },
      { symbol: "TCS", outcome: "skipped", reasonCode: "held", reason: "Not bought: already held." },
      { symbol: "INFY", outcome: "sent", reasonCode: "ranked", reason: "" },
    ])).toEqual(["METROPOLIS", "PERSISTENT"]);
  });

  it("picks the reason no buy went out", () => {
    expect(noBuyReason({ bought: 0, ideas: 0, skipped: 0, held: 0, kiteAt: "08:21" })).toBe("no-ideas");
    expect(noBuyReason({ bought: 0, ideas: 2, skipped: 2, held: 0, kiteAt: "10:12" })).toBe("late-kite");
    expect(noBuyReason({ bought: 0, ideas: 3, skipped: 2, held: 1, kiteAt: "09:02" })).toBe("all-skipped");
    expect(noBuyReason({ bought: 1, ideas: 0, skipped: 0, held: 0, kiteAt: null })).toBeNull();
  });

  it("uses the first login at 08:21 when Kite reconnects at 10:43", () => {
    const kiteAt = firstLoginClock(["10:43", "08:21"]);
    expect(kiteAt).toBe("08:21");
    const hadSession = buyWindowReading([
      { kind: "buys", summary: { buysSent: 0, sellsSent: 0, results: [] } },
      { kind: "approvals", summary: { skipped: "before send window" } },
    ]).hadSession;
    expect(hadSession).toBe(true);
    expect(noBuyReason({
      bought: 0,
      ideas: 5,
      skipped: 2,
      held: 3,
      kiteAt,
      hadSession,
    })).toBe("all-skipped");
    expect(verdictSentence({
      bought: [],
      sold: [],
      skipped: 2,
      stopsRaised: 0,
      lateLogin: false,
      waitingForLogin: false,
      rulesBroken: 0,
      noBuyReason: "all-skipped",
      skipDetails: [
        { symbol: "BOSCHLTD", why: "one share over the order cap" },
        { symbol: "CIPLA", why: "too close to the stop" },
        { symbol: "HEROMOTOCO", why: "already held" },
        { symbol: "COFORGE", why: "already held" },
        { symbol: "ZYDUSLIFE", why: "already held" },
      ],
    })).toBe("All ideas skipped: BOSCHLTD, one share over the order cap; CIPLA, too close to the stop; HEROMOTOCO, COFORGE and ZYDUSLIFE, already held.");
  });
});

describe("before the open", () => {
  it("names the kite time and when buys start", () => {
    expect(beforeOpenSentence("08:21")).toBe("Before the open: Kite connected 08:21, buys at 09:45.");
  });
});
