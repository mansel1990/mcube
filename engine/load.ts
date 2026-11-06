import { DEFAULT_CHARGE_RATES, type ChargeRates } from "@/lib/mlive/charges";
import { EXIT_EMA, EXIT_RS, type ExitParams } from "@/lib/mlive/rules";
import { asDate, jsonValue, num, q } from "./db";

export type MliveSettings = {
  riskPct: number;
  maxOrderPct: number;
  minOrderInr: number;
  cashReserve: number;
  maxBuys: number;
  maxNewBuys: number;
  maxBuysPerStrategy: number;
  maxOpenPerStrategy: number;
  maxDailyDeployPct: number;
  maxSells: number;
  maxOpen: number;
  maxPerSector: number;
  breakerPct: number;
  chasePct: number;
  limitOffset: number;
  exclude: string[];
  strategies: Array<"rs" | "ema">;
  dryRun: boolean;
  exitRs: ExitParams;
  exitEma: ExitParams;
  reviewDays: number;
  reviewAnchor: string;
  loginReminder: boolean;
  charges: ChargeRates;
};

export type MliveState = {
  status: "active" | "paused_by_user" | "paused_by_breaker" | "halted_today";
  mode: "approve" | "auto" | "paused";
  peak: number;
  peakDate: string | null;
  lastEod: string | null;
  updatedAt: string | null;
  haltReason: string | null;
};

function asExit(value: unknown, fallback: ExitParams): ExitParams {
  if (!value || typeof value !== "object") return fallback;
  return { ...fallback, ...(value as ExitParams) };
}

export async function loadSettings(): Promise<MliveSettings> {
  const rows = await q<{ key: string; value: unknown }>(`SELECT key, value FROM mlive.mlive_settings`);
  const map = new Map(rows.map((row) => [row.key, jsonValue(row.value)]));
  const strategies = Array.isArray(map.get("strategies_enabled"))
    ? (map.get("strategies_enabled") as string[]).filter((s): s is "rs" | "ema" => s === "rs" || s === "ema")
    : (["rs", "ema"] as const);
  const chargesRaw = map.get("charges");
  return {
    riskPct: num(map.get("risk_pct") ?? 0.01),
    maxOrderPct: num(map.get("max_order_pct") ?? 0.25),
    minOrderInr: num(map.get("min_order_inr") ?? 8000),
    cashReserve: num(map.get("cash_reserve_inr") ?? 500),
    maxBuys: num(map.get("max_buys_per_day") ?? 4),
    maxNewBuys: num(map.get("max_new_buys_per_day") ?? 2),
    maxBuysPerStrategy: num(map.get("max_buys_per_strategy_per_day") ?? 2),
    maxOpenPerStrategy: num(map.get("max_open_per_strategy") ?? 4),
    maxDailyDeployPct: num(map.get("max_daily_deploy_pct") ?? 0.5),
    maxSells: num(map.get("max_sells_per_day") ?? 4),
    maxOpen: num(map.get("max_open_positions") ?? 6),
    maxPerSector: num(map.get("max_per_sector") ?? 2),
    breakerPct: num(map.get("breaker_pct") ?? 0.25),
    chasePct: num(map.get("chase_pct") ?? 0.03),
    limitOffset: num(map.get("limit_offset_pct") ?? 0.005),
    exclude: Array.isArray(map.get("exclude_symbols")) ? (map.get("exclude_symbols") as string[]) : ["NIFTYBEES"],
    strategies: [...strategies],
    dryRun: map.get("dry_run") !== false,
    exitRs: asExit(map.get("exit.rs"), EXIT_RS),
    exitEma: asExit(map.get("exit.ema"), EXIT_EMA),
    reviewDays: num(map.get("review_every_days") ?? 60),
    reviewAnchor: String(map.get("review_anchor_date") ?? "2026-11-05"),
    loginReminder: map.get("login_reminder") !== false,
    charges: { ...DEFAULT_CHARGE_RATES, ...(chargesRaw && typeof chargesRaw === "object" ? (chargesRaw as ChargeRates) : {}) },
  };
}

export async function loadState(): Promise<MliveState> {
  const rows = await q(`SELECT status, mode, peak_value, peak_date::text AS peak_date, last_eod_date::text AS last_eod_date, updated_at, halt_reason FROM mlive.mlive_state WHERE id = 1`);
  const row = rows[0];
  if (!row) throw new Error("mlive_state is missing");
  return {
    status: row.status as MliveState["status"],
    mode: row.mode as MliveState["mode"],
    peak: num(row.peak_value),
    peakDate: asDate(row.peak_date),
    lastEod: asDate(row.last_eod_date),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    haltReason: row.halt_reason == null ? null : String(row.halt_reason),
  };
}

export async function fundBalance(includeDry = false): Promise<number> {
  const rows = await q<{ total: unknown }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM mlive.mlive_fund_ledger WHERE ($1::boolean OR dry_run = false)`,
    [includeDry]
  );
  return num(rows[0]?.total);
}

export async function holidaySet(): Promise<Set<string>> {
  const rows = await q<{ trade_date: unknown }>(`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`);
  return new Set(rows.map((row) => asDate(row.trade_date)).filter((d): d is string => !!d));
}

export async function setState(patch: Partial<Pick<MliveState, "status" | "mode" | "peak" | "peakDate" | "lastEod" | "haltReason">>): Promise<void> {
  const current = await loadState();
  await q(
    `UPDATE mlive.mlive_state
        SET status = $1, mode = $2, peak_value = $3, peak_date = $4, last_eod_date = $5, halt_reason = $6, updated_at = now()
      WHERE id = 1`,
    [
      patch.status ?? current.status,
      patch.mode ?? current.mode,
      patch.peak ?? current.peak,
      patch.peakDate === undefined ? current.peakDate : patch.peakDate,
      patch.lastEod === undefined ? current.lastEod : patch.lastEod,
      patch.haltReason === undefined ? current.haltReason : patch.haltReason,
    ]
  );
}
