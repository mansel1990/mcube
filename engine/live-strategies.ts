import type { Strategy } from "@/lib/mlive/rules";

export type LiveSwingPolicy = {
  strategy: Strategy;
  maxOrderPct: number;
  minOrderInr: number;
  maxOpen: number;
  maxGrossExposurePct: number | null;
  sizeToCap: boolean;
  priceStop: boolean;
};

export const M10_6_POLICY: LiveSwingPolicy = Object.freeze({
  strategy: "momentum",
  maxOrderPct: 0.1,
  minOrderInr: 4_000,
  maxOpen: 6,
  maxGrossExposurePct: 0.6,
  sizeToCap: true,
  priceStop: false,
});

export function liveSwingPolicy(
  strategy: Strategy,
  defaults: { maxOrderPct: number; minOrderInr: number; maxOpen: number }
): LiveSwingPolicy {
  if (strategy === "momentum") return M10_6_POLICY;
  return {
    strategy,
    maxOrderPct: defaults.maxOrderPct,
    minOrderInr: defaults.minOrderInr,
    maxOpen: defaults.maxOpen,
    maxGrossExposurePct: null,
    sizeToCap: false,
    priceStop: true,
  };
}

export function requiresProtectiveGtt(strategy: Strategy | null): boolean {
  return strategy !== "momentum";
}
