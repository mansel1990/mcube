import { M10_6_POLICY, requiresProtectiveGtt } from "@/engine/live-strategies";
import { LONGTERM_FROZEN_V2, LONGTERM_FROZEN_V3 } from "@/engine/longterm/rules";
import { DEFAULT_LONGTERM_COSTS, DEFAULT_REPRESENTATIVE_ETFS } from "@/engine/longterm/variants";
import {
  INTRADAY_SURVIVORSHIP,
  RESEARCH_STRATEGIES,
  SWING_SURVIVORSHIP,
  researchThresholds,
  sampleWindow,
} from "@/lib/mlive/research-bar";
import { effectiveStrategiesEnabled } from "@/lib/mlive/research-page";

export type RulesModel = {
  lastUpdated: string;
  strategies: { name: string; line: string; live: boolean; detail: string[] }[];
  safety: string[];
  testing: string[];
  longGame: string[];
};

const PARKED_NAMES: Record<string, string> = {
  ema: "EMA Pullback",
  rs: "RS Resilience",
  momentum: "Momentum M10-6",
  trend_breakout: "Trend breakout",
  rsi2: "RSI 2",
  ema_v2: "EMA v2",
  orb: "Opening range",
  vwap: "VWAP",
};

/** Keys the public page is allowed to read. Amounts that describe the fund are not here. */
const ALLOWED_SETTINGS = [
  "strategies_enabled",
  "max_order_pct",
  "min_order_inr",
  "max_open_positions",
  "max_per_sector",
  "max_daily_deploy_pct",
  "max_new_buys_per_day",
  "max_buys_per_strategy_per_day",
  "max_open_per_strategy",
  "max_buys_per_day",
  "max_sells_per_day",
  "breaker_pct",
  "chase_pct",
  "limit_offset_pct",
  "intraday_exit_time",
  "intraday_max_trades",
  "intraday_risk_pct",
  "intraday_day_loss_pct",
  "intraday_entry_window",
  "login_reminder",
  "longterm_max_changes_per_year",
  "longterm_proposal_expiry_days",
] as const;

export function rulesModelFrom(input: unknown): RulesModel {
  const root = record(input);
  const settings = record(root.settings);
  const allowed = new Set<string>(ALLOWED_SETTINGS);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (allowed.has(key)) safe[key] = value;
  }
  const enabled = effectiveStrategiesEnabled(safe.strategies_enabled);
  const rawEnabled = arrayOf(safe.strategies_enabled).map(String);
  const longGameLive = rawEnabled.includes("longterm");
  const maxOrder = fraction(safe.max_order_pct, 0.25);
  const minOrder = number(safe.min_order_inr, 8000);
  const maxOpen = number(safe.max_open_positions, 6);
  const maxSector = number(safe.max_per_sector, 2);
  const dailyDeploy = fraction(safe.max_daily_deploy_pct, 0.5);
  const newBuys = number(safe.max_new_buys_per_day, 2);
  const strategyBuys = number(safe.max_buys_per_strategy_per_day, 2);
  const openPerStrategy = number(safe.max_open_per_strategy, 4);
  const maxBuys = number(safe.max_buys_per_day, 4);
  const maxSells = number(safe.max_sells_per_day, 4);
  const breaker = fraction(safe.breaker_pct, 0.25);
  const chase = fraction(safe.chase_pct, 0.03);
  const limitOffset = fraction(safe.limit_offset_pct, 0.005);
  const exitTime = text(safe.intraday_exit_time, "15:00");
  const dayTrades = number(safe.intraday_max_trades, 4);
  const dayRisk = fraction(safe.intraday_risk_pct, 0.01);
  const dayLoss = fraction(safe.intraday_day_loss_pct, 0.02);
  const entry = record(safe.intraday_entry_window);
  const entryBefore = text(entry.before, "09:20");
  const entryAfter = text(entry.after, "14:30");
  const changes = number(safe.longterm_max_changes_per_year, LONGTERM_FROZEN_V2.eventsPerYearMax);
  const expiryDays = number(safe.longterm_proposal_expiry_days, 3);
  const lastUpdated = text(root.lastUpdated, LONGTERM_FROZEN_V2.decidedOn);

  const strategies = catalog(enabled, longGameLive).map((item) => ({
    ...item,
    detail: item.live
      ? detailFor(item.key, {
          maxOrder,
          minOrder,
          maxOpen,
          maxSector,
          dailyDeploy,
          newBuys,
          strategyBuys,
          openPerStrategy,
          chase,
          limitOffset,
        })
      : [],
  }));

  return {
    lastUpdated,
    strategies,
    safety: safetyLines({
      login: safe.login_reminder !== false,
      breaker,
      minOrder,
      maxBuys,
      maxSells,
      chase,
      limitOffset,
      exitTime,
      dayTrades,
      dayRisk,
      dayLoss,
      entryBefore,
      entryAfter,
    }),
    testing: testingLines(),
    longGame: longGameLines({ live: longGameLive, changes, expiryDays }),
  };
}

function catalog(enabled: readonly string[], longGameLive: boolean): { key: string; name: string; line: string; live: boolean }[] {
  const swing = ["momentum", "ema", "rs", ...RESEARCH_STRATEGIES.swing.filter((name) => !["momentum", "ema", "rs"].includes(name))];
  const rows = [...swing, ...RESEARCH_STRATEGIES.intraday].map((key) => {
    const name = PARKED_NAMES[key] ?? key;
    const live = enabled.includes(key);
    if (key === "momentum" && live) {
      return { key, name, live: true, line: "Momentum M10-6 — live pilot by owner's choice, did not pass every test" };
    }
    if (live) return { key, name, live: true, line: `${name} — live` };
    return { key, name, live: false, line: `${name} — parked` };
  });
  rows.push({
    key: "longterm",
    name: "Long Game",
    live: longGameLive,
    line: longGameLive ? "Long Game — live" : "Long Game — parked",
  });
  return rows;
}

function detailFor(key: string, limits: {
  maxOrder: number;
  minOrder: number;
  maxOpen: number;
  maxSector: number;
  dailyDeploy: number;
  newBuys: number;
  strategyBuys: number;
  openPerStrategy: number;
  chase: number;
  limitOffset: number;
}): string[] {
  if (key === "momentum") {
    const cap = Math.min(limits.maxOpen, M10_6_POLICY.maxOpen);
    return [
      "When it picks: once a week, after the close, and only when the Nifty 50 is above its 200-day average.",
      "What it buys: the strongest eligible names in the current Nifty 500 list, at most the top 8, as delivery.",
      `Position size: ${percent(M10_6_POLICY.maxOrderPct)} of the swing book, and at least ${rupees(M10_6_POLICY.minOrderInr)} a name. Size uses the order cap. It does not use the 1% risk rule.`,
      `Max positions: ${cap} open momentum positions.`,
      `Max per sector: ${limits.maxSector}.`,
      `Max invested: ${percent(M10_6_POLICY.maxGrossExposurePct ?? 0.6)} of the swing book.`,
      `Daily buy limit: ${limits.newBuys} new buys a day for the account, and ${limits.strategyBuys} buys a day for this strategy.`,
      "How it exits: at the weekly rebalance, a name that has left the list is sold with a limit order. There is no price stop.",
      "Stop rule: there is no price stop and no protective GTT. A 20-day low made the old risk rule reject most of the list, so M10-6 does not use one.",
    ];
  }
  if (key === "ema") {
    return [
      "When it picks: after the close, when price has pulled back to the 20-day average while the 20-day average is still above the 50-day.",
      "What it buys: the stock, delivery only, with a limit at the signal close plus the limit offset. The buy is skipped if the open has run too far.",
      `Position size: at most ${percent(limits.maxOrder)} of the book, and at least ${rupees(limits.minOrder)}. Size uses the distance from the entry to the 20-day average.`,
      `Max positions: ${Math.min(limits.maxOpen, limits.openPerStrategy)} open for this strategy, and ${limits.maxOpen} open in the account.`,
      `Max per sector: ${limits.maxSector}.`,
      `Max invested: at most ${percent(limits.dailyDeploy)} of the cash the engine can use is deployed in one day. There is no separate gross cap.`,
      `Daily buy limit: ${limits.newBuys} new buys a day for the account, and ${limits.strategyBuys} for this strategy.`,
      "How it exits: a close under the 20-day average, which only moves up, sells at the next open.",
      `Stop rule: the stop is that 20-day average. ${requiresProtectiveGtt("ema") ? "A protective GTT sits under it." : "No protective GTT."} The limit offset is ${percent(limits.limitOffset)}. A live price more than ${percent(limits.chase)} above the signal is skipped.`,
    ];
  }
  if (key === "rs") {
    return [
      "When it picks: after the close, when the stock has held up better than the Nifty 50 and the index's own 10-day return is under 1%.",
      "What it buys: the stock, delivery only, with a limit at the signal close plus the limit offset.",
      `Position size: at most ${percent(limits.maxOrder)} of the book, and at least ${rupees(limits.minOrder)}. Size uses the distance from the entry to the chandelier stop.`,
      `Max positions: ${Math.min(limits.maxOpen, limits.openPerStrategy)} open for this strategy, and ${limits.maxOpen} open in the account.`,
      `Max per sector: ${limits.maxSector}.`,
      `Max invested: at most ${percent(limits.dailyDeploy)} of the cash the engine can use is deployed in one day.`,
      `Daily buy limit: ${limits.newBuys} new buys a day for the account, and ${limits.strategyBuys} for this strategy.`,
      "How it exits: a close under the chandelier stop sells at the next open. The stop is the highest close since entry, minus 2.5 times the 14-day ATR, and it only moves up.",
      `Stop rule: that chandelier is the price stop. ${requiresProtectiveGtt("rs") ? "A protective GTT sits under it." : "No protective GTT."}`,
    ];
  }
  return [];
}

function safetyLines(input: {
  login: boolean;
  breaker: number;
  minOrder: number;
  maxBuys: number;
  maxSells: number;
  chase: number;
  limitOffset: number;
  exitTime: string;
  dayTrades: number;
  dayRisk: number;
  dayLoss: number;
  entryBefore: string;
  entryAfter: string;
}): string[] {
  return [
    input.login
      ? "Daily login: one person connects Kite in the morning. A reminder is sent before the open. Nothing new is bought until that session exists."
      : "Daily login: one person connects Kite in the morning. The morning reminder is off. Nothing new is bought until that session exists.",
    "Trading hours: the cash market is 09:15 to 15:30 IST. Sells that were already decided go out at 09:20. Buys go out at 09:45. Approval and fill checks run until 14:30. Orders still open at 15:15 are cancelled.",
    "Order types: limit orders only. Market orders are refused. Swing orders are delivery (CNC). Intraday orders are intraday (MIS) and are not carried overnight.",
    "GTT stops: EMA Pullback and RS Resilience place a protective GTT under the price stop. Momentum M10-6 does not, because it has no price stop.",
    `Intraday close-out: every intraday position is closed by 15:00. The live setting for that flatten is ${input.exitTime}. No new intraday trade before ${input.entryBefore} or after ${input.entryAfter}. At most ${input.dayTrades} intraday trades a day, risk ${percent(input.dayRisk)} a trade, and a day-loss limit of ${percent(input.dayLoss)}.`,
    `Other account limits: the breaker pauses new risk after a ${percent(input.breaker)} fall from the peak. The smallest swing order is ${rupees(input.minOrder)}. At most ${input.maxBuys} buy orders and ${input.maxSells} sell orders are sent in a day. A buy more than ${percent(input.chase)} above its signal is skipped. The limit is the signal plus ${percent(input.limitOffset)}.`,
  ];
}

function testingLines(): string[] {
  const swingBuild = researchThresholds("swing", "building");
  const swingHeld = researchThresholds("swing", "heldback");
  const dayBuild = researchThresholds("intraday", "building");
  const dayHeld = researchThresholds("intraday", "heldback");
  const swingWindow = sampleWindow("swing", "building", null);
  const swingHeldWindow = sampleWindow("swing", "heldback", null);
  const dayWindow = sampleWindow("intraday", "building", null);
  const dayHeldWindow = sampleWindow("intraday", "heldback", null);
  const longWindow = sampleWindow("longterm", "building", null);
  const longHeld = sampleWindow("longterm", "heldback", null);
  return [
    `Building, then held-back. Rules are fixed on the building sample and checked once on later data. Swing building is ${swingWindow.from} to ${swingWindow.to}. Swing held-back starts ${swingHeldWindow.from}. Intraday building is ${dayWindow.from} to ${dayWindow.to}. Intraday held-back starts ${dayHeldWindow.from}. Long Game building is ${longWindow.from} to ${longWindow.to}. Long Game held-back starts ${longHeld.from}.`,
    "Held-back is once only. A second held-back run is refused unless someone explicitly forces it. Looking at the result and then changing the rules is not allowed.",
    `Gates for a swing building run: profit factor at least ${swingBuild.profitFactor}, at least ${swingBuild.trades} trades, average net at least ${swingBuild.avgNetPct}% a trade, at least ${swingBuild.halfYearsPct}% of complete half-years profitable, and maximum drawdown no worse than ${swingBuild.maxDrawdownPct}%. The held-back profit-factor gate is ${swingHeld.profitFactor}.`,
    `Gates for an intraday building run: profit factor at least ${dayBuild.profitFactor}, at least ${dayBuild.trades} trades, average net at least ${dayBuild.avgNetPct}% a trade, at least ${dayBuild.halfYearsPct}% of the periods profitable, and maximum drawdown no worse than ${dayBuild.maxDrawdownPct}%. The held-back profit-factor gate is ${dayHeld.profitFactor}.`,
    "Costs and slippage: swing fills use Zerodha delivery charges and 0.05% slippage on market and open fills. A buy limit does not fill above its limit. Intraday fills use MIS charges and 0.1% slippage. A stress test doubles that slippage. Long Game uses the frozen cost record: slippage 0.05% and transaction cost 0.10%, plus an investable-product drag, with a current-tax stress that is not a reconstruction of old tax law.",
    `Survivorship: ${SWING_SURVIVORSHIP} ${INTRADAY_SURVIVORSHIP}`,
  ];
}

function longGameLines(input: { live: boolean; changes: number; expiryDays: number }): string[] {
  const rules = LONGTERM_FROZEN_V2;
  const etfs = `${DEFAULT_REPRESENTATIVE_ETFS.nifty50.symbol}, ${DEFAULT_REPRESENTATIVE_ETFS.secondary.symbol}, and ${DEFAULT_REPRESENTATIVE_ETFS.gold.symbol}`;
  return [
    `${rules.version}, decided ${rules.decidedOn} by the ${rules.decider}. ${rules.reasons.unchanged}`,
    rules.reasons.eventsPerYear,
    rules.reasons.afterTax,
    `${rules.reasons.concentration} The 50% concentration gate still fails when one sleeve or one year dominates. The override allows inspection only and does not turn that fail into a pass.`,
    input.live
      ? "Long Game is in the enabled strategies."
      : "Long Game is not enabled. It is not live and it is not a recommendation. No allocation change is proposed, and no Long Game order is placed, until a held-back run for the chosen variant says it qualifies for live design and the owner turns it on.",
    `When that is on, each allocation change needs the owner's approval. At most ${input.changes} approved changes count in a calendar year (longterm_max_changes_per_year). A proposal that is not approved within ${input.expiryDays} trading days expires (longterm_proposal_expiry_days). Rejected and expired proposals do not count. The trades, when approved, use the representative ETFs ${etfs}. Costs in that test are slippage ${percent(DEFAULT_LONGTERM_COSTS.slippagePct)} and transaction cost ${percent(DEFAULT_LONGTERM_COSTS.transactionCostPct)}.`,
    "The balanced research target is 60% equity, 25% gold and 15% liquid. Equity is 40% Nifty 50 and 20% Next 50 or Midcap 150. Static variants rebalance in March and when a sleeve drifts more than 5 percentage points. RADAR variants change only when their warning and staged-entry rules fire. Sells are sent before buys.",
    `${LONGTERM_FROZEN_V3.version}, decided ${LONGTERM_FROZEN_V3.decidedOn}. Core is ${LONGTERM_FROZEN_V3.core}. Radar is ${LONGTERM_FROZEN_V3.radar}. Core needs no held-back test because it is a fixed mix with no signals.`,
    `Run ${LONGTERM_FROZEN_V3.run15.id} remains a failed building gate. STATIC-MID after-tax CAGR ${LONGTERM_FROZEN_V3.run15.staticMidAfterTaxCagrPct}%. RADAR-MID after-tax CAGR ${LONGTERM_FROZEN_V3.run15.radarMidAfterTaxCagrPct}%. RADAR-MID concentration ${LONGTERM_FROZEN_V3.run15.radarMidConcentrationPct}%. STATIC-MID building drawdown ${LONGTERM_FROZEN_V3.run15.staticMidBuildingDrawdownPct}%. RADAR-MID building drawdown ${LONGTERM_FROZEN_V3.run15.radarMidBuildingDrawdownPct}%. The override does not convert any failed check to a pass.`,
    LONGTERM_FROZEN_V3.ownerReason,
    "One inspection is allowed with research --book longterm --heldback --confirm-heldback --owner-override longgame-frozen-v3 --no-grid --variant STATIC-MID,RADAR-MID. It is inspection only. The override is consumed only after that run finishes ok and both STATIC-MID and RADAR-MID result rows are stored. A queued, running, failed, cancelled, or out-of-memory run does not consume it.",
    "Radar may activate only when the latest valid held-back run contains STATIC-MID and RADAR-MID, RADAR-MID maximum drawdown is at most 15%, and that drawdown is lower than STATIC-MID over the same held-back window. The older qualifies-for-live-design conclusion is not the v3 activation rule.",
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function number(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fraction(value: unknown, fallback: number): number {
  return number(value, fallback);
}

function text(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.replace(/^"|"$/g, "");
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function percent(fractionValue: number): string {
  const points = fractionValue * 100;
  const rounded = Math.round(points * 100) / 100;
  return `${rounded}%`;
}

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
