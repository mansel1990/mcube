import type { SignalSource } from "./types";

/**
 * DOTA2 theme hero metadata for the stocks section.
 * Roster names come from the backend (trading/scanner/main.py);
 * Dota hero mapping locked in docs/plans/stocks/stocks-dota2-theme-prd.md §3.2.
 */

export type RosterStatus = "active" | "bench";

export interface HeroMeta {
  /** Roster name shown in the UI (brother's naming) */
  name: string;
  /** Real Dota 2 hero bound to this strategy (portrait + identity) */
  dota: string | null;
  /** Steam CDN portrait (runtime-loaded, nothing committed) */
  img: string | null;
  /** Accent color (hex) — applied via inline styles */
  accent: string;
  /** One-line lore for drawers/tooltips */
  lore: string;
  roster: RosterStatus;
}

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

export const HERO_META: Record<SignalSource, HeroMeta> = {
  rs_resilience: {
    name: "RudraShakti",
    dota: "Spectre",
    img: `${CDN}/spectre.png`,
    accent: "#b394f0",
    lore: "Wins from behind — strongest when the whole map is losing. Rides winners until the tower falls.",
    roster: "active",
  },
  mean_reversion: {
    name: "MiRana",
    dota: "Mirana",
    img: `${CDN}/mirana.png`,
    accent: "#94c4f0",
    lore: "Waits in moonlight at the 200 EMA and releases the Sacred Arrow on the oversold bounce.",
    roster: "active",
  },
  manish: {
    name: "Manish",
    dota: "Invoker",
    img: `${CDN}/invoker.png`,
    accent: "#f0b85a",
    lore: "The human quant — z-scores Quas, peer slopes Wex, ten spells of his own pipeline.",
    roster: "active",
  },
  ema_pullback: {
    name: "EMA Pullback",
    dota: "Juggernaut",
    img: `${CDN}/juggernaut.png`,
    accent: "#8fa8e8",
    lore: "Rides the trend blade-first and Omnislashes the dip at the 20 EMA. Spins out when the trend breaks.",
    roster: "active",
  },
  breakout: {
    name: "Breakout",
    dota: "Sven",
    img: `${CDN}/sven.png`,
    accent: "#b8a0f0",
    lore: "God's Strength through the consolidation ceiling on 2x volume. Benched — fighting for a roster spot.",
    roster: "bench",
  },
  vcp: {
    name: "VCP",
    dota: "Templar Assassin",
    img: `${CDN}/templar_assassin.png`,
    accent: "#d090e0",
    lore: "Refraction tightens, volatility coils — then the Psi Blade strikes. Benched — fighting for a roster spot.",
    roster: "bench",
  },
  fib_pullback: {
    name: "Fib Pullback",
    dota: "Puck",
    img: `${CDN}/puck.png`,
    accent: "#6fd0d8",
    lore: "Phase-shifts back to the golden ratio before rejoining the fight. Benched — fighting for a roster spot.",
    roster: "bench",
  },
  fear_reversion: {
    name: "Fear Reversion",
    dota: "Bane",
    img: `${CDN}/bane.png`,
    accent: "#e8a060",
    lore: "Feeds on the map's nightmares — buys reversal candles when VIX spikes. Benched — fighting for a roster spot.",
    roster: "bench",
  },
  // ── ML heroes (daily_suggestor.trades) ────────────────────
  s05_garch_volume: {
    name: "GARudaVahana",
    dota: "Outworld Destroyer",
    img: `${CDN}/obsidian_destroyer.png`,
    accent: "#b080e0",
    lore: "Banishes volatility to the astral plane — Sanity's Eclipse when the GARCH regime turns.",
    roster: "active",
  },
  s07_wavelet_volume: {
    name: "Wayuputra",
    dota: "Windranger",
    img: `${CDN}/windrunner.png`,
    accent: "#9cc868",
    lore: "Reads the wind in wavelets — Powershot through the volume gusts.",
    roster: "active",
  },
  sanjay_xgb_b8: {
    name: "Gobin xood",
    dota: "Nature's Prophet",
    img: `${CDN}/furion.png`,
    accent: "#7fd07f",
    lore: "Grows a forest of gradient-boosted trees and teleports in exactly where they point.",
    roster: "active",
  },
  s08_gap_momentum: {
    name: "GaMomra",
    dota: "Pudge",
    img: `${CDN}/pudge.png`,
    accent: "#e07058",
    lore: "Hooks the gap before the market sees it — fresh meat for the momentum grinder.",
    roster: "active",
  },
  s06_tcn_ohlcv: {
    name: "TeCNa",
    dota: "Techies",
    img: `${CDN}/techies.png`,
    accent: "#ecd060",
    lore: "Mines every candle with temporal convolutions — boom when the pattern steps on it.",
    roster: "active",
  },
  s11_cluster_meanrev: {
    name: "KlaMeReous",
    dota: "Meepo",
    img: `${CDN}/meepo.png`,
    accent: "#d0a878",
    lore: "Five clones in five clusters — when one strays too far from the pack, it snaps back.",
    roster: "active",
  },
};

export const ACTIVE_SOURCES: SignalSource[] = [
  "rs_resilience",
  "ema_pullback",
  "mean_reversion",
  "s05_garch_volume",
  "s07_wavelet_volume",
  "sanjay_xgb_b8",
  "s08_gap_momentum",
  "s06_tcn_ohlcv",
  "s11_cluster_meanrev",
  "manish",
];
export const BENCH_SOURCES: SignalSource[] = ["breakout", "vcp", "fib_pullback", "fear_reversion"];

/** The 6 daily_suggestor strategies (keys in daily_suggestor.trades.strategy) */
export const ML_SOURCES: SignalSource[] = [
  "s05_garch_volume",
  "s07_wavelet_volume",
  "sanjay_xgb_b8",
  "s08_gap_momentum",
  "s06_tcn_ohlcv",
  "s11_cluster_meanrev",
];

/** Divine = backend conviction rank 1–2 (signal_strength = 'Strong'); Rare = rest. PRD §2.3 */
export function tierOf(signalStrength: string | null): "divine" | "rare" {
  return signalStrength?.toLowerCase() === "strong" ? "divine" : "rare";
}

/** Themed exit-reason copy (PRD §3.1; daily_suggestor uses target/stop/time) */
export const EXIT_REASON_COPY: Record<string, string> = {
  trend_break: "Your tower has fallen",
  stop_loss: "You have been slain",
  stop: "You have been slain",
  rs_fade: "The buff has expired",
  time_exit: "The game has gone late",
  timeout: "The game has gone late",
  time: "The game has gone late",
  target_hit: "Objective secured",
  target: "Objective secured",
  outside_buy_range: "The arrow missed its mark",
};

export function exitReasonCopy(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return EXIT_REASON_COPY[reason] ?? reason.replace(/_/g, " ");
}
