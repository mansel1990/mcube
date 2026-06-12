"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { calculateOrderQty } from "@/lib/stocks/order-qty";
import { pctFromRef, priceFromPct, roundPrice, validateExitGtt } from "@/lib/kite/gtt-exit";
import type { PlacedOrder } from "../kite-order-toast";

interface Props {
  ticker: string;
  ltp: number | null;
  holdingQty: number;
  defaultTradeAmount: number;
  signalRef: string;
  strategy?: string;
  targetPrice?: number | null;
  stopLoss?: number | null;
  onOrderPlaced: (order: PlacedOrder) => void;
}

function fmtInr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function KiteTradeActions({
  ticker,
  ltp,
  holdingQty,
  defaultTradeAmount,
  signalRef,
  strategy,
  targetPrice: signalTarget,
  stopLoss: signalSl,
  onOrderPlaced,
}: Props) {
  const buyDefault = useMemo(() => {
    if (ltp == null || ltp <= 0) return null;
    return calculateOrderQty(defaultTradeAmount, ltp);
  }, [defaultTradeAmount, ltp]);

  const refPrice = ltp ?? 0;

  const defaultExit = useMemo(() => {
    if (refPrice <= 0) return null;
    const tgt =
      signalTarget != null && signalTarget > 0
        ? roundPrice(signalTarget)
        : roundPrice(refPrice * 1.05);
    const sl =
      signalSl != null && signalSl > 0
        ? roundPrice(signalSl)
        : roundPrice(refPrice * 0.97);
    return { target: tgt, stopLoss: sl };
  }, [refPrice, signalTarget, signalSl]);

  const [qty, setQty] = useState(buyDefault?.qty ?? 1);
  const [limitPrice, setLimitPrice] = useState("");
  const [targetAmt, setTargetAmt] = useState("");
  const [targetPct, setTargetPct] = useState("");
  const [slAmt, setSlAmt] = useState("");
  const [slPct, setSlPct] = useState("");
  const [placeExitGtt, setPlaceExitGtt] = useState(true);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncExitFromAmounts = useCallback(
    (tgt: number, sl: number) => {
      if (refPrice <= 0) return;
      setTargetAmt(String(tgt));
      setSlAmt(String(sl));
      setTargetPct(fmtPct(pctFromRef(refPrice, tgt)));
      setSlPct(fmtPct(pctFromRef(refPrice, sl)));
    },
    [refPrice]
  );

  useEffect(() => {
    if (ltp != null && ltp > 0) setLimitPrice(String(roundPrice(ltp)));
  }, [ltp]);

  useEffect(() => {
    if (defaultExit) syncExitFromAmounts(defaultExit.target, defaultExit.stopLoss);
  }, [defaultExit, syncExitFromAmounts]);

  useEffect(() => {
    if (side === "BUY" && buyDefault) setQty(buyDefault.qty);
    if (side === "SELL" && holdingQty > 0) setQty(holdingQty);
  }, [side, buyDefault, holdingQty]);

  const parsedLimit = Number(limitPrice);
  const parsedTarget = Number(targetAmt);
  const parsedSl = Number(slAmt);
  const gttRef = refPrice > 0 ? refPrice : parsedLimit;
  const gttValid =
    gttRef > 0 &&
    validateExitGtt(parsedSl, parsedTarget, gttRef) == null;

  const estimatedInr =
    parsedLimit > 0 && qty > 0 ? qty * parsedLimit : ltp != null && qty > 0 ? qty * ltp : null;
  const canBuy =
    buyDefault != null &&
    qty >= 1 &&
    parsedLimit > 0 &&
    (!placeExitGtt || gttValid);
  const canSell = holdingQty > 0 && qty >= 1 && qty <= holdingQty;
  const buyDisabledReason =
    ltp == null
      ? "Price unavailable"
      : buyDefault == null
        ? "Increase trade size in Settings"
        : !(parsedLimit > 0)
          ? "Enter a valid limit price"
          : placeExitGtt && !gttValid
            ? "Fix target / stop loss for GTT"
            : null;

  function onTargetAmtChange(raw: string) {
    setTargetAmt(raw);
    const n = Number(raw);
    if (refPrice > 0 && Number.isFinite(n) && n > 0) {
      setTargetPct(fmtPct(pctFromRef(refPrice, n)));
    }
  }

  function onSlAmtChange(raw: string) {
    setSlAmt(raw);
    const n = Number(raw);
    if (refPrice > 0 && Number.isFinite(n) && n > 0) {
      setSlPct(fmtPct(pctFromRef(refPrice, n)));
    }
  }

  function onTargetPctChange(raw: string) {
    setTargetPct(raw);
    const pct = parseFloat(raw.replace(/[+%,\s]/g, ""));
    if (refPrice > 0 && Number.isFinite(pct)) {
      const amt = priceFromPct(refPrice, pct);
      setTargetAmt(String(amt));
    }
  }

  function onSlPctChange(raw: string) {
    setSlPct(raw);
    const pct = parseFloat(raw.replace(/[+%,\s]/g, ""));
    if (refPrice > 0 && Number.isFinite(pct)) {
      const amt = priceFromPct(refPrice, pct);
      setSlAmt(String(amt));
    }
  }

  async function placeOrder(transactionType: "BUY" | "SELL") {
    if (loading) return;
    setSide(transactionType);
    setError(null);

    if (transactionType === "BUY" && !canBuy) return;
    if (transactionType === "SELL" && !canSell) return;

    setLoading(true);
    try {
      const res = await fetch("/api/kite/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: ticker,
          transactionType,
          quantity: qty,
          signalRef,
          strategy,
          ltp: ltp ?? undefined,
          ...(transactionType === "BUY"
            ? {
                limitPrice: parsedLimit,
                ...(placeExitGtt && gttValid
                  ? {
                      targetPrice: parsedTarget,
                      stopLoss: parsedSl,
                      placeExitGtt: true,
                    }
                  : { placeExitGtt: false }),
              }
            : { placeExitGtt: false }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Order failed");

      onOrderPlaced({
        tradeId: data.tradeId,
        symbol: ticker,
        transactionType,
        estimatedInr: data.estimatedInr ?? estimatedInr,
        limitPrice: data.limitPrice ?? (transactionType === "BUY" ? parsedLimit : undefined),
        gttPlaced: data.gttPlaced === true,
        gttError: data.gttError ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full mt-0.5 px-2 py-1.5 rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] [color-scheme:dark] text-sm focus:outline-none focus:border-[#6b4c16]";
  const smallInputCls =
    "px-1.5 py-1 rounded border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] text-xs [color-scheme:dark]";

  return (
    <div className="space-y-2">
      {holdingQty > 0 && (
        <p className="text-[10px] font-semibold text-[var(--dota-gold)] border border-[#574212] bg-[rgba(255,216,77,0.06)] px-2 py-1 rounded-md inline-block">
          On the map · you hold {holdingQty}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold">Limit buy @</label>
          <input
            type="number"
            step="0.05"
            min={0}
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold">Qty</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className={inputCls}
          />
        </div>
        {estimatedInr != null && qty > 0 && (
          <p className="text-[11px] text-[var(--dota-gold)] pt-4 shrink-0">≈{fmtInr(estimatedInr)}</p>
        )}
      </div>

      {ltp != null && ltp > 0 && (
        <div className="rounded-lg border border-[#2a3344] bg-black/20 p-2 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={placeExitGtt}
              onChange={(e) => setPlaceExitGtt(e.target.checked)}
              className="rounded border-[var(--dota-border)] bg-black/40 [color-scheme:dark]"
            />
            <span className="text-[10px] font-semibold text-[var(--dota-text)]">
              Exit GTT (target + stop loss on Kite)
            </span>
          </label>
          {placeExitGtt && (
            <p className="text-[10px] text-[var(--dota-dim)] pl-5">
              May need your limit buy to fill before GTT is accepted
            </p>
          )}

          {placeExitGtt && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-[#bcdb3e] font-semibold">
                    Target
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <input
                      type="number"
                      step="0.05"
                      value={targetAmt}
                      onChange={(e) => onTargetAmtChange(e.target.value)}
                      className={`flex-1 min-w-0 ${smallInputCls}`}
                      placeholder="₹"
                    />
                    <input
                      type="text"
                      value={targetPct}
                      onChange={(e) => onTargetPctChange(e.target.value)}
                      className={`w-14 text-right ${smallInputCls}`}
                      placeholder="%"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-[#f06352] font-semibold">
                    🗼 Tower SL
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <input
                      type="number"
                      step="0.05"
                      value={slAmt}
                      onChange={(e) => onSlAmtChange(e.target.value)}
                      className={`flex-1 min-w-0 ${smallInputCls}`}
                      placeholder="₹"
                    />
                    <input
                      type="text"
                      value={slPct}
                      onChange={(e) => onSlPctChange(e.target.value)}
                      className={`w-14 text-right ${smallInputCls}`}
                      placeholder="%"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[var(--dota-dim)]">
                From signal · LTP {fmtInr(ltp)}
                {parsedLimit > 0 && parsedLimit !== ltp && (
                  <span> · limit {fmtInr(parsedLimit)}</span>
                )}
                {!gttValid && (
                  <span className="text-amber-400"> · SL must be below LTP, target above</span>
                )}
              </p>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => placeOrder("BUY")}
          disabled={loading || !canBuy}
          title={buyDisabledReason ?? undefined}
          className="btn-pick py-2 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          {loading && side === "BUY" ? <Loader2 size={14} className="animate-spin" /> : null}
          ⚔ Pick{canBuy ? ` · ${qty} @ ${fmtInr(parsedLimit)}` : ""}
        </button>
        <button
          onClick={() => placeOrder("SELL")}
          disabled={loading || !canSell}
          className="btn-gg py-2 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          {loading && side === "SELL" ? <Loader2 size={14} className="animate-spin" /> : null}
          GG · Sell{holdingQty > 0 ? ` · ${Math.min(qty, holdingQty)}` : ""}
        </button>
      </div>

      {buyDisabledReason && !canBuy && (
        <p className="text-[10px] text-amber-400">{buyDisabledReason}</p>
      )}
      {error && <p className="text-[10px] text-[var(--dota-dire-bright)]">{error}</p>}
    </div>
  );
}
