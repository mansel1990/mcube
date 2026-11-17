export const SWING_VARIANTS = [
  "M15-control",
  "M10-6",
  "M10-8",
  "M10-10",
  "M-vol8",
  "TB+M10",
] as const;

export type SwingVariantName = (typeof SWING_VARIANTS)[number];

export function isSwingVariant(value: string): value is SwingVariantName {
  return (SWING_VARIANTS as readonly string[]).includes(value);
}

export function strategiesForSwingVariants(variants: readonly SwingVariantName[]): string[] {
  const names = new Set<string>(["momentum"]);
  if (variants.includes("TB+M10")) names.add("trend_breakout");
  return [...names];
}
