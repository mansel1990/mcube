import { loadEnv } from "./db";
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
import { sync } from "./jobs/sync";

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
};

const name = process.argv[2];
const job = name ? jobs[name] : undefined;
if (!job) {
  console.error(`Usage: npm run engine -- <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}

job().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
