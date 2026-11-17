import type { ResearchBook, ResearchSample } from "@/lib/mlive/research-bar";
import { isSwingVariant, SWING_VARIANTS, type SwingVariantName } from "./swing-variants";

export type ResearchArgs = {
  book: ResearchBook;
  strategies?: string[];
  variants?: SwingVariantName[];
  sample: ResearchSample;
  force: boolean;
  grid: boolean;
  only?: string[];
  /** Skip the trading-hour window. Refused on mcube-server. The queue never sets this. */
  anytime: boolean;
};

export function parseResearchArgs(argv: readonly string[]): ResearchArgs {
  let book: ResearchBook | null = null;
  let strategies: string[] | undefined;
  let variants: SwingVariantName[] | undefined;
  let sample: ResearchSample = "building";
  let force = false;
  let grid = true;
  let only: string[] | undefined;
  let anytime = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--heldback") sample = "heldback";
    else if (arg === "--force") force = true;
    else if (arg === "--anytime") anytime = true;
    else if (arg === "--no-grid") grid = false;
    else if (arg === "--book") book = readBook(argv[++i], arg);
    else if (arg === "--strategy") strategies = readList(argv[++i], arg);
    else if (arg === "--variant") {
      const requested = readList(argv[++i], arg);
      const unknown = requested.filter((value) => !isSwingVariant(value));
      if (unknown.length) throw new Error(`Unknown swing variant: ${unknown.join(", ")}. Valid variants: ${SWING_VARIANTS.join(", ")}`);
      variants = [...new Set(requested)] as SwingVariantName[];
    }
    else if (arg === "--only") only = readList(argv[++i], arg).map((symbol) => symbol.toUpperCase());
    else throw new Error(`Unknown research option ${arg}`);
  }
  if (!book) throw new Error("research needs --book swing|intraday");
  if (variants?.length && book !== "swing") throw new Error("--variant is supported only with --book swing");
  if (variants?.length && grid) throw new Error("--variant requires --no-grid");
  if (variants?.length && strategies?.length) throw new Error("Use --variant without --strategy; each variant declares its strategy inputs");
  return { book, strategies, variants, sample, force, grid, only, anytime };
}

/** The overnight queue keeps the trading-hour window, even if a payload asks to skip it. */
export function queueResearchArgs(args: Omit<ResearchArgs, "anytime"> & { anytime?: boolean }): ResearchArgs {
  return {
    book: args.book,
    strategies: args.strategies,
    variants: args.variants,
    sample: args.sample,
    force: args.force,
    grid: args.grid,
    only: args.only,
    anytime: false,
  };
}

function readBook(value: string | undefined, flag: string): ResearchBook {
  if (value === "swing" || value === "intraday") return value;
  throw new Error(`${flag} needs swing or intraday`);
}

function readList(value: string | undefined, flag: string): string[] {
  const list = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) throw new Error(`${flag} needs a value`);
  return list;
}
