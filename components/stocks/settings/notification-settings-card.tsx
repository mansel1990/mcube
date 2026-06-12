"use client";

import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

type PermState = "granted" | "denied" | "default" | "unsupported";

export function NotificationSettingsCard() {
  const [permState, setPermState] = useState<PermState>("unsupported");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermState(Notification.permission as PermState);
  }, []);

  async function handleEnable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Failed to enable notifications");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/stocks/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPermState(Notification.permission as PermState);
    } finally {
      setLoading(false);
    }
  }

  if (permState === "unsupported") {
    return (
      <div className="rounded-xl dota-panel p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-dim)]">
            <Bell size={18} />
          </div>
          <div>
            <h3 className="cz text-[11px] font-bold">Announcer · Daily Buy Alerts</h3>
            <p className="text-xs text-[var(--dota-dim)] mt-1">
              Push notifications are not supported in this browser.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl dota-panel p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]">
          <Bell size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="cz text-[11px] font-bold">Announcer · Daily Buy Alerts</h3>
          <p className="text-xs text-[var(--dota-dim)] mt-1 leading-relaxed">
            Push at 9:00 AM with today&apos;s buy ideas, and at 6:30 PM when the scanner finishes.
            On iOS, add to home screen first, then enable here.
          </p>

          {permState === "granted" ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dota-radiant-bright)]">
                <Check size={14} /> Announcer enabled
              </span>
              <button
                onClick={handleDisable}
                disabled={loading}
                className="text-xs text-[var(--dota-dim)] hover:text-[var(--dota-head)] underline disabled:opacity-50"
              >
                Disable
              </button>
            </div>
          ) : permState === "denied" ? (
            <p className="mt-3 text-xs text-amber-400">
              Notifications are blocked in your browser. Enable them in browser settings.
            </p>
          ) : (
            <button
              onClick={handleEnable}
              disabled={loading}
              className="btn-pick mt-3 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {loading ? "Enabling…" : "Enable Notifications"}
            </button>
          )}

          {error && <p className="mt-2 text-xs text-[var(--dota-dire-bright)]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
