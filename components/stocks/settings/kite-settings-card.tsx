"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Link2, Unlink, Loader2 } from "lucide-react";

type KiteStatus = {
  connected: boolean;
  expired: boolean;
  tokenDate?: string;
  connectedAt?: string;
};

export function KiteSettingsCard() {
  const params = useSearchParams();
  const [status, setStatus] = useState<KiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kite/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    const kite = params.get("kite");
    if (kite) fetchStatus();
  }, [params, fetchStatus]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/kite/disconnect", { method: "POST" });
      await fetchStatus();
    } finally {
      setDisconnecting(false);
    }
  }

  const kiteParam = params.get("kite");
  const showSuccess = kiteParam === "connected";
  const showError = kiteParam === "error" || kiteParam === "config";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Kite Connect</h3>
          <p className="text-xs text-slate-500 mt-0.5">Link your Zerodha account for portfolio sync</p>
        </div>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-slate-400" />
        ) : status?.connected ? (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Connected · today
          </span>
        ) : status?.expired ? (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Token expired
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
            Not connected
          </span>
        )}
      </div>

      {showSuccess && (
        <p className="text-xs text-emerald-600 mb-3">Kite connected successfully. Token valid until ~6 AM tomorrow.</p>
      )}
      {showError && (
        <p className="text-xs text-red-600 mb-3">Could not connect Kite. Try again.</p>
      )}

      <p className="text-xs text-slate-500 mb-4">
        Reconnect each trading day before market open. Tokens expire at ~6:00 AM IST.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/kite/login"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          <Link2 size={14} />
          {status?.connected ? "Reconnect Kite" : status?.expired ? "Reconnect Kite" : "Connect Kite"}
        </a>
        {status && (status.connected || status.expired) && (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Unlink size={14} />
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        <Link
          href="/stocks/portfolio"
          className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          View portfolio
        </Link>
      </div>
    </div>
  );
}
