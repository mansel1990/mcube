export type StoredMetrics = Record<string, unknown>;

export type ComparisonCell = string | null;

export type ComparisonRow = {
  metric: string;
  buildingCore: ComparisonCell;
  buildingRadar: ComparisonCell;
  heldCore: ComparisonCell;
  heldRadar: ComparisonCell;
};

function record(value: unknown): StoredMetrics | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StoredMetrics : null;
}

function numberAt(source: StoredMetrics | null, path: string[]): number | null {
  let current: unknown = source;
  for (const key of path) {
    const row = record(current);
    if (!row || !(key in row)) return null;
    current = row[key];
  }
  const parsed = typeof current === "number" ? current : typeof current === "string" ? Number(current) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value: number | null, digits = 2): string | null {
  return value == null ? null : `${value.toFixed(digits)}%`;
}

function plain(value: number | null, digits = 1): string | null {
  return value == null ? null : value.toFixed(digits);
}

export type VariantMetrics = { metrics: StoredMetrics | null; stresses: StoredMetrics | null };

function afterTax(row: VariantMetrics | undefined): string | null {
  return percent(numberAt(row?.stresses ?? null, ["currentTax", "cagrPct"]));
}

function drawdown(row: VariantMetrics | undefined): number | null {
  return numberAt(row?.metrics ?? null, ["maxDrawdown", "pct"]);
}

export function longGameComparison(input: {
  buildingCore?: VariantMetrics;
  buildingRadar?: VariantMetrics;
  heldCore?: VariantMetrics;
  heldRadar?: VariantMetrics;
}): ComparisonRow[] {
  const recovery = (row: VariantMetrics | undefined) => {
    const date = record(row?.metrics ?? null)?.maxDrawdown;
    const value = record(date)?.recoveryDate;
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  const moves = (row: VariantMetrics | undefined) => plain(numberAt(row?.metrics ?? null, ["eventsPerYear"]), 1);
  return [
    {
      metric: "Return/year after tax",
      buildingCore: afterTax(input.buildingCore),
      buildingRadar: afterTax(input.buildingRadar),
      heldCore: afterTax(input.heldCore),
      heldRadar: afterTax(input.heldRadar),
    },
    {
      metric: "Worst fall",
      buildingCore: percent(drawdown(input.buildingCore), 1),
      buildingRadar: percent(drawdown(input.buildingRadar), 1),
      heldCore: percent(drawdown(input.heldCore), 1),
      heldRadar: percent(drawdown(input.heldRadar), 1),
    },
    {
      metric: "Recovery",
      buildingCore: recovery(input.buildingCore),
      buildingRadar: recovery(input.buildingRadar),
      heldCore: recovery(input.heldCore),
      heldRadar: recovery(input.heldRadar),
    },
    {
      metric: "Moves/year",
      buildingCore: moves(input.buildingCore),
      buildingRadar: moves(input.buildingRadar),
      heldCore: moves(input.heldCore),
      heldRadar: moves(input.heldRadar),
    },
  ];
}

export function radarDecisionSentence(coreDrawdown: number | null, radarDrawdown: number | null): string | null {
  if (coreDrawdown == null || radarDrawdown == null) return null;
  const qualified = radarDrawdown <= 15 && radarDrawdown < coreDrawdown;
  if (qualified) return `Radar drawdown was ${radarDrawdown.toFixed(1)}%, under 15% and lower than Core's ${coreDrawdown.toFixed(1)}%.`;
  return `Radar needed a drawdown no higher than 15% and lower than Core. It reached ${radarDrawdown.toFixed(1)}%, versus Core's ${coreDrawdown.toFixed(1)}%, so it did not qualify.`;
}

export function goldContributionNote(metrics: StoredMetrics | null): string | null {
  const share = numberAt(metrics, ["contributionApprox", "gold"]);
  if (share == null) return null;
  const pct = share <= 1 ? share * 100 : share;
  return `${Math.round(pct)}% of Radar's profit came from gold, indicating concentrated contribution.`;
}
