import type { SignalSource, UnifiedSignal } from "./types";
import { SOURCE_PRIORITY, SOURCE_SHORT } from "./types";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  totalCount: number;
  bySource: Partial<Record<SignalSource, number>>;
}

function clampBody(body: string, maxLen = 160): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen - 1).trimEnd() + "…";
}

function dayLabelIST(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
}

function formatSourceCounts(
  bySource: Partial<Record<SignalSource, number>>,
  maxShow = 4
): string {
  const entries = SOURCE_PRIORITY
    .map((s) => [s, bySource[s] ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || SOURCE_PRIORITY.indexOf(a[0]) - SOURCE_PRIORITY.indexOf(b[0]));

  const shown = entries.slice(0, maxShow).map(([s, n]) => `${SOURCE_SHORT[s]} ${n}`).join(" · ");
  const hidden = entries.length - maxShow;
  if (hidden > 0) return `${shown} · +${hidden} strats`;
  return shown;
}

function countBySource(signals: UnifiedSignal[]): Partial<Record<SignalSource, number>> {
  const out: Partial<Record<SignalSource, number>> = {};
  for (const s of signals) {
    out[s.source] = (out[s.source] ?? 0) + 1;
  }
  return out;
}

function topTickers(signals: UnifiedSignal[], n: number): string[] {
  const sorted = [...signals].sort(
    (a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source)
  );
  return sorted.slice(0, n).map((s) => s.ticker);
}

function activeStrategyCount(bySource: Partial<Record<SignalSource, number>>): number {
  return Object.values(bySource).filter((n) => (n ?? 0) > 0).length;
}

export function buildMorningPush(
  freshSignals: UnifiedSignal[],
  lastScanDate: string | null,
  isStaleScan: boolean
): PushMessage {
  const total = freshSignals.length;
  const bySource = countBySource(freshSignals);
  const day = dayLabelIST();

  if (total === 0) {
    return {
      title: "No new ideas · 9 AM",
      body: "Nothing from last night's scan. Next scan at 6 PM.",
      url: "/stocks?status=open",
      tag: "morning-brief",
      totalCount: 0,
      bySource: {},
    };
  }

  if (isStaleScan && lastScanDate) {
    const scanDay = new Date(lastScanDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short" });
    return {
      title: `${total} ideas · last scan ${scanDay}`,
      body: clampBody(`${formatSourceCounts(bySource)}. No new scan last night.`),
      url: "/stocks?status=open&fresh=1",
      tag: "morning-brief",
      totalCount: total,
      bySource,
    };
  }

  if (total <= 3) {
    const items = freshSignals
      .sort((a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source))
      .map((s) => `${SOURCE_SHORT[s.source]}: ${s.ticker}`)
      .join(" · ");
    return {
      title: `${total} buy idea${total > 1 ? "s" : ""} · ${day} 9 AM`,
      body: clampBody(items),
      url: "/stocks?status=open&fresh=1",
      tag: "morning-brief",
      totalCount: total,
      bySource,
    };
  }

  if (total <= 8) {
    const tickers = topTickers(freshSignals, 2).join(", ");
    const more = total - 2;
    return {
      title: `${total} buy ideas · ${day} 9 AM`,
      body: clampBody(`${formatSourceCounts(bySource)} — ${tickers} +${more}`),
      url: "/stocks?status=open&fresh=1",
      tag: "morning-brief",
      totalCount: total,
      bySource,
    };
  }

  return {
    title: `${total} buy ideas · ${day} 9 AM`,
    body: clampBody(`${formatSourceCounts(bySource, 4)}. Tap to review.`),
    url: "/stocks?status=open&fresh=1",
    tag: "morning-brief",
    totalCount: total,
    bySource,
  };
}

export function buildScanPush(freshSignals: UnifiedSignal[]): PushMessage | null {
  const total = freshSignals.length;
  if (total === 0) return null;

  const bySource = countBySource(freshSignals);
  const stratCount = activeStrategyCount(bySource);

  return {
    title: "Scanner done · 6:30 PM",
    body: `${total} new signal${total !== 1 ? "s" : ""} across ${stratCount} strateg${stratCount !== 1 ? "ies" : "y"}. Tap to review.`,
    url: "/stocks?status=open&fresh=1",
    tag: "scan-brief",
    totalCount: total,
    bySource,
  };
}
