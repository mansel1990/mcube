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
    <div className="mx-4 md:mx-6 mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
      <AlertTriangle size={16} className="shrink-0 text-amber-600" />
      <p className="text-xs flex-1">
        {expired
          ? "Kite token expired — reconnect before placing trades or viewing live portfolio."
          : "Connect your Kite account to sync holdings and positions."}
      </p>
      <Link
        href="/stocks/settings"
        className="text-xs font-semibold text-amber-800 hover:underline shrink-0"
      >
        {expired ? "Reconnect" : "Connect"}
      </Link>
    </div>
  );
}
