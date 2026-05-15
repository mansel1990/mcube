"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

type PermState = "granted" | "denied" | "default" | "unsupported";

export function NotificationBanner() {
  const [permState, setPermState] = useState<PermState>("unsupported");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermState(Notification.permission as PermState);
    const wasDismissed = localStorage.getItem("push_banner_dismissed") === "1";
    setDismissed(wasDismissed);
  }, []);

  async function handleEnable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermState(permission as PermState);
      if (permission !== "granted") return;

      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("VAPID key not configured");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await fetch("/api/stocks/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : "Failed to enable notifications");
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem("push_banner_dismissed", "1");
    setDismissed(true);
  }

  // Already granted — show subtle indicator
  if (permState === "granted") {
    return (
      <div className="flex items-center gap-1.5 px-4 pt-3 text-xs text-slate-400">
        <Bell size={12} />
        <span>Market notifications on</span>
      </div>
    );
  }

  // Denied or unsupported — show nothing
  if (permState === "denied" || permState === "unsupported") return null;

  // Dismissed by user — show nothing
  if (dismissed) return null;

  // Default — show banner
  return (
    <div className="mx-4 mt-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
      <Bell size={16} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">Get market alerts</p>
        <p className="text-xs text-slate-500">
          Notifications at NSE open (9:15 AM) and close (3:30 PM)
        </p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {loading ? "..." : "Enable"}
        </button>
        {subscribeError && (
          <p className="text-xs text-red-500 max-w-[140px] text-right leading-tight">{subscribeError}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
