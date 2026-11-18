import { todayIst } from "@/lib/mlive/calendar";
import { raiseAlert } from "../alerts";
import { holidaySet } from "../load";
import { loadLongtermDataset } from "../longterm/data";
import { simulateLongterm } from "../longterm/simulate";
import {
  countApprovedThisYear,
  insertProposal,
  loadPendingProposal,
  markProposal,
  readProposalGate,
} from "../longterm/proposal-db";
import { afterClose, buildAllocationChange, type AllocationChange } from "../longterm/proposal";
import { DEFAULT_REPRESENTATIVE_ETFS, LONGTERM_VARIANT_NAMES, type LongtermVariantName, type Sleeve } from "../longterm/variants";
import { num, q } from "../db";
import { runJob } from "../run";

export async function longtermProposal(): Promise<void> {
  const gate = await readProposalGate();
  if (!gate.allowed) {
    console.log("longterm-proposal skipped: guard");
    return;
  }
  await runJob("longterm-proposal", async () => runLongtermProposal());
}

export async function runLongtermProposal(): Promise<Record<string, unknown>> {
  const gate = await readProposalGate();
  if (!gate.allowed || !gate.variant) return { skipped: "guard", proposals: 0, decisions: 0 };
  const today = todayIst();
  const holidays = await holidaySet();
  const pending = await loadPendingProposal();
  const approvedThisYear = await countApprovedThisYear(Number(today.slice(0, 4)));
  const change = await loadAllocationChange(gate.variant);
  const result = afterClose({
    allowed: true,
    cap: gate.cap,
    expiryDays: gate.expiryDays,
    today,
    holidays,
    pending,
    approvedThisYear,
    change,
  });
  if (result.expiredId != null) {
    await markProposal(result.expiredId, "expired", "Not approved within the trading-day window.", "engine");
  }
  if (result.created) await insertProposal(result.created);
  if (result.alert) {
    await raiseAlert({ level: "needs_you", code: result.alert.code, message: result.alert.message });
  }
  return {
    skipped: result.created ? null : result.alert?.code ?? (result.expiredId ? "expired" : "unchanged"),
    proposals: result.created ? 1 : 0,
    decisions: result.decisions.length,
  };
}

async function loadAllocationChange(variant: string): Promise<AllocationChange | null> {
  if (!(LONGTERM_VARIANT_NAMES as readonly string[]).includes(variant)) return null;
  const positions = await q<{ symbol: string; qty: unknown; avg_price: unknown }>(
    `SELECT symbol, qty, avg_price
       FROM mlive.mlive_positions
      WHERE book = 'longterm' AND closed_at IS NULL`
  );
  const prices: Record<string, number> = {
    nifty50: DEFAULT_REPRESENTATIVE_ETFS.nifty50.currentPrice,
    secondary: DEFAULT_REPRESENTATIVE_ETFS.secondary.currentPrice,
    gold: DEFAULT_REPRESENTATIVE_ETFS.gold.currentPrice,
  };
  const value: Record<Sleeve, number> = { nifty50: 0, secondary: 0, gold: 0, liquid: 0 };
  for (const row of positions) {
    const sleeve = sleeveFor(variant, String(row.symbol));
    const worth = num(row.qty) * num(row.avg_price);
    if (sleeve) value[sleeve] += worth;
  }
  const book = value.nifty50 + value.secondary + value.gold + value.liquid;
  if (!(book > 0)) return null;
  const dataset = await loadLongtermDataset("heldback", { annotate: false });
  const lastSession = dataset.dates.filter((date) => date >= "2024-01-01").at(-1);
  if (!lastSession) return null;
  const simulated = simulateLongterm(dataset, variant as LongtermVariantName, {
    sample: "heldback",
    window: { from: "2024-01-01", to: lastSession },
  });
  const latest = simulated.allocations.at(-1);
  if (!latest) return null;
  const signal = [...simulated.events].reverse().find((event) => event.reason);
  return buildAllocationChange({
    variant,
    signalDate: signal?.signalDate ?? latest.date,
    reason: signal?.reason ?? "Frozen rules target differs from the current Long Game weights.",
    currentWeights: {
      nifty50: value.nifty50 / book,
      secondary: value.secondary / book,
      gold: value.gold / book,
      liquid: value.liquid / book,
    },
    targetWeights: latest.weights,
    bookValue: book,
    prices,
  });
}

function sleeveFor(variant: string, symbol: string): Sleeve | null {
  if (symbol === DEFAULT_REPRESENTATIVE_ETFS.nifty50.symbol) return "nifty50";
  if (symbol === DEFAULT_REPRESENTATIVE_ETFS.gold.symbol) return "gold";
  const secondary = DEFAULT_REPRESENTATIVE_ETFS.secondary.symbol.split("/");
  if (symbol === secondary[0] && !variant.endsWith("MID")) return "secondary";
  if (symbol === secondary[secondary.length - 1] && variant.endsWith("MID")) return "secondary";
  return null;
}
