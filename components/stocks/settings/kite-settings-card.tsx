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
    <div className="rounded-xl dota-panel p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]">
            <Link2 size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="cz text-[11px] font-bold">Game Coordinator (Kite)</h3>
            <p className="text-xs text-[var(--dota-dim)] mt-0.5">Link your Zerodha account for portfolio sync</p>
          </div>
        </div>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-[var(--dota-dim)] shrink-0" />
        ) : status?.connected ? (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-[rgba(176,210,50,0.1)] text-[var(--dota-radiant-bright)] border border-[#3a4413] shrink-0">
            Connected · today
          </span>
        ) : status?.expired ? (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)] border border-[#574212] shrink-0">
            Token expired
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-black/30 text-[var(--dota-dim)] border border-[var(--dota-border)] shrink-0">
            Not connected
          </span>
        )}
      </div>

      {showSuccess && (
        <p className="text-xs text-[var(--dota-radiant-bright)] mb-3">
          Kite connected successfully. Token valid until ~6 AM tomorrow.
        </p>
      )}
      {showError && (
        <p className="text-xs text-[var(--dota-dire-bright)] mb-3">Could not connect Kite. Try again.</p>
      )}

      <p className="text-xs text-[var(--dota-dim)] mb-4">
        Reconnect each trading day before market open. Tokens expire at ~6:00 AM IST.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/kite/login"
          className="btn-pick inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold"
        >
          <Link2 size={14} />
          {status?.connected ? "Reconnect Kite" : status?.expired ? "Reconnect Kite" : "Connect Kite"}
        </a>
        {status && (status.connected || status.expired) && (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#76302a] bg-transparent text-sm text-[var(--dota-dire-bright)] hover:bg-[rgba(212,69,49,0.1)] disabled:opacity-50 transition-colors"
          >
            <Unlink size={14} />
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        <Link
          href="/stocks/portfolio"
          className="inline-flex items-center px-4 py-2 rounded-lg border border-[var(--dota-border)] text-sm text-[var(--dota-text)] hover:bg-white/5 transition-colors"
        >
          View portfolio
        </Link>
      </div>
    </div>
  );
}
