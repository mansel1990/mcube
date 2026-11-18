import type { ResearchBook, ResearchSample } from "@/lib/mlive/research-bar";
import { FROZEN_V3_OVERRIDE, FROZEN_V3_VARIANTS, sameVariantSet } from "../longterm/override";
import { LONGTERM_VARIANT_NAMES, type LongtermVariantName } from "../longterm/variants";
import { SWING_VARIANTS, type SwingVariantName } from "./swing-variants";

export type ResearchVariantName = SwingVariantName | LongtermVariantName;

export type ResearchArgs = {
  book: ResearchBook;
  strategies?: string[];
  variants?: ResearchVariantName[];
  sample: ResearchSample;
  /** With --heldback, allows the held-back window. Once per strategy or variant unless --force. */
  confirmHeldback: boolean;
  force: boolean;
  grid: boolean;
  only?: string[];
  /** Skip the trading-hour window. Refused on mcube-server. The queue never sets this. */
  anytime: boolean;
  /** Exact longgame-frozen-v3 value, or null when the flag is absent. */
  ownerOverride?: string | null;
};

export function parseResearchArgs(argv: readonly string[]): ResearchArgs {
  let book: ResearchBook | null = null;
  let strategies: string[] | undefined;
  let requestedVariants: string[] | undefined;
  let sample: ResearchSample = "building";
  let confirmHeldback = false;
  let force = false;
  let grid = true;
  let only: string[] | undefined;
  let anytime = false;
  let ownerOverride: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--heldback") sample = "heldback";
    else if (arg === "--confirm-heldback") confirmHeldback = true;
    else if (arg === "--sample") sample = readSample(argv[++i], arg);
    else if (arg === "--force") force = true;
    else if (arg === "--anytime") anytime = true;
    else if (arg === "--no-grid") grid = false;
    else if (arg === "--book") book = readBook(argv[++i], arg);
    else if (arg === "--strategy") strategies = readList(argv[++i], arg);
    else if (arg === "--variant") {
      requestedVariants = [...new Set(readList(argv[++i], arg))];
    }
    else if (arg === "--only") only = readList(argv[++i], arg).map((symbol) => symbol.toUpperCase());
    else if (arg === "--owner-override") ownerOverride = readToken(argv[++i], arg);
    else throw new Error(`Unknown research option ${arg}`);
  }
  if (!book) throw new Error("research needs --book swing|intraday|longterm");
  if (requestedVariants?.length && book === "intraday") throw new Error("--variant is supported only with --book swing or longterm");
  let variants: ResearchVariantName[] | undefined;
  if (requestedVariants?.length) {
    const valid = book === "longterm" ? LONGTERM_VARIANT_NAMES as readonly string[] : book === "swing" ? SWING_VARIANTS as readonly string[] : [];
    const unknown = requestedVariants.filter((value) => !valid.includes(value));
    if (unknown.length) throw new Error(`Unknown ${book} variant: ${unknown.join(", ")}. Valid variants: ${valid.join(", ") || "none"}`);
    variants = requestedVariants as ResearchVariantName[];
  }
  if (variants?.length && grid) throw new Error("--variant requires --no-grid");
  if (variants?.length && strategies?.length) throw new Error("Use --variant without --strategy; each variant declares its strategy inputs");
  if (book === "intraday" && sample === "heldback") {
    throw new Error("Intraday held-back is closed. This command will not read it.");
  }
  if (sample === "diagnostic" && book !== "intraday") {
    throw new Error("--sample diagnostic is only for an intraday study.");
  }
  if (ownerOverride && book !== "longterm") throw new Error("--owner-override is only for Long Game.");
  if (book === "longterm") {
    if (grid) throw new Error("Long Game is frozen and requires --no-grid");
    if (strategies?.length) throw new Error("Long Game uses --variant, not --strategy");
    if (only?.length) throw new Error("Long Game does not support --only");
    if (ownerOverride && ownerOverride !== FROZEN_V3_OVERRIDE) {
      throw new Error("Long Game owner override must be exactly longgame-frozen-v3.");
    }
    if (ownerOverride && sample !== "heldback") {
      throw new Error("The longgame-frozen-v3 override is only for a held-back inspection.");
    }
    if (sample === "heldback") {
      if (!confirmHeldback) throw new Error("Long Game held-back requires --confirm-heldback.");
      if (ownerOverride) {
        const requested = variants ?? [];
        if (!sameVariantSet(requested, FROZEN_V3_VARIANTS)) {
          throw new Error("The longgame-frozen-v3 override runs exactly STATIC-MID,RADAR-MID.");
        }
        variants = [...FROZEN_V3_VARIANTS];
      } else {
        const requested = variants ?? [...LONGTERM_VARIANT_NAMES];
        if (requested.length !== LONGTERM_VARIANT_NAMES.length || LONGTERM_VARIANT_NAMES.some((name) => !requested.includes(name))) {
          throw new Error("Long Game held-back runs exactly all four frozen variants together.");
        }
        variants = [...LONGTERM_VARIANT_NAMES];
      }
    } else {
      variants ??= [...LONGTERM_VARIANT_NAMES];
    }
  }
  return { book, strategies, variants, sample, confirmHeldback, force, grid, only, anytime, ownerOverride };
}

/** The overnight queue keeps the trading-hour window, even if a payload asks to skip it. */
export function queueResearchArgs(args: Omit<ResearchArgs, "anytime"> & { anytime?: boolean }): ResearchArgs {
  return {
    book: args.book,
    strategies: args.strategies,
    variants: args.variants,
    sample: args.sample,
    confirmHeldback: args.confirmHeldback,
    force: args.force,
    grid: args.grid,
    only: args.only,
    anytime: false,
    ownerOverride: args.ownerOverride ?? null,
  };
}

function readBook(value: string | undefined, flag: string): ResearchBook {
  if (value === "swing" || value === "intraday" || value === "longterm") return value;
  throw new Error(`${flag} needs swing, intraday, or longterm`);
}

function readSample(value: string | undefined, flag: string): ResearchSample {
  if (value === "building" || value === "heldback" || value === "diagnostic") return value;
  throw new Error(`${flag} needs building, heldback, or diagnostic`);
}

function readToken(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

function readList(value: string | undefined, flag: string): string[] {
  const list = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) throw new Error(`${flag} needs a value`);
  return list;
}
