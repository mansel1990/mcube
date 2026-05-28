"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PushReadListener() {
  const router = useRouter();

  useEffect(() => {
    async function markRead(payload: { notificationId?: string | null; tag?: string | null }) {
      try {
        if (payload.notificationId) {
          await fetch(`/api/stocks/notifications/${payload.notificationId}/read`, { method: "POST" });
        } else if (payload.tag) {
          await fetch("/api/stocks/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag: payload.tag }),
          });
        }
      } catch {
        // best-effort
      }
    }

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.type !== "NOTIFICATION_CLICK") return;
      markRead({ notificationId: data.notificationId, tag: data.tag });
      if (data.url) router.push(data.url);
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
