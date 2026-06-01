"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export type PlacedOrder = {
  tradeId: number;
  symbol: string;
  transactionType: "BUY" | "SELL";
  estimatedInr: number | null;
  limitPrice?: number;
  gttPlaced?: boolean;
  gttError?: string | null;
};

const CANCEL_WINDOW_MS = 5000;

interface Props {
  order: PlacedOrder | null;
  onDismiss: () => void;
}

export function KiteOrderToast({ order, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setSecondsLeft(5);
    setCancelled(false);
    setError(null);
    setCancelling(false);

    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, Math.ceil((CANCEL_WINDOW_MS - elapsed) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(tick);
    }, 200);

    const dismiss = setTimeout(onDismiss, CANCEL_WINDOW_MS + 500);
    return () => {
      clearInterval(tick);
      clearTimeout(dismiss);
    };
  }, [order, onDismiss]);

  const handleCancel = useCallback(async () => {
    if (!order || cancelling || cancelled || secondsLeft <= 0) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/kite/order/${order.tradeId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      setCancelled(true);
      setTimeout(onDismiss, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }, [order, cancelling, cancelled, secondsLeft, onDismiss]);

  if (!order) return null;

  const inrLabel =
    order.estimatedInr != null
      ? `₹${Math.round(order.estimatedInr).toLocaleString("en-IN")}`
      : "—";

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50">
      <div className="rounded-xl border border-slate-200 bg-white shadow-lg px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {cancelled ? (
            <p className="text-sm font-semibold text-amber-700">Order cancelled</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-900">
                {order.transactionType === "BUY" ? "Limit buy" : "Sell"} {order.symbol}
                {order.limitPrice != null ? ` @ ₹${order.limitPrice.toLocaleString("en-IN")}` : ""}
                {" · "}
                {inrLabel}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Order placed
                {order.transactionType === "BUY" && order.gttPlaced && " · Exit GTT set"}
                {order.transactionType === "BUY" && order.gttError && (
                  <span className="text-amber-700"> · GTT failed: {order.gttError}</span>
                )}
              </p>
            </>
          )}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!cancelled && secondsLeft > 0 && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : `Cancel (${secondsLeft}s)`}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
