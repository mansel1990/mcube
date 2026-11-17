/**
 * Manual research heap. The queue and cron stay at 600 MB.
 * A swing held-back run needs about 2200 MB: `npm run engine -- research --heap 2200 ...`
 */
export function takeHeapFlag(argv: readonly string[]): { heapMb: number | null; argv: string[] } {
  const kept: string[] = [];
  let heapMb: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--heap") {
      heapMb = parseHeapMb(argv[++i]);
      continue;
    }
    if (arg.startsWith("--heap=")) {
      heapMb = parseHeapMb(arg.slice("--heap=".length));
      continue;
    }
    kept.push(arg);
  }
  return { heapMb, argv: kept };
}

function parseHeapMb(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error("--heap needs a whole number of megabytes, for example --heap 2200. The queue and cron stay at 600.");
  }
  const heap = Number(value);
  if (heap < 600 || heap > 8192) {
    throw new Error("--heap must be from 600 to 8192. The queue and cron stay at 600.");
  }
  return heap;
}

/** Queue and cron are always 600. A manual research run may pass --heap. One-minute backfill stays at 600. */
export function jobHeapMb(job: string, requested: number | null, minuteBackfill: boolean): number | null {
  if (job === "research-queue") return 600;
  if (job === "research") return requested ?? 600;
  if (job === "market-backfill" && minuteBackfill) return 600;
  return null;
}

/**
 * Argv for a research child process. The parent is often `tsx`, whose loader
 * lives in `execArgv` (`--import`) and is not part of `argv`.
 */
export function researchRespawnArgv(execArgv: readonly string[], argv: readonly string[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];
    if (arg === "--max-old-space-size") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--max-old-space-size=")) continue;
    kept.push(arg);
  }
  return [...kept, ...argv.slice(1)];
}
