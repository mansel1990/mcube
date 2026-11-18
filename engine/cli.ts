import { spawnSync } from "node:child_process";
import v8 from "node:v8";
import { loadEnv } from "./db";
import { jobHeapMb, researchRespawnArgv, takeHeapFlag } from "./research-spawn";
import { approvals } from "./jobs/approvals";
import { buys } from "./jobs/buys";
import { cancel } from "./jobs/cancel";
import { eod, eodFinal } from "./jobs/eod";
import { eodStops } from "./jobs/eod-stops";
import { resetDry } from "./jobs/reset-dry";
import { importIdeas } from "./jobs/import-ideas";
import { preflight } from "./jobs/preflight";
import { refresh } from "./jobs/refresh";
import { remind } from "./jobs/remind";
import { sells } from "./jobs/sells";
import { intraday } from "./jobs/intraday";
import { marketBackfill, marketDaily, parseMarketArgs } from "./jobs/market";
import { marketCheck } from "./jobs/market-check";
import { longtermImport } from "./jobs/longterm-import";
import { longtermProposal } from "./jobs/longterm-proposal";
import { longtermVerify } from "./longterm/verify";
import { momentumEod } from "./jobs/momentum-eod";
import { quotes } from "./jobs/quotes";
import { researchJob } from "./jobs/research";
import { researchQueue } from "./jobs/research-queue";
import { sync } from "./jobs/sync";
import { swingSwitch } from "./jobs/swing-switch";

loadEnv();

let argv = process.argv;
let requestedHeap: number | null = null;
if (process.argv[2] === "research") {
  try {
    const taken = takeHeapFlag(process.argv);
    argv = taken.argv;
    requestedHeap = taken.heapMb;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const jobs: Record<string, () => Promise<void>> = {
  "import-ideas": importIdeas,
  "eod-stops": eodStops,
  remind,
  preflight,
  sells,
  refresh,
  buys,
  approvals,
  sync,
  cancel,
  eod,
  "eod-final": eodFinal,
  "reset-dry": resetDry,
  "market-backfill": marketBackfill,
  "market-daily": marketDaily,
  "market-check": marketCheck,
  "longterm-import": () => longtermImport(process.argv.slice(3)),
  "longterm-proposal": longtermProposal,
  "longterm-verify": () => longtermVerify(argv.slice(3)),
  "momentum-eod": momentumEod,
  research: () => researchJob(argv.slice(3)),
  "research-queue": researchQueue,
  quotes,
  intraday,
  "swing-switch": swingSwitch,
};

const name = argv[2];
const job = name ? jobs[name] : undefined;
if (!job) {
  console.error(`Usage: npm run engine -- <${Object.keys(jobs).join("|")}>`);
  console.error("research --heap <MB> raises only that manual run (600–8192). Queue and cron stay at 600. Example: --heap 2200");
  process.exit(1);
}

const withOptions = name === "market-backfill" || name === "research" || name === "longterm-import" || name === "longterm-verify";
if (!withOptions && argv.length > 3) {
  console.error(`${name} does not take options`);
  process.exit(1);
}

const minuteBackfill = name === "market-backfill" && argv.some((arg) => arg === "1m-files" || arg.endsWith("=1m-files"));
const heapMb = jobHeapMb(name, requestedHeap, minuteBackfill);
if (heapMb && process.env.MLIVE_RESEARCH_HEAP !== "1" && process.env.MLIVE_JOB_HEAP !== "1") {
  const limit = v8.getHeapStatistics().heap_size_limit;
  if (limit < (heapMb - 40) * 1024 * 1024) {
    const child = spawnSync(process.execPath, researchRespawnArgv(process.execArgv, argv), {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${heapMb}`,
        MLIVE_RESEARCH_HEAP: "1",
        MLIVE_JOB_HEAP: "1",
      },
    });
    process.exit(child.status ?? 1);
  }
}

let run: () => Promise<void> = job;
if (name === "market-backfill") {
  try {
    const args = parseMarketArgs(argv.slice(3));
    run = () => marketBackfill(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
