import type { LongtermDataset } from "./data";
import type { LongtermVariant, RiskySleeve } from "./variants";

const RISKY: RiskySleeve[] = ["nifty50", "secondary", "gold"];
const DAY = 86_400_000;

export type Lot = { units: number; basis: number; acquired: string };

export type PendingAction =
  | {
      executeAt: number;
      signalDate: string;
      type: "target";
      kind: "initial" | "annual" | "drift";
      reason: string;
    }
  | {
      executeAt: number;
      signalDate: string;
      type: "stage";
      sleeve: RiskySleeve;
      stage: 1 | 2 | 3;
      regime: "normal" | "crisis";
      cumulativeTarget: number;
      reason: string;
    }
  | {
      executeAt: number;
      signalDate: string;
      type: "warning";
      sleeve: RiskySleeve;
      fraction: number;
      reason: string;
    };

export type SleeveState = {
  units: number;
  lots: Lot[];
  arm: "none" | "normal" | "crisis";
  stage: 0 | 1 | 2 | 3;
  stage1Close: number;
  stage1Week: number;
  lastStageWeek: number;
  warningStreak: number;
};

export type SignalFrame = {
  monthEnd: boolean[];
  weekEnd: boolean[];
  weekNumber: number[];
  weekEndIndices: number[];
  monthEndIndices: number[];
  trend: Record<RiskySleeve, boolean[]>;
  warning: Record<RiskySleeve, boolean[]>;
  drawdown: Record<RiskySleeve, number[]>;
};

export function updateRadarSignals(
  index: number,
  dates: string[],
  dataset: LongtermDataset,
  variant: LongtermVariant,
  signal: SignalFrame,
  states: Record<RiskySleeve, SleeveState>,
  pending: PendingAction[]
): void {
  for (const sleeve of RISKY) {
    const state = states[sleeve];
    const trend = signal.trend[sleeve][index];
    const drawdown = signal.drawdown[sleeve][index];
    if (drawdown >= 0.2 && state.arm !== "crisis") {
      state.arm = "crisis";
      state.stage = 0;
      state.stage1Close = 0;
      state.stage1Week = -1;
      pending.splice(0, pending.length, ...pending.filter((item) => item.type !== "stage" || item.sleeve !== sleeve));
    } else if (drawdown >= 0.08 && drawdown < 0.2 && trend && state.arm === "none") {
      state.arm = "normal";
      state.stage = 0;
    }

    if (signal.monthEnd[index]) {
      if (signal.warning[sleeve][index]) {
        state.warningStreak++;
        state.arm = "none";
        state.stage = 0;
        pending.splice(0, pending.length, ...pending.filter((item) => item.type !== "stage" || item.sleeve !== sleeve));
        pending.push({
          executeAt: index + 1,
          signalDate: dates[index],
          type: "warning",
          sleeve,
          fraction: state.warningStreak === 1 ? 0.5 : 1,
          reason: state.warningStreak === 1
            ? "First completed warning month: sell 50% on the next session."
            : "Second consecutive completed warning month: sell the remainder on the next session.",
        });
        if (state.warningStreak >= 2) state.warningStreak = 2;
        continue;
      }
      state.warningStreak = 0;
      if (
        state.arm === "crisis"
        && state.stage === 1
        && trend
        && signal.weekNumber[index] > state.stage1Week
        && state.lastStageWeek !== signal.weekNumber[index]
      ) {
        queueStage(index, dates, state, pending, sleeve, 2, "crisis", "A later completed month restored the positive long-term trend.");
      }
    }

    if (!signal.weekEnd[index] || state.arm === "none" || state.lastStageWeek === signal.weekNumber[index]) continue;
    const series = dataset.values[variant.series[sleeve]];
    const close = series.get(dates[index])!;
    const priorWeekEnds = signal.weekEndIndices.filter((item) => item < index);
    if (state.stage === 0) {
      if (state.arm === "normal") {
        const previousWeek = priorWeekEnds.length ? signal.weekNumber[priorWeekEnds.at(-1)!] : -1;
        const previousDaily = dates
          .map((date, item) => ({ date, item }))
          .filter((row) => row.item < index && signal.weekNumber[row.item] === previousWeek)
          .map((row) => series.get(row.date)!);
        if (previousDaily.length && close > Math.max(...previousDaily)) {
          state.stage1Close = close;
          state.stage1Week = signal.weekNumber[index];
          queueStage(index, dates, state, pending, sleeve, 1, "normal", "Weekly close exceeded the highest daily close in the previous completed week.");
        }
      } else {
        const previousFour = priorWeekEnds.slice(-4).map((item) => series.get(dates[item])!);
        if (previousFour.length === 4 && close > Math.max(...previousFour)) {
          state.stage1Close = close;
          state.stage1Week = signal.weekNumber[index];
          queueStage(index, dates, state, pending, sleeve, 1, "crisis", "Weekly close exceeded the highest weekly close of the previous four completed weeks.");
        }
      }
    } else if (state.stage === 1 && state.arm === "normal") {
      const weekly = [...priorWeekEnds.slice(-9), index].map((item) => series.get(dates[item])!);
      if (weekly.length === 10 && close > ema(weekly, 10) && close > state.stage1Close) {
        queueStage(index, dates, state, pending, sleeve, 2, "normal", "A later weekly close was above its 10-week EMA and above the Stage 1 signal close.");
      }
    } else if (state.stage === 2) {
      const previousTwelve = priorWeekEnds.slice(-12).map((item) => series.get(dates[item])!);
      if (previousTwelve.length === 12 && close > Math.max(...previousTwelve)) {
        queueStage(index, dates, state, pending, sleeve, 3, state.arm, "A later weekly close made a new 13-week closing high.");
      }
    }
  }
}

function queueStage(
  index: number,
  dates: string[],
  state: SleeveState,
  pending: PendingAction[],
  sleeve: RiskySleeve,
  stage: 1 | 2 | 3,
  regime: "normal" | "crisis",
  reason: string
): void {
  state.stage = stage;
  state.lastStageWeek = weekSerial(dates[index]);
  pending.push({
    executeAt: index + 1,
    signalDate: dates[index],
    type: "stage",
    sleeve,
    stage,
    regime,
    cumulativeTarget: stage === 1 ? 0.3 : stage === 2 ? 0.6 : 1,
    reason,
  });
}

export function buildSignalFrame(dataset: LongtermDataset, variant: LongtermVariant, dates: string[]): SignalFrame {
  const weekNumber = dates.map(weekSerial);
  const weekEnd = dates.map((_, index) => index === dates.length - 1 || weekNumber[index + 1] !== weekNumber[index]);
  const monthEnd = dates.map((date, index) => index === dates.length - 1 || dates[index + 1].slice(0, 7) !== date.slice(0, 7));
  const weekEndIndices = weekEnd.flatMap((yes, index) => yes ? [index] : []);
  const monthEndIndices = monthEnd.flatMap((yes, index) => yes ? [index] : []);
  const trend = {} as Record<RiskySleeve, boolean[]>;
  const warning = {} as Record<RiskySleeve, boolean[]>;
  const drawdown = {} as Record<RiskySleeve, number[]>;
  for (const sleeve of RISKY) {
    const series = dataset.values[variant.series[sleeve]];
    trend[sleeve] = Array(dates.length).fill(false);
    warning[sleeve] = Array(dates.length).fill(false);
    drawdown[sleeve] = Array(dates.length).fill(0);
    let latestTrend = false;
    let latestWarning = false;
    const completedMonths: number[] = [];
    for (let index = 0; index < dates.length; index++) {
      const previous = Array.from({ length: Math.min(252, index) }, (_, offset) => series.get(dates[index - offset - 1])!);
      const close = series.get(dates[index])!;
      drawdown[sleeve][index] = previous.length ? Math.max(0, 1 - close / Math.max(...previous)) : 0;
      trend[sleeve][index] = latestTrend;
      warning[sleeve][index] = latestWarning;
      if (monthEnd[index]) {
        completedMonths.push(index);
        if (completedMonths.length >= 13) {
          const lastTen = completedMonths.slice(-10).map((item) => series.get(dates[item])!);
          const twelveMonthsAgo = series.get(dates[completedMonths.at(-13)!])!;
          const average = sum(lastTen) / lastTen.length;
          latestTrend = close > average && close / twelveMonthsAgo - 1 > 0;
          latestWarning = close < average && close / twelveMonthsAgo - 1 < 0;
        } else {
          latestTrend = false;
          latestWarning = false;
        }
        trend[sleeve][index] = latestTrend;
        warning[sleeve][index] = latestWarning;
      }
    }
  }
  return { monthEnd, weekEnd, weekNumber, weekEndIndices, monthEndIndices, trend, warning, drawdown };
}

function ema(values: number[], period: number): number {
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let index = 1; index < values.length; index++) value = values[index] * alpha + value * (1 - alpha);
  return value;
}

function weekSerial(date: string): number {
  const value = new Date(`${date}T00:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  return Math.floor((value.getTime() - day * DAY) / (7 * DAY));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
