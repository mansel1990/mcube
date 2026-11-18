export type DatedValue = { date: string; value: number };

export type DailyJump = {
  series: string;
  date: string;
  previous: string;
  changePct: number;
};

export type SleeveValues = Record<string, number>;

const SLEEVES = ["nifty50", "secondary", "gold", "liquid"] as const;

export function dailyJumps(series: string, points: readonly DatedValue[], limit = 0.15): DailyJump[] {
  const jumps: DailyJump[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (!(previous.value > 0) || !(current.value > 0)) continue;
    const change = current.value / previous.value - 1;
    if (Math.abs(change) > limit) {
      jumps.push({
        series,
        date: current.date,
        previous: previous.date,
        changePct: change * 100,
      });
    }
  }
  return jumps;
}

/** A near-100% drop on the split date means pre-split NAVs are still stored in old units. */
export function goldSplitUnresolved(jumps: readonly DailyJump[]): boolean {
  return jumps.some((jump) => jump.series === "goldbees_nav" && jump.date >= "2019-12-18" && jump.date <= "2019-12-20" && jump.changePct <= -90);
}

export function missingOnCalendar(calendar: readonly string[], present: ReadonlySet<string>): string[] {
  return calendar.filter((date) => !present.has(date));
}

export function triJoinJumps(
  series: string,
  points: readonly DatedValue[],
  boundaries: readonly string[],
  limit = 0.15
): DailyJump[] {
  const jumps = dailyJumps(series, points, limit);
  const cuts = new Set(boundaries);
  return jumps.filter((jump) => cuts.has(jump.previous) || cuts.has(jump.date));
}

/**
 * The NIFTY 1D Rate Index is a level, not an annual percent.
 * Values clustered like a rate (under 100) are a unit error.
 */
export function liquidUnitFindings(points: readonly DatedValue[]): string[] {
  if (!points.length) return ["nifty_1d_rate has no points."];
  const values = points.map((point) => point.value).filter((value) => value > 0).sort((a, b) => a - b);
  if (!values.length) return ["nifty_1d_rate has no positive levels."];
  const median = values[Math.floor(values.length / 2)];
  const findings: string[] = [];
  if (median < 100) {
    findings.push(`nifty_1d_rate median ${median} looks like a rate, not an index level.`);
  }
  const jumps = dailyJumps("nifty_1d_rate", points);
  if (jumps.length) findings.push(`nifty_1d_rate has ${jumps.length} daily moves over 15%.`);
  return findings;
}

export function rebalanceTimingFindings(
  events: readonly { kind: string; signalDate: string; executionDate: string }[],
  sessions: readonly string[]
): string[] {
  const findings: string[] = [];
  for (const event of events) {
    if (event.kind !== "annual" && event.kind !== "drift") continue;
    if (event.kind === "annual" && event.signalDate.slice(5, 7) !== "03") {
      findings.push(`Annual rebalance signal ${event.signalDate} is not a March month-end.`);
    }
    const next = sessions.find((date) => date > event.signalDate);
    if (!next) {
      findings.push(`${event.kind} rebalance ${event.signalDate} has no next session.`);
      continue;
    }
    if (event.executionDate === event.signalDate) {
      findings.push(`${event.kind} rebalance filled on the signal close ${event.signalDate}.`);
    } else if (event.executionDate !== next) {
      findings.push(`${event.kind} rebalance ${event.signalDate} executed on ${event.executionDate} instead of the next session ${next}.`);
    }
  }
  return findings;
}

export function yearlyLargestContributor(
  allocations: readonly { date: string; values: SleeveValues }[],
  labels: Readonly<Record<string, string>>
): { year: string; sleeve: string; name: string; sharePct: number }[] {
  const byYear = new Map<string, { date: string; values: SleeveValues }[]>();
  for (const point of allocations) {
    const year = point.date.slice(0, 4);
    const rows = byYear.get(year) ?? [];
    rows.push(point);
    byYear.set(year, rows);
  }
  const years = [...byYear.keys()].sort();
  return years.map((year, index) => {
    const rows = byYear.get(year)!;
    const end = rows[rows.length - 1];
    const previousYear = index > 0 ? byYear.get(years[index - 1]) : undefined;
    const start = previousYear ? previousYear[previousYear.length - 1] : rows[0];
    let bestSleeve: (typeof SLEEVES)[number] = "nifty50";
    let best = 0;
    let total = 0;
    for (const sleeve of SLEEVES) {
      const gain = Math.max(0, (end.values[sleeve] ?? 0) - (start.values[sleeve] ?? 0));
      total += gain;
      if (gain > best) {
        best = gain;
        bestSleeve = sleeve;
      }
    }
    return {
      year,
      sleeve: bestSleeve,
      name: labels[bestSleeve] ?? bestSleeve,
      sharePct: total > 0 ? (best / total) * 100 : 100,
    };
  });
}
