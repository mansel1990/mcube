import type { LongtermSeriesKey } from "./data";

export const LONGTERM_VARIANT_NAMES = [
  "STATIC-NEXT",
  "STATIC-MID",
  "RADAR-NEXT",
  "RADAR-MID",
] as const;

export type LongtermVariantName = (typeof LONGTERM_VARIANT_NAMES)[number];
export type RiskySleeve = "nifty50" | "secondary" | "gold";
export type Sleeve = RiskySleeve | "liquid";

export type LongtermVariant = {
  name: LongtermVariantName;
  kind: "static" | "radar";
  secondary: "next" | "mid";
  benchmark: "STATIC-NEXT" | "STATIC-MID";
  series: Record<Sleeve, LongtermSeriesKey>;
  targets: Record<Sleeve, number>;
};

export type LongtermCostConfig = {
  slippagePct: number;
  transactionCostPct: number;
};

export type LongtermDragConfig = Record<RiskySleeve, number>;

export type LongtermTaxConfig = {
  asOf: string;
  equity: { longTermDays: number; shortRate: number; longRate: number; annualExemption: number };
  nonEquity: { longTermDays: number; shortRate: number; longRate: number };
};

export type RepresentativeEtfConfig = Record<RiskySleeve, {
  symbol: string;
  currentPrice: number;
  historyNote: string;
}>;

const TARGETS: Record<Sleeve, number> = {
  nifty50: 0.4,
  secondary: 0.2,
  gold: 0.25,
  liquid: 0.15,
};

function variant(
  name: LongtermVariantName,
  kind: "static" | "radar",
  secondary: "next" | "mid"
): LongtermVariant {
  return {
    name,
    kind,
    secondary,
    benchmark: secondary === "next" ? "STATIC-NEXT" : "STATIC-MID",
    series: {
      nifty50: "nifty50_tri",
      secondary: secondary === "next" ? "nifty_next50_tri" : "nifty_midcap150_tri",
      gold: "goldbees_nav",
      liquid: "nifty_1d_rate",
    },
    targets: { ...TARGETS },
  };
}

export const LONGTERM_VARIANTS: Record<LongtermVariantName, LongtermVariant> = {
  "STATIC-NEXT": variant("STATIC-NEXT", "static", "next"),
  "STATIC-MID": variant("STATIC-MID", "static", "mid"),
  "RADAR-NEXT": variant("RADAR-NEXT", "radar", "next"),
  "RADAR-MID": variant("RADAR-MID", "radar", "mid"),
};

export const DEFAULT_LONGTERM_COSTS: LongtermCostConfig = {
  slippagePct: 0.0005,
  transactionCostPct: 0.001,
};

// TRI sleeves are reduced by explicit investable-product tracking/expense drag.
export const DEFAULT_LONGTERM_DRAG: LongtermDragConfig = {
  nifty50: 0.002,
  secondary: 0.003,
  gold: 0.006,
};

// Configurable current-law stress only; it is not a reconstruction of historical tax law.
export const DEFAULT_LONGTERM_TAX: LongtermTaxConfig = {
  asOf: "2026-11-17",
  equity: { longTermDays: 365, shortRate: 0.2, longRate: 0.125, annualExemption: 125_000 },
  nonEquity: { longTermDays: 365, shortRate: 0.3, longRate: 0.125 },
};

export const DEFAULT_REPRESENTATIVE_ETFS: RepresentativeEtfConfig = {
  nifty50: {
    symbol: "NIFTYBEES",
    currentPrice: 300,
    historyNote: "Current representative unit price rescaled to the index history; not a claim of pre-launch tradeability.",
  },
  secondary: {
    symbol: "JUNIORBEES/MID150BEES",
    currentPrice: 850,
    historyNote: "Variant-appropriate current representative unit price rescaled to the index history.",
  },
  gold: {
    symbol: "GOLDBEES",
    currentPrice: 120,
    historyNote: "Current representative unit price rescaled to adjusted Gold BeES NAV history.",
  },
};

export function getLongtermVariant(name: string): LongtermVariant {
  if (!(LONGTERM_VARIANT_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown Long Game variant ${name}. Expected ${LONGTERM_VARIANT_NAMES.join(", ")}.`);
  }
  return LONGTERM_VARIANTS[name as LongtermVariantName];
}
