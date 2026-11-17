import type { ResearchBook, ResearchSample } from "@/lib/mlive/research-bar";

export type ResearchArgs = {
  book: ResearchBook;
  strategies?: string[];
  sample: ResearchSample;
  force: boolean;
  grid: boolean;
  only?: string[];
};

export function parseResearchArgs(argv: readonly string[]): ResearchArgs {
  let book: ResearchBook | null = null;
  let strategies: string[] | undefined;
  let sample: ResearchSample = "building";
  let force = false;
  let grid = true;
  let only: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--heldback") sample = "heldback";
    else if (arg === "--force") force = true;
    else if (arg === "--no-grid") grid = false;
    else if (arg === "--book") book = readBook(argv[++i], arg);
    else if (arg === "--strategy") strategies = readList(argv[++i], arg);
    else if (arg === "--only") only = readList(argv[++i], arg).map((symbol) => symbol.toUpperCase());
    else throw new Error(`Unknown research option ${arg}`);
  }
  if (!book) throw new Error("research needs --book swing|intraday");
  return { book, strategies, sample, force, grid, only };
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
