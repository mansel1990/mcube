import { LONGTERM_FROZEN_V3 } from "./rules";

export const FROZEN_V3_OVERRIDE = LONGTERM_FROZEN_V3.version;
export const FROZEN_V3_VARIANTS = ["STATIC-MID", "RADAR-MID"] as const;

export function sameVariantSet(left: readonly string[] | null | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return right.every((name) => left.includes(name));
}

export function containsFrozenPair(variants: readonly string[]): boolean {
  return FROZEN_V3_VARIANTS.every((name) => variants.includes(name));
}

export function frozenV3OverrideCommand(input: {
  book: string;
  sample: string;
  confirmHeldback: boolean;
  ownerOverride?: string | null;
  grid: boolean;
  variants?: readonly string[] | null;
}): boolean {
  return input.book === "longterm"
    && input.sample === "heldback"
    && input.confirmHeldback
    && input.ownerOverride === FROZEN_V3_OVERRIDE
    && input.grid === false
    && sameVariantSet(input.variants, FROZEN_V3_VARIANTS);
}

/** A running row blocks a second attempt. Only a committed ok run with both result rows consumes the override. */
export function overrideBlocksSecondUse(input: { consumed: boolean; runningLease: boolean; force: boolean }): string | null {
  if (input.runningLease) return "A longgame-frozen-v3 held-back inspection is already running.";
  if (input.consumed && !input.force) return "The longgame-frozen-v3 held-back override has already been used.";
  return null;
}

export function overrideConsumedByCommit(status: string, variants: readonly string[]): boolean {
  return status === "ok" && containsFrozenPair(variants) && sameVariantSet(
    variants.filter((name) => (FROZEN_V3_VARIANTS as readonly string[]).includes(name)),
    FROZEN_V3_VARIANTS,
  );
}

/** v3 live rule. The old "qualifies for live design" conclusion is not used. */
export function radarQualifiesV3(input: {
  variants: readonly string[];
  radarMaxDrawdownPct: number;
  staticMaxDrawdownPct: number;
}): boolean {
  return containsFrozenPair(input.variants)
    && input.radarMaxDrawdownPct <= LONGTERM_FROZEN_V3.radarActivation.maxDrawdownPct
    && input.radarMaxDrawdownPct < input.staticMaxDrawdownPct;
}

export function overrideRecord(consumed: boolean): {
  rulesVersion: typeof FROZEN_V3_OVERRIDE;
  override: typeof FROZEN_V3_OVERRIDE;
  requestedVariants: readonly ["STATIC-MID", "RADAR-MID"];
  ownerAuthorizationReason: string;
  consumed: boolean;
  inspectionOnly: true;
  originalFailedBuildingChecks: readonly string[];
} {
  return {
    rulesVersion: FROZEN_V3_OVERRIDE,
    override: FROZEN_V3_OVERRIDE,
    requestedVariants: FROZEN_V3_VARIANTS,
    ownerAuthorizationReason: LONGTERM_FROZEN_V3.ownerReason,
    consumed,
    inspectionOnly: true,
    originalFailedBuildingChecks: LONGTERM_FROZEN_V3.originalFailedBuildingChecks,
  };
}
