import { todayIst } from "@/lib/mlive/calendar";
import { importLongtermData, LONGTERM_BUILDING_TO, LONGTERM_HELD_BACK_FROM, LONGTERM_WARMUP_FROM } from "../longterm/data";

export async function longtermImport(argv: readonly string[]): Promise<void> {
  let from = LONGTERM_WARMUP_FROM;
  let to = LONGTERM_BUILDING_TO;
  let heldback = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--from") from = dateArg(argv[++index], flag);
    else if (flag === "--to") to = dateArg(argv[++index], flag);
    else if (flag === "--heldback") heldback = true;
    else throw new Error(`Unknown longterm-import option ${flag}`);
  }
  if (heldback) {
    if (!argv.includes("--from")) from = LONGTERM_HELD_BACK_FROM;
    if (!argv.includes("--to")) to = todayIst();
  }
  await importLongtermData({ from, to, heldback });
  console.log(`longterm-import complete ${from} through ${to}`);
}

function dateArg(value: string | undefined, flag: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${flag} needs YYYY-MM-DD`);
  return value;
}
