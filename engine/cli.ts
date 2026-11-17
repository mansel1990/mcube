import { spawnSync } from "node:child_process";
import v8 from "node:v8";
import { loadEnv } from "./db";
import { researchRespawnArgv } from "./research-spawn";
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
import { momentumEod } from "./jobs/momentum-eod";
import { quotes } from "./jobs/quotes";
import { researchJob } from "./jobs/research";
import { researchQueue } from "./jobs/research-queue";
import { sync } from "./jobs/sync";
import { swingSwitch } from "./jobs/swing-switch";

loadEnv();

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
  "momentum-eod": momentumEod,
  research: () => researchJob(process.argv.slice(3)),
  "research-queue": researchQueue,
  quotes,
  intraday,
  "swing-switch": swingSwitch,
};

const name = process.argv[2];
const job = name ? jobs[name] : undefined;
if (!job) {
  console.error(`Usage: npm run engine -- <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}

const withOptions = name === "market-backfill" || name === "research" || name === "longterm-import";
if (!withOptions && process.argv.length > 3) {
  console.error(`${name} does not take options`);
  process.exit(1);
}

if ((name === "research" || name === "research-queue") && process.env.MLIVE_RESEARCH_HEAP !== "1") {
  if (v8.getHeapStatistics().heap_size_limit < 560 * 1024 * 1024) {
    const child = spawnSync(process.execPath, researchRespawnArgv(process.execArgv, process.argv), {
      stdio: "inherit",
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=600", MLIVE_RESEARCH_HEAP: "1" },
    });
    process.exit(child.status ?? 1);
  }
}

let run: () => Promise<void> = job;
if (name === "market-backfill") {
  try {
    const args = parseMarketArgs(process.argv.slice(3));
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
