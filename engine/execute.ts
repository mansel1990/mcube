import {
  guardOrder,
  type GuardContext,
} from "@/engine/guard";
import { todayIst } from "@/lib/mlive/calendar";
import { coversDecision, deployBaseline, engineSpendable, gttExitPlan, isChasing, isExcluded, limitCrossed, makeTag, roundTick, sizeOrder, spendableCash, systemCash } from "@/lib/mlive/rules";
import { audit } from "./audit";
import { raiseAlert } from "./alerts";
import {
  applyFill,
  decisionsFor,
  ensurePositionGtt,
  buyPace,
  openCost,
  openPositions,
  pendingBuyValue,
  recordExitOrder,
  recordOrder,
  saveDeployBaseline,
  rejectIsKnown,
  sentCounts,
  shortId,
  type Decision,
} from "./book";
import { num, q } from "./db";
import { MliveKite } from "./kite";
import { fundBalance, loadSettings, loadState, setState, type MliveSettings, type MliveState } from "./load";
import { livePrice } from "./market";

type SendOpts = { side: "BUY" | "SELL"; chase: boolean; runId: number };

export async function sendReady(opts: SendOpts): Promise<Record<string, unknown>> {
  const settings = await loadSettings();
  const state = await loadState();
  if (state.mode === "paused" || state.status !== "active") {
    return { skipped: state.status, mode: state.mode };
  }
  const kite = new MliveKite(settings.dryRun);
  const day = (await import("@/lib/mlive/calendar")).todayIst();
  const decisions = (await decisionsFor(day, opts.side)).filter((row) =>
    state.mode === "auto" ? row.outcome === "proposed" || row.outcome === "approved" : row.outcome === "approved"
  );
  const counts = await sentCounts(day);
  let buysSent = counts.buys;
  let sellsSent = counts.sells;
  const max = opts.side === "BUY" ? settings.maxBuys : settings.maxSells;
  const positions = await openPositions(settings.dryRun);
  const fund = await fundBalance(settings.dryRun);
  // A sell does not spend cash. Reading Kite cash here would block the sell when the figure is missing.
  let spendable = 0;
  if (opts.side === "BUY") spendable = await currentSpendable(fund, settings, kite);
  const pace = await buyPace(day, settings.dryRun);
  let newBuys = pace.newBuys;
  const strategyBuys = { ...pace.strategyBuys };
  const openInStrategy = { ...pace.openInStrategy };
  let deployed = pace.deployed;
  let baseline = pace.baseline != null && pace.baseline > 0 ? pace.baseline : null;
  if (opts.side === "BUY" && decisions.length > 0) {
    const invested = await openCost(settings.dryRun);
    const pending = await pendingBuyValue(settings.dryRun);
    const kiteCash = await kite.equityCash();
    const now = engineSpendable(fund, invested, pending, kiteCash, settings.cashReserve);
    if (now > 0) {
      const next = deployBaseline(baseline, deployed, now);
      if (next != null && next > (baseline ?? 0)) await saveDeployBaseline(day, next);
      baseline = next;
    }
  }
  const deployCap = (baseline ?? 0) * settings.maxDailyDeployPct;
  const results: string[] = [];

  for (const decision of decisions) {
    const sent = opts.side === "BUY" ? buysSent : sellsSent;
    if (sent >= max) {
      await skip(decision, "limit", "daily limit", opts.runId);
      results.push(`${decision.symbol} limit`);
      continue;
    }
    let qty = decision.sizing?.qty ?? 0;
    const limit = decision.sizing?.limit ?? 0;
    if (decision.side === "BUY") {
      const sized = sizeOrder({
        fund,
        entry: limit,
        stop: decision.sizing?.stop ?? 0,
        spendable,
        riskPct: settings.riskPct,
        maxOrderPct: settings.maxOrderPct,
        minOrderInr: settings.minOrderInr,
      });
      if (sized.reason !== "ok") {
        await skip(decision, sized.reason, sized.text, opts.runId);
        results.push(`${decision.symbol} ${sized.reason}`);
        continue;
      }
      qty = sized.qty;
      await q(`UPDATE mlive.mlive_decisions SET sizing = $2::jsonb WHERE id = $1 AND outcome IN ('proposed', 'approved')`, [
        decision.id,
        JSON.stringify({ ...decision.sizing, qty, text: sized.text }),
      ]);
    }
    if (opts.chase) {
      const live = await livePrice(decision.symbol);
      const signal = decision.sizing?.signalClose ?? 0;
      if (live != null && signal > 0 && isChasing(live, signal, settings.chasePct)) {
        await skip(decision, "chasing", `live ${live} is more than ${settings.chasePct * 100}% above the signal`, opts.runId);
        results.push(`${decision.symbol} chasing`);
        continue;
      }
    }
    const position = positions.find((row) => row.symbol === decision.symbol);
    const sectorCount = await sectorCountFor(decision.symbol, positions);
    const strategy = await ideaStrategy(decision.ideaId);
    const ctx: GuardContext = {
      mode: state.mode,
      status: state.status,
      approved: decision.outcome === "approved" || state.mode === "auto",
      fund,
      spendable,
      maxOrderPct: settings.maxOrderPct,
      excluded: await excludedSymbol(decision.symbol, settings),
      systemQty: position?.qty ?? 0,
      buysSent,
      sellsSent,
      maxBuys: settings.maxBuys,
      maxSells: settings.maxSells,
      decisionAlreadySent: await decisionIsSent(decision, day),
      frozen: position?.frozen ?? false,
      openPositions: positions.length,
      maxOpenPositions: settings.maxOpen,
      isNewSymbol: !position,
      sectorCount,
      maxPerSector: settings.maxPerSector,
      newBuys,
      maxNewBuys: settings.maxNewBuys,
      strategyBuys: strategyBuys[strategy],
      maxBuysPerStrategy: settings.maxBuysPerStrategy,
      openInStrategy: openInStrategy[strategy],
      maxOpenPerStrategy: settings.maxOpenPerStrategy,
      deployed,
      deployCap,
    };
    const verdict = guardOrder(
      {
        side: decision.side,
        symbol: decision.symbol,
        qty,
        limitPrice: limit,
        tag: makeTag(decision.side, "CHECK1"),
        decisionId: String(decision.id),
        product: "CNC",
        orderType: "LIMIT",
        isGttExit: false,
      },
      ctx
    );
    if (!verdict.ok) {
      await skip(decision, verdict.reason, verdict.reason, opts.runId);
      results.push(`${decision.symbol} ${verdict.reason}`);
      continue;
    }
    const tag = makeTag(decision.side, shortId());
    const already = await q(`SELECT id FROM mlive.mlive_orders WHERE decision_id = $1`, [decision.id]);
    if (already[0]) continue;
    try {
      const placed = await kite.placeOrder({ symbol: decision.symbol, side: decision.side, qty, price: limit, tag });
      await recordOrder({
        decisionId: decision.id,
        tag,
        side: decision.side,
        symbol: decision.symbol,
        qty,
        limit,
        kiteOrderId: placed.orderId,
        dryRun: placed.dryRun,
        runId: opts.runId,
      });
      if (decision.side === "BUY") {
        buysSent += 1;
        newBuys += 1;
        strategyBuys[strategy] += 1;
        deployed += qty * limit;
      } else sellsSent += 1;
      if (decision.side === "BUY") spendable -= qty * limit;
      results.push(`${decision.symbol} sent ${placed.orderId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await q(
        `UPDATE mlive.mlive_decisions SET outcome = 'skipped', reason_code = 'order_rejected', reason_text = $2 WHERE id = $1`,
        [decision.id, message]
      );
      await raiseAlert({ level: "problem", code: "order_rejected", symbol: decision.symbol, message, runId: opts.runId });
      if (!rejectIsKnown(message)) {
        await setState({ status: "halted_today" });
        results.push("halted");
        break;
      }
    }
  }
  return { buysSent, sellsSent, results };
}

async function ideaStrategy(ideaId: number | null): Promise<"rs" | "ema"> {
  if (ideaId == null) return "rs";
  const rows = await q<{ strategy: string | null }>(`SELECT strategy FROM mlive.mlive_ideas WHERE id = $1`, [ideaId]);
  return rows[0]?.strategy === "ema" ? "ema" : "rs";
}

async function decisionIsSent(decision: Decision, day: string): Promise<boolean> {
  const own = await q(`SELECT id FROM mlive.mlive_orders WHERE decision_id = $1`, [decision.id]);
  if (decision.side !== "BUY") return coversDecision(Boolean(own[0]), false);
  const open = await q(
    `SELECT id FROM mlive.mlive_orders
      WHERE side = 'BUY' AND symbol = $1
        AND status IN ('OPEN', 'DRY', 'TRIGGER PENDING', 'PUT ORDER REQ RECEIVED')
        AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [decision.symbol, day]
  );
  return coversDecision(Boolean(own[0]), Boolean(open[0]));
}

async function currentSpendable(fund: number, settings: MliveSettings, kite: MliveKite): Promise<number> {
  const system = systemCash(fund, await openCost(settings.dryRun), await pendingBuyValue(settings.dryRun));
  const kiteCash = await kite.equityCash();
  return spendableCash(system, kiteCash, settings.cashReserve);
}

async function excludedSymbol(symbol: string, settings: MliveSettings): Promise<boolean> {
  const rows = await q<{ is_etf: boolean }>(`SELECT is_etf FROM mlive.mlive_instruments WHERE symbol = $1`, [symbol]);
  return isExcluded(symbol, settings.exclude, rows[0]?.is_etf === true);
}

async function sectorCountFor(symbol: string, positions: { symbol: string }[]): Promise<number> {
  const rows = await q<{ sector: string | null }>(`SELECT sector FROM mlive.mlive_instruments WHERE symbol = $1`, [symbol]);
  const sector = rows[0]?.sector;
  if (!sector) return 0;
  if (positions.length === 0) return 0;
  const held = await q<{ n: unknown }>(
    `SELECT COUNT(*)::int AS n FROM mlive.mlive_positions p
      JOIN mlive.mlive_instruments i ON i.symbol = p.symbol
     WHERE p.closed_at IS NULL AND i.sector = $1 AND p.symbol <> $2`,
    [sector, symbol]
  );
  return num(held[0]?.n);
}

async function skip(decision: Decision, code: string, text: string, runId: number): Promise<void> {
  await q(
    `UPDATE mlive.mlive_decisions SET outcome = 'skipped', reason_code = $2, reason_text = $3 WHERE id = $1 AND outcome IN ('proposed', 'approved')`,
    [decision.id, code, text]
  );
  await audit({ actor: "engine", action: "decision.skip", symbol: decision.symbol, reason: text, runId });
}

export async function syncBroker(runId: number): Promise<Record<string, unknown>> {
  const settings = await loadSettings();
  const kite = new MliveKite(settings.dryRun);
  if (settings.dryRun) {
    const simulated = await simulateDryFills(settings, kite, runId);
    return { dryRun: true, simulated };
  }
  const orders = await kite.orders();
  const byTag = new Map(orders.filter((row) => row.tag).map((row) => [row.tag as string, row]));
  const local = await q(
    `SELECT id, tag, side, symbol, filled_qty, avg_price, decision_id, kite_order_id, status, kind, dry_run
       FROM mlive.mlive_orders WHERE dry_run = false AND status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETE')`
  );
  let synced = 0;
  for (const row of local) {
    const remote = (row.tag ? byTag.get(String(row.tag)) : undefined) ?? orders.find((order) => order.order_id === row.kite_order_id);
    if (!remote) continue;
    const filled = num(remote.filled_quantity);
    const previous = num(row.filled_qty);
    if (remote.status === "REJECTED" || remote.status === "CANCELLED") {
      await q(`UPDATE mlive.mlive_orders SET status = $2, reject_reason = $3, updated_at = now() WHERE id = $1`, [
        num(row.id),
        remote.status,
        remote.status_message,
      ]);
      if (row.kind === "gtt_exit") {
        await raiseAlert({ level: "problem", code: "gtt_exit_failed", symbol: String(row.symbol), message: remote.status_message || "GTT exit was rejected", runId });
      } else if (remote.status_message && !rejectIsKnown(remote.status_message)) {
        await setState({ status: "halted_today", haltReason: "order_rejected" });
      }
      continue;
    }
    if (filled > previous) {
      await settleFill(row, {
        kiteOrderId: remote.order_id,
        filled,
        avgPrice: num(remote.average_price),
        status: remote.status,
        settings,
        kite,
        runId,
      });
      synced += 1;
    } else if (remote.status !== row.status) {
      await q(`UPDATE mlive.mlive_orders SET status = $2, updated_at = now() WHERE id = $1`, [num(row.id), remote.status]);
    }
  }
  await syncGtts(kite, settings, runId);
  return { synced };
}

async function settleFill(
  row: Record<string, unknown>,
  args: {
    kiteOrderId: string;
    filled: number;
    avgPrice: number;
    status: string;
    settings: MliveSettings;
    kite: MliveKite;
    runId: number;
  }
): Promise<void> {
  const decisionId = row.decision_id == null ? null : num(row.decision_id);
  const decision = decisionId
    ? await q(`SELECT idea_id, sizing FROM mlive.mlive_decisions WHERE id = $1`, [decisionId])
    : [];
  const idea = decision[0]?.idea_id
    ? await q(`SELECT strategy, initial_stop FROM mlive.mlive_ideas WHERE id = $1`, [num(decision[0].idea_id)])
    : [];
  const strategy = idea[0]?.strategy === "ema" ? "ema" : idea[0]?.strategy === "rs" ? "rs" : null;
  const stop = idea[0]?.initial_stop == null ? null : num(idea[0].initial_stop);
  await applyFill({
    orderId: num(row.id),
    kiteOrderId: args.kiteOrderId,
    side: row.side === "SELL" ? "SELL" : "BUY",
    symbol: String(row.symbol),
    filledQty: args.filled,
    avgPrice: args.avgPrice,
    previousFilled: num(row.filled_qty),
    previousAvg: num(row.avg_price),
    orderStatus: args.status,
    dryRun: row.dry_run === true,
    gttExit: row.kind === "gtt_exit",
    strategy,
    stop,
    settings: args.settings,
    kite: args.kite,
    runId: args.runId,
  });
}

async function simulateDryFills(settings: MliveSettings, kite: MliveKite, runId: number): Promise<number> {
  const orders = await q(
    `SELECT id, side, symbol, qty, filled_qty, avg_price, limit_price, kite_order_id, decision_id, status, kind, dry_run
       FROM mlive.mlive_orders
      WHERE dry_run = true AND status IN ('DRY', 'OPEN') AND filled_qty < qty`
  );
  let simulated = 0;
  for (const row of orders) {
    const live = await livePrice(String(row.symbol));
    const limit = num(row.limit_price);
    if (live == null || !limitCrossed(row.side === "SELL" ? "SELL" : "BUY", live, limit)) continue;
    await settleFill(row, {
      kiteOrderId: String(row.kite_order_id),
      filled: num(row.qty),
      avgPrice: limit,
      status: "COMPLETE",
      settings,
      kite,
      runId,
    });
    simulated += 1;
  }
  const gtts = await q(
    `SELECT g.id, g.qty, g.trigger_price, g.limit_price, g.kite_trigger_id, p.symbol, p.strategy, p.dry_run
       FROM mlive.mlive_gtts g
       JOIN mlive.mlive_positions p ON p.id = g.position_id
      WHERE g.status = 'DRY' AND p.closed_at IS NULL AND p.dry_run = true`
  );
  for (const row of gtts) {
    const live = await livePrice(String(row.symbol));
    const trigger = num(row.trigger_price);
    if (live == null || live > trigger + 1e-9) continue;
    const orderId = await recordExitOrder({
      kiteOrderId: `DRY-EXIT-${row.kite_trigger_id}`,
      symbol: String(row.symbol),
      qty: num(row.qty),
      limit: num(row.limit_price),
      dryRun: true,
      runId,
    });
    const local = await q(`SELECT id, side, symbol, qty, filled_qty, avg_price, decision_id, kind, dry_run FROM mlive.mlive_orders WHERE id = $1`, [orderId]);
    if (!local[0] || num(local[0].filled_qty) >= num(row.qty)) continue;
    await settleFill(local[0], {
      kiteOrderId: `DRY-EXIT-${row.kite_trigger_id}`,
      filled: num(row.qty),
      avgPrice: num(row.limit_price),
      status: "COMPLETE",
      settings,
      kite,
      runId,
    });
    await q(`UPDATE mlive.mlive_gtts SET status = 'triggered' WHERE id = $1`, [num(row.id)]);
    simulated += 1;
  }
  return simulated;
}

async function syncGtts(kite: MliveKite, settings: MliveSettings, runId: number): Promise<void> {
  let triggers: Awaited<ReturnType<MliveKite["gtts"]>> = [];
  try {
    triggers = await kite.gtts();
  } catch {
    return;
  }
  const orders = await kite.orders().catch(() => []);
  for (const trigger of triggers) {
    const plan = gttExitPlan(trigger);
    if (plan.action === "ignore") continue;
    const rows = await q(
      `SELECT g.id, g.qty, g.limit_price, p.symbol
         FROM mlive.mlive_gtts g
         JOIN mlive.mlive_positions p ON p.id = g.position_id
        WHERE g.kite_trigger_id = $1 AND g.status IN ('active', 'DRY') AND p.closed_at IS NULL`,
      [String(trigger.id)]
    );
    const row = rows[0];
    if (!row) continue;
    if (plan.action === "problem") {
      await q(`UPDATE mlive.mlive_gtts SET status = 'triggered' WHERE id = $1`, [num(row.id)]);
      await raiseAlert({ level: "problem", code: "gtt_exit_failed", symbol: String(row.symbol), message: plan.reason, runId });
      continue;
    }
    const remote = orders.find((order) => order.order_id === plan.orderId);
    const dead = !remote || remote.status === "REJECTED" || remote.status === "CANCELLED";
    if (!remote || num(remote.filled_quantity) < 1) {
      if (remote && dead) await q(`UPDATE mlive.mlive_gtts SET status = 'triggered' WHERE id = $1`, [num(row.id)]);
      const seen = await q(
        `SELECT id FROM mlive.mlive_alerts
          WHERE code = 'gtt_exit_failed' AND symbol = $1
            AND (ts AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        [String(row.symbol)]
      );
      if (!seen[0]) {
        await raiseAlert({
          level: "problem",
          code: "gtt_exit_failed",
          symbol: String(row.symbol),
          message: remote?.status_message || "GTT triggered but the sell is unfilled",
          runId,
        });
      }
      continue;
    }
    const orderId = await recordExitOrder({
      kiteOrderId: remote.order_id,
      symbol: String(row.symbol),
      qty: num(row.qty),
      limit: num(row.limit_price),
      dryRun: false,
      runId,
    });
    const local = await q(
      `SELECT id, side, symbol, qty, filled_qty, avg_price, decision_id, kind, dry_run FROM mlive.mlive_orders WHERE id = $1`,
      [orderId]
    );
    if (!local[0]) continue;
    const filled = num(remote.filled_quantity);
    if (filled > num(local[0].filled_qty)) {
      await settleFill(local[0], {
        kiteOrderId: remote.order_id,
        filled,
        avgPrice: num(remote.average_price) || num(row.limit_price),
        status: remote.status,
        settings,
        kite,
        runId,
      });
    }
    if (remote.status === "COMPLETE") {
      await q(`UPDATE mlive.mlive_gtts SET status = 'triggered' WHERE id = $1`, [num(row.id)]);
    }
  }
}

export async function freshBuySizing(decision: Decision, settings: MliveSettings, state: MliveState): Promise<Decision> {
  const fund = await fundBalance(settings.dryRun);
  const kite = new MliveKite(settings.dryRun);
  const spendable = await currentSpendable(fund, settings, kite);
  const entry = decision.sizing?.limit ?? 0;
  const stop = decision.sizing?.stop ?? 0;
  const sized = sizeOrder({
    fund,
    entry,
    stop,
    spendable,
    riskPct: settings.riskPct,
    maxOrderPct: settings.maxOrderPct,
    minOrderInr: settings.minOrderInr,
  });
  await q(`UPDATE mlive.mlive_decisions SET sizing = $2::jsonb WHERE id = $1`, [
    decision.id,
    JSON.stringify({ ...decision.sizing, qty: sized.qty, text: sized.text, reason: sized.reason }),
  ]);
  await audit({ actor: "engine", action: "sizing", symbol: decision.symbol, reason: sized.text, after: { mode: state.mode } });
  return { ...decision, sizing: { ...decision.sizing, qty: sized.qty, limit: entry, stop, text: sized.text } };
}

/** A fill with no GTT after 10 minutes gets one more try, then a protective limit sell. */
export async function coverUnguardedPositions(runId: number): Promise<number> {
  const settings = await loadSettings();
  const state = await loadState();
  const kite = new MliveKite(settings.dryRun);
  const rows = await q<{
    id: string;
    symbol: string;
    qty: unknown;
    avg_price: unknown;
    trend_stop: unknown;
    strategy: "rs" | "ema" | null;
  }>(
    `SELECT p.id, p.symbol, p.qty, p.avg_price, p.trend_stop, p.strategy
       FROM mlive.mlive_positions p
      WHERE p.closed_at IS NULL
        AND p.frozen = false
        AND ($1::boolean OR p.dry_run = false)
        AND p.opened_at < now() - interval '10 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM mlive.mlive_gtts g
           WHERE g.position_id = p.id AND g.status IN ('active', 'DRY')
        )
        AND NOT EXISTS (
          SELECT 1 FROM mlive.mlive_decisions d
           WHERE d.position_id = p.id AND d.side = 'SELL' AND d.reason_code = 'gtt_fallback'
             AND d.outcome IN ('proposed', 'approved', 'sent')
        )`,
    [settings.dryRun]
  );
  const fund = await fundBalance(settings.dryRun);
  const positions = await openPositions(settings.dryRun);
  let sent = 0;
  for (const row of rows) {
    const positionId = num(row.id);
    const qty = num(row.qty);
    const avg = num(row.avg_price);
    const stop = row.trend_stop == null ? null : num(row.trend_stop);
    const guarded = await ensurePositionGtt(positionId, {
      symbol: row.symbol,
      filledQty: qty,
      avgPrice: avg,
      stop,
      strategy: row.strategy,
      settings,
      kite,
      runId,
    });
    if (guarded || qty < 1) continue;
    const live = await livePrice(row.symbol);
    const limit = roundTick((live && live > 0 ? live : avg) * 0.995);
    if (!(limit > 0)) continue;
    const inserted = await q<{ id: string }>(
      `INSERT INTO mlive.mlive_decisions
         (run_id, trade_date, position_id, side, symbol, outcome, reason_code, reason_text, sizing, dry_run)
       VALUES ($1, $2::date, $3, 'SELL', $4, 'approved', 'gtt_fallback', $5, $6::jsonb, $7)
       ON CONFLICT (trade_date, side, position_id) WHERE position_id IS NOT NULL
       DO UPDATE SET outcome = 'approved', reason_code = 'gtt_fallback', reason_text = EXCLUDED.reason_text, sizing = EXCLUDED.sizing
       WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')
       RETURNING id`,
      [runId, todayIst(), positionId, row.symbol, "GTT was not placed within 10 minutes. Protective limit sell.", JSON.stringify({ qty, limit }), settings.dryRun]
    );
    if (!inserted[0]) continue;
    const decisionId = num(inserted[0].id);
    const tag = makeTag("SELL", shortId());
    const verdict = guardOrder(
      {
        side: "SELL",
        symbol: row.symbol,
        qty,
        limitPrice: limit,
        tag,
        decisionId: String(decisionId),
        product: "CNC",
        orderType: "LIMIT",
        isGttExit: true,
      },
      {
        mode: state.mode,
        status: state.status,
        approved: true,
        fund,
        spendable: 0,
        maxOrderPct: settings.maxOrderPct,
        excluded: await excludedSymbol(row.symbol, settings),
        systemQty: qty,
        buysSent: 0,
        sellsSent: 0,
        maxBuys: settings.maxBuys,
        maxSells: settings.maxSells,
        decisionAlreadySent: false,
        frozen: false,
        openPositions: positions.length,
        maxOpenPositions: settings.maxOpen,
        isNewSymbol: false,
        sectorCount: 0,
        maxPerSector: settings.maxPerSector,
      }
    );
    if (!verdict.ok) {
      await q(`UPDATE mlive.mlive_decisions SET outcome = 'skipped', reason_text = $2 WHERE id = $1`, [decisionId, verdict.reason]);
      continue;
    }
    try {
      const order = await kite.placeOrder({ symbol: row.symbol, side: "SELL", qty, price: limit, tag });
      await recordOrder({
        decisionId,
        tag,
        side: "SELL",
        symbol: row.symbol,
        qty,
        limit,
        kiteOrderId: order.orderId,
        dryRun: order.dryRun,
        runId,
      });
      await raiseAlert({
        level: "problem",
        code: "gtt_failed",
        symbol: row.symbol,
        message: `${row.symbol} had no GTT after 10 minutes. Protective limit sell sent at ₹${limit}.`,
        runId,
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await q(
        `UPDATE mlive.mlive_decisions SET outcome = 'skipped', reason_code = 'order_rejected', reason_text = $2 WHERE id = $1`,
        [decisionId, message]
      );
      await raiseAlert({ level: "problem", code: "order_rejected", symbol: row.symbol, message, runId });
    }
  }
  return sent;
}
