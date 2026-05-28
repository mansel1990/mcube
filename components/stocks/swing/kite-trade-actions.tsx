"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { calculateOrderQty } from "@/lib/stocks/order-qty";
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
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function KiteTradeActions({
  ticker,
  ltp,
  holdingQty,
  defaultTradeAmount,
  signalRef,
  strategy,
  targetPrice,
  stopLoss,
  onOrderPlaced,
}: Props) {
  const buyDefault = useMemo(() => {
    if (ltp == null || ltp <= 0) return null;
    return calculateOrderQty(defaultTradeAmount, ltp);
  }, [defaultTradeAmount, ltp]);

  const [qty, setQty] = useState(buyDefault?.qty ?? 1);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (side === "BUY" && buyDefault) setQty(buyDefault.qty);
    if (side === "SELL" && holdingQty > 0) setQty(holdingQty);
  }, [side, buyDefault, holdingQty]);

  const estimatedInr = ltp != null && qty > 0 ? qty * ltp : null;
  const canBuy = buyDefault != null && qty >= 1;
  const canSell = holdingQty > 0 && qty >= 1 && qty <= holdingQty;
  const buyDisabledReason =
    ltp == null
      ? "Price unavailable"
      : buyDefault == null
        ? "Increase trade size in Settings"
        : null;

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
          targetPrice: targetPrice ?? undefined,
          stopLoss: stopLoss ?? undefined,
          ltp: ltp ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Order failed");

      onOrderPlaced({
        tradeId: data.tradeId,
        symbol: ticker,
        transactionType,
        estimatedInr: data.estimatedInr ?? estimatedInr,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {holdingQty > 0 && (
        <p className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md inline-block">
          You hold {holdingQty}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-slate-400 font-semibold">Qty</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {estimatedInr != null && qty > 0 && (
          <p className="text-[11px] text-slate-500 pt-4 shrink-0">
            ≈{fmtInr(estimatedInr)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => placeOrder("BUY")}
          disabled={loading || !canBuy}
          title={buyDisabledReason ?? undefined}
          className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          {loading && side === "BUY" ? <Loader2 size={14} className="animate-spin" /> : null}
          Buy{canBuy ? ` · ${qty}` : ""}
        </button>
        <button
          onClick={() => placeOrder("SELL")}
          disabled={loading || !canSell}
          className="py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          {loading && side === "SELL" ? <Loader2 size={14} className="animate-spin" /> : null}
          Sell{holdingQty > 0 ? ` · ${Math.min(qty, holdingQty)}` : ""}
        </button>
      </div>

      {buyDisabledReason && !canBuy && (
        <p className="text-[10px] text-amber-700">{buyDisabledReason}</p>
      )}
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
