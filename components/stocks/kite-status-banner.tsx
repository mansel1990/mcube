"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function KiteStatusBanner() {
  const [show, setShow] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    fetch("/api/kite/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setShow(!data.connected);
        setExpired(data.expired);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="mx-4 md:mx-6 mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#5a4310] bg-[rgba(245,173,20,0.08)] text-amber-200">
      <AlertTriangle size={16} className="shrink-0 text-amber-400" />
      <p className="text-xs flex-1">
        {expired
          ? "Disconnected from the game coordinator — Kite token expired. Reconnect before placing trades."
          : "Connect to the game coordinator (Kite) to sync holdings and place orders."}
      </p>
      <Link
        href="/stocks/settings"
        className="text-xs font-semibold text-amber-300 hover:underline shrink-0"
      >
        {expired ? "Reconnect" : "Connect"}
      </Link>
    </div>
  );
}
