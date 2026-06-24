"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, ChevronDown, Swords } from "lucide-react";
import { formatScanDateIST, isScanStale, isWithinDays, maxDateStr, normalizeDateStr } from "@/lib/stocks/format-date";
import type { SignalSource, UnifiedSignal } from "@/lib/stocks/types";
import { SOURCE_PRIORITY } from "@/lib/stocks/types";
import { sortSignalsNewestFirst } from "@/lib/stocks/signal-helpers";
import {
  HERO_META,
  ACTIVE_SOURCES,
  BENCH_SOURCES,
  tierOf,
  exitReasonCopy,
} from "@/lib/stocks/heroes";
import { UnifiedSignalCard } from "./swing/unified-signal-card";
import { KiteTradeActions } from "./swing/kite-trade-actions";
import { PnlBadge } from "./strategy-badge";
import { HeroPortrait, HeroFace, HeroChip } from "./hero-portrait";
import { KiteOrderToast, type PlacedOrder } from "./kite-order-toast";

type CurrentPrices = Record<string, { price: number; change: number; changePct: number } | null>;

type KiteHolding = { tradingsymbol: string; quantity: number };

type ExitSignal = {
  symbol: string;
  strategy: string;
  reason: string;
  ref_price: number | null;
  date: string;
};

type OpenTrade = {
  _id: string;
  source: string;
  signalRef: string;
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  target: number | null;
  stopLoss: number | null;
  status: string;
  livePrice?: number | null;
  unrealizedPnl?: number | null;
  unrealizedPnlPct?: number | null;
  invested?: number;
};

type SimClosedTrade = {
  id: number | string;
  strategy: string;
  symbol: string;
  signal_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  pnl: number | null;
  exit_reason: string | null;
  status: string;
};

type ClosedListItem =
  | { type: "signal"; data: UnifiedSignal }
  | { type: "sim"; data: SimClosedTrade };

function closedExitDate(item: ClosedListItem): string {
  const raw = item.type === "signal" ? item.data.exitDate : item.data.exit_date;
  return normalizeDateStr(raw);
}

function daysHeld(entryDate: string): number {
  const ms = Date.now() - new Date(entryDate + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function fmtInr(n: number | null | undefined) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const SWING_SOURCES = new Set<SignalSource>(SOURCE_PRIORITY.filter((s) => s !== "manish"));
const ALL_SOURCES: SignalSource[] = SOURCE_PRIORITY;

const FIRST_BLOOD_KEY = "dota-first-blood";

function flattenPayload(payload: Record<SignalSource, { ok: boolean; data?: UnifiedSignal[] }>): UnifiedSignal[] {
  return ALL_SOURCES.flatMap((s) => (payload[s]?.ok ? payload[s].data ?? [] : []));
}

export function UnifiedSignalsPage() {
  const params = useSearchParams();
  const router = useRouter();

  const sourceFilter = (params.get("strategy") as SignalSource | null) ?? "all";
  const statusFilter = params.get("status") === "closed" ? "closed" : "open";
  const freshOnly = params.get("fresh") === "1";

  const [signals, setSignals] = useState<UnifiedSignal[]>([]);
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);
  const [exits, setExits] = useState<ExitSignal[]>([]);
  const [prices, setPrices] = useState<CurrentPrices>({});
  const [simClosed, setSimClosed] = useState<SimClosedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kiteConnected, setKiteConnected] = useState(false);
  const [kiteHoldings, setKiteHoldings] = useState<Record<string, number>>({});
  const [defaultTradeAmount, setDefaultTradeAmount] = useState(10000);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [benchOpen, setBenchOpen] = useState(false);

  const loggedRefs = useMemo(() => new Set(openTrades.map((t) => t.signalRef)), [openTrades]);

  const lastScanDate = useMemo(() => {
    const dates = signals.filter((s) => s.status === "open").map((s) => s.signalDate);
    return maxDateStr(dates);
  }, [signals]);

  const manishClosed14d = useMemo(
    () =>
      signals.filter(
        (s) => s.source === "manish" && s.status === "closed" && s.exitDate && isWithinDays(s.exitDate, 14)
      ),
    [signals]
  );

  function countOpen(src: SignalSource | "all" = "all") {
    let list = signals.filter((s) => s.status === "open");
    if (src !== "all") list = list.filter((s) => s.source === src);
    if (freshOnly && lastScanDate) {
      list = list.filter((s) => normalizeDateStr(s.signalDate) === lastScanDate);
    }
    return list.length;
  }

  function countClosed(src: SignalSource | "all" = "all") {
    if (src !== "all") {
      if (src === "manish") return manishClosed14d.length;
      return simClosed.filter((t) => t.strategy === src).length;
    }
    return manishClosed14d.length + simClosed.length;
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sigRes, mlRes, tradesRes, perfRes, kiteStatusRes, settingsRes, exitRes] = await Promise.all([
        fetch("/api/stocks/signals/all"),
        fetch("/api/stocks/ml/signals"),
        fetch("/api/stocks/trades?status=open"),
        fetch("/api/stocks/swing/performance"),
        fetch("/api/kite/status"),
        fetch("/api/stocks/settings"),
        fetch("/api/stocks/swing/exit-signals"),
      ]);
      if (!sigRes.ok) throw new Error("Failed to load signals");
      const payload = await sigRes.json();
      let all = flattenPayload(payload);
      if (mlRes.ok) {
        const ml = await mlRes.json();
        all = [...all, ...((ml.data as UnifiedSignal[]) ?? [])];
      }
      setSignals(all);

      if (tradesRes.ok) {
        const trades = (await tradesRes.json()) as OpenTrade[];
        setOpenTrades(trades.filter((t) => t.status === "open"));
      }

      if (exitRes.ok) {
        const data = await exitRes.json();
        setExits((data.exits as ExitSignal[]) ?? []);
      }

      if (perfRes.ok) {
        const perf = await perfRes.json();
        const closed = (perf.trades as SimClosedTrade[]).filter(
          (t) =>
            t.status === "closed" &&
            t.strategy !== "manish" &&
            t.exit_date &&
            isWithinDays(String(t.exit_date), 14)
        );
        setSimClosed(closed);
      }

      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setDefaultTradeAmount(s.defaultTradeAmount ?? 10000);
      }

      let connected = false;
      if (kiteStatusRes.ok) {
        const ks = await kiteStatusRes.json();
        connected = ks.connected === true;
        setKiteConnected(connected);
      } else {
        setKiteConnected(false);
      }

      if (connected) {
        const holdRes = await fetch("/api/kite/holdings");
        if (holdRes.ok) {
          const holdings = (await holdRes.json()) as KiteHolding[];
          const map: Record<string, number> = {};
          for (const h of holdings) {
            map[h.tradingsymbol.toUpperCase()] = h.quantity;
          }
          setKiteHoldings(map);
        }
      } else {
        setKiteHoldings({});
      }

      const openTickers = [...new Set(all.filter((s) => s.status === "open").map((s) => s.ticker))];
      if (openTickers.length) {
        const priceRes = await fetch(`/api/stocks/current-price?tickers=${openTickers.join(",")}`);
        if (priceRes.ok) setPrices(await priceRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function setSource(s: SignalSource | "all") {
    const next = new URLSearchParams(params.toString());
    if (s === "all") next.delete("strategy");
    else next.set("strategy", s);
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  function setStatus(s: "open" | "closed") {
    const next = new URLSearchParams(params.toString());
    if (s === "open") next.delete("status");
    else next.set("status", s);
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  function clearFresh() {
    const next = new URLSearchParams(params.toString());
    next.delete("fresh");
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  // ── Filtering (unchanged behaviour) ─────────────────────────
  let filtered =
    statusFilter === "closed"
      ? signals.filter((s) => s.status === "closed" && s.exitDate && isWithinDays(s.exitDate, 14))
      : signals.filter((s) => s.status === "open");
  if (freshOnly && lastScanDate && statusFilter === "open") {
    filtered = filtered.filter((s) => normalizeDateStr(s.signalDate) === lastScanDate);
  }
  if (sourceFilter !== "all") {
    filtered = filtered.filter((s) => s.source === sourceFilter);
  }

  // Pick Phase grouping (PRD §2.3 — "5 scouted, 2 recommended"):
  // Divine picks from the active roster on top, Rare after, bench picks last.
  const openPicks = statusFilter === "open" ? filtered : [];
  const divinePicks = sortSignalsNewestFirst(
    openPicks.filter(
      (s) => HERO_META[s.source].roster === "active" && tierOf(s.signalStrength) === "divine"
    )
  );
  const rarePicks = sortSignalsNewestFirst(
    openPicks.filter(
      (s) => HERO_META[s.source].roster === "active" && tierOf(s.signalStrength) !== "divine"
    )
  );
  const benchPicks = sortSignalsNewestFirst(openPicks.filter((s) => HERO_META[s.source].roster === "bench"));
  const divineCount = divinePicks.length;
  const scanStale = isScanStale(lastScanDate);

  let filteredSimClosed: SimClosedTrade[] = [];
  if (statusFilter === "closed") {
    if (sourceFilter === "all") {
      filteredSimClosed = simClosed;
    } else if (SWING_SOURCES.has(sourceFilter)) {
      filteredSimClosed = simClosed.filter((t) => t.strategy === sourceFilter);
    }
  }

  const showSimClosed =
    statusFilter === "closed" && (sourceFilter === "all" || SWING_SOURCES.has(sourceFilter));

  const closedItems: ClosedListItem[] = [];
  if (statusFilter === "closed") {
    if (sourceFilter === "all" || sourceFilter === "manish") {
      closedItems.push(...filtered.map((s) => ({ type: "signal" as const, data: s })));
    }
    if (showSimClosed) {
      closedItems.push(...filteredSimClosed.map((t) => ({ type: "sim" as const, data: t })));
    }
    closedItems.sort((a, b) => closedExitDate(b).localeCompare(closedExitDate(a)));
  }

  const filteredOpenCount = countOpen(sourceFilter);
  const filteredClosedCount = countClosed(sourceFilter);

  const hasContent = statusFilter === "open" ? openPicks.length > 0 : closedItems.length > 0;

  // ── Retreat calls: tonight's exits matched to what you hold ──
  const retreatCalls = useMemo(() => {
    return exits.filter((e) => {
      const sym = e.symbol.toUpperCase();
      if ((kiteHoldings[sym] ?? 0) > 0) return true;
      return openTrades.some(
        (t) => t.ticker.toUpperCase() === sym && (t.source === e.strategy || !e.strategy)
      );
    });
  }, [exits, kiteHoldings, openTrades]);

  const exitedKeys = useMemo(
    () => new Set(retreatCalls.map((e) => e.symbol.toUpperCase())),
    [retreatCalls]
  );

  // ── On the map: open logged trades, exit-flagged first ──────
  const onTheMap = useMemo(() => {
    return [...openTrades].sort((a, b) => {
      const ea = exitedKeys.has(a.ticker.toUpperCase()) ? 0 : 1;
      const eb = exitedKeys.has(b.ticker.toUpperCase()) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return (b.unrealizedPnlPct ?? 0) - (a.unrealizedPnlPct ?? 0);
    });
  }, [openTrades, exitedKeys]);

  const handleOrderPlaced = useCallback((order: PlacedOrder) => {
    let firstBlood = false;
    if (order.transactionType === "BUY" && typeof window !== "undefined") {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(FIRST_BLOOD_KEY) !== today) {
        localStorage.setItem(FIRST_BLOOD_KEY, today);
        firstBlood = true;
      }
    }
    setPlacedOrder({ ...order, firstBlood });
    setTimeout(() => {
      fetch("/api/kite/holdings")
        .then((r) => (r.ok ? r.json() : []))
        .then((holdings: KiteHolding[]) => {
          const map: Record<string, number> = {};
          for (const h of holdings) map[h.tradingsymbol.toUpperCase()] = h.quantity;
          setKiteHoldings(map);
        })
        .catch(() => {});
    }, 2000);
  }, []);

  return (
    <div className="min-h-full">
      <KiteOrderToast order={placedOrder} onDismiss={() => setPlacedOrder(null)} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="md:sticky md:top-14 md:z-10 bg-[#11161f]/95 backdrop-blur-xl border-b border-[#2a3344]">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b1c08] to-[#120c04] border border-[#6b4c16] flex items-center justify-center shrink-0">
                <Swords size={18} className="text-[var(--dota-gold)]" />
              </div>
              <div className="min-w-0">
                <h1 className="cz text-base font-black leading-tight">War Room</h1>
                <p className="text-[11px] text-[var(--dota-dim)] truncate">
                  {sourceFilter !== "all" && (
                    <span className="font-semibold" style={{ color: HERO_META[sourceFilter].accent }}>
                      {HERO_META[sourceFilter].name} ·{" "}
                    </span>
                  )}
                  {lastScanDate ? `Scouted ${formatScanDateIST(lastScanDate)} · ` : ""}
                  <span className="text-[#bcdb3e] font-semibold">{filteredOpenCount} open</span>
                  {" · "}
                  <span className="text-[#b394f0] font-semibold">{filteredClosedCount} closed</span>
                </p>
              </div>
            </div>
            <StatusToggle
              status={statusFilter}
              openCount={filteredOpenCount}
              closedCount={filteredClosedCount}
              onChange={setStatus}
            />
            <button
              onClick={fetchAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)] text-xs font-semibold hover:bg-[rgba(255,216,77,0.12)] transition-colors disabled:opacity-50 shrink-0"
              aria-label="Refresh"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Rescan</span>
            </button>
          </div>
        </div>

        {/* ── Hero roster bar ──────────────────────────────────── */}
        <div className="px-4 md:px-6 pb-3 flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <RosterChip
            label="All"
            img={null}
            accent="#f4d03f"
            active={sourceFilter === "all"}
            count={statusFilter === "closed" ? countClosed("all") : countOpen("all")}
            onClick={() => setSource("all")}
          />
          {ACTIVE_SOURCES.map((src) => {
            const h = HERO_META[src];
            return (
              <RosterChip
                key={src}
                label={h.name}
                img={h.img}
                accent={h.accent}
                active={sourceFilter === src}
                count={statusFilter === "closed" ? countClosed(src) : countOpen(src)}
                onClick={() => setSource(src)}
              />
            );
          })}
          <button
            type="button"
            onClick={() => setBenchOpen((v) => !v)}
            className="flex flex-col items-center gap-1 min-w-[58px] opacity-70 hover:opacity-100 transition-opacity"
          >
            <div
              className={`w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center ${
                benchOpen || (sourceFilter !== "all" && BENCH_SOURCES.includes(sourceFilter))
                  ? "border-[var(--dota-dim)] text-[var(--dota-text)]"
                  : "border-[#38415a] text-[var(--dota-dim)]"
              }`}
            >
              <ChevronDown size={16} className={`transition-transform ${benchOpen ? "rotate-180" : ""}`} />
            </div>
            <span className="cz text-[8px] font-bold !text-[var(--dota-dim)]">Bench</span>
          </button>
        </div>

        {/* ── Bench row (collapsed by default) ─────────────────── */}
        {(benchOpen || (sourceFilter !== "all" && BENCH_SOURCES.includes(sourceFilter))) && (
          <div className="px-4 md:px-6 pb-3 flex gap-2 flex-wrap items-center border-t border-dashed border-[#303a4e] pt-2.5">
            <span className="cz text-[9px] font-bold !text-[var(--dota-dim)] mr-1">
              🪑 Benched — on trial
            </span>
            {BENCH_SOURCES.map((src) => {
              const h = HERO_META[src];
              const active = sourceFilter === src;
              const count = statusFilter === "closed" ? countClosed(src) : countOpen(src);
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSource(src)}
                  className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[10.5px] font-semibold border transition-all ${
                    active ? "bg-white/10" : "bg-white/[0.02] grayscale-[0.5] opacity-75 hover:opacity-100 hover:grayscale-0"
                  }`}
                  style={{
                    borderColor: active ? h.accent : "#38415a",
                    color: active ? h.accent : "var(--dota-text)",
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full overflow-hidden border bg-black shrink-0"
                    style={{ borderColor: `${h.accent}66` }}
                  >
                    {h.img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.img}
                        alt={h.dota ?? h.name}
                        className="w-full h-full object-cover object-top scale-[1.6]"
                        loading="lazy"
                      />
                    )}
                  </span>
                  {h.name}
                  <span className="text-[var(--dota-dim)] tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {freshOnly && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.05)] flex items-center justify-between gap-2 text-xs text-[var(--dota-gold)]">
          <span>
            Tonight&apos;s scout only · {filtered.length} pick{filtered.length !== 1 ? "s" : ""}
          </span>
          <button onClick={clearFresh} className="text-[var(--dota-gold)] hover:underline shrink-0">
            Show all
          </button>
        </div>
      )}

      {scanStale && lastScanDate && statusFilter === "open" && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-lg border border-[#76302a] bg-[rgba(212,69,49,0.08)] text-xs text-[#ffb4a6]">
          <span className="font-semibold text-[#ff9d8d]">Scanner offline — </span>
          Last evening scan was {formatScanDateIST(lastScanDate)}. New picks normally land by 6 PM IST on
          weekdays. Check the DigitalOcean cron or run the scanner manually.
        </div>
      )}

      <div className="px-4 md:px-6 pt-4 pb-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-[#574212] border-t-[var(--dota-gold)] rounded-full animate-spin" />
            <p className="cz text-[10px] !text-[var(--dota-dim)]">Loading the map…</p>
          </div>
        )}

        {!loading && error && (
          <p className="text-center text-sm text-[var(--dota-dire-bright)] py-12">{error}</p>
        )}

        {!loading && !error && statusFilter === "open" && (
          <>
            {/* ══ Section 1: RETREAT CALLS ══════════════════════ */}
            {retreatCalls.length > 0 && (
              <section className="mb-6">
                <SectionHead title="Retreat Calls" color="var(--dota-dire-bright)" tag={`${retreatCalls.length} tonight`} />
                <div className="space-y-2.5">
                  {retreatCalls.map((e) => (
                    <RetreatBanner
                      key={`${e.symbol}-${e.strategy}`}
                      exit={e}
                      holdingQty={kiteHoldings[e.symbol.toUpperCase()] ?? 0}
                      trade={openTrades.find((t) => t.ticker.toUpperCase() === e.symbol.toUpperCase())}
                      kiteConnected={kiteConnected}
                      defaultTradeAmount={defaultTradeAmount}
                      onOrderPlaced={handleOrderPlaced}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ══ Section 2: ON THE MAP ═════════════════════════ */}
            {onTheMap.length > 0 && sourceFilter === "all" && !freshOnly && (
              <section className="mb-6">
                <SectionHead title="On the Map" tag={`${onTheMap.length} hero${onTheMap.length !== 1 ? "es" : ""} alive`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {onTheMap.map((t) => (
                    <PositionCard
                      key={t._id}
                      trade={t}
                      exited={exitedKeys.has(t.ticker.toUpperCase())}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ══ Section 3: PICK PHASE ═════════════════════════ */}
            <section>
              <SectionHead
                title="Pick Phase"
                color="var(--dota-radiant-bright)"
                tag={
                  openPicks.length > 0
                    ? `${openPicks.length} scouted · ${divineCount} recommended`
                    : undefined
                }
              />
              {!hasContent ? (
                <div className="text-center py-16 px-4">
                  <p className="text-sm text-[var(--dota-dim)] mb-3">
                    The scouts ride out at 6 PM IST. Return after market close.
                  </p>
                  <Link
                    href="/stocks/performance"
                    className="text-sm text-[var(--dota-gold)] font-medium hover:underline"
                  >
                    Watch the bot match →
                  </Link>
                </div>
              ) : (
                <div className="space-y-5">
                  {divinePicks.length > 0 && (
                    <div>
                      <PickGroupHead tone="divine" label="Recommended" count={divinePicks.length} />
                      <PickGrid
                        list={divinePicks}
                        prices={prices}
                        loggedRefs={loggedRefs}
                        kiteConnected={kiteConnected}
                        kiteHoldings={kiteHoldings}
                        defaultTradeAmount={defaultTradeAmount}
                        onLogged={fetchAll}
                        onOrderPlaced={handleOrderPlaced}
                      />
                    </div>
                  )}
                  {rarePicks.length > 0 && (
                    <div>
                      <PickGroupHead tone="rare" label="Also scouted" count={rarePicks.length} />
                      <PickGrid
                        list={rarePicks}
                        prices={prices}
                        loggedRefs={loggedRefs}
                        kiteConnected={kiteConnected}
                        kiteHoldings={kiteHoldings}
                        defaultTradeAmount={defaultTradeAmount}
                        onLogged={fetchAll}
                        onOrderPlaced={handleOrderPlaced}
                      />
                    </div>
                  )}
                  {benchPicks.length > 0 && (
                    <div className="opacity-80">
                      <PickGroupHead tone="bench" label="From the bench" count={benchPicks.length} />
                      <PickGrid
                        list={benchPicks}
                        prices={prices}
                        loggedRefs={loggedRefs}
                        kiteConnected={kiteConnected}
                        kiteHoldings={kiteHoldings}
                        defaultTradeAmount={defaultTradeAmount}
                        onLogged={fetchAll}
                        onOrderPlaced={handleOrderPlaced}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ══ Closed view (match results) ═════════════════════── */}
        {!loading && !error && statusFilter === "closed" && (
          <>
            {!hasContent ? (
              <div className="text-center py-16 px-4">
                <p className="text-sm text-[var(--dota-dim)] mb-3">
                  {sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                    ? `No simulated ${HERO_META[sourceFilter].name} closes in the last 14 days.`
                    : "No matches finished in the last 14 days."}
                </p>
                <Link
                  href={
                    sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                      ? `/stocks/performance?strategy=${sourceFilter}`
                      : "/stocks/performance"
                  }
                  className="text-sm text-[var(--dota-gold)] font-medium hover:underline"
                >
                  Full match history →
                </Link>
              </div>
            ) : (
              <>
                {showSimClosed && filteredSimClosed.length > 0 && (
                  <div className="mb-4 px-3 py-2 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.05)] text-xs text-[var(--dota-gold)]">
                    Closes below are from <strong>Demo Mode</strong> (₹10k paper auto-buy). Real gold lives
                    in{" "}
                    <Link href="/stocks/portfolio" className="font-semibold underline">
                      Ranked
                    </Link>
                    .
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {closedItems.map((item) =>
                    item.type === "signal" ? (
                      <UnifiedSignalCard
                        key={item.data.id}
                        signal={item.data}
                        currentPrice={prices[item.data.ticker] ?? undefined}
                        logged={loggedRefs.has(item.data.id)}
                        onLogged={fetchAll}
                        kiteConnected={kiteConnected}
                        holdingQty={kiteHoldings[item.data.ticker.toUpperCase()] ?? 0}
                        defaultTradeAmount={defaultTradeAmount}
                        onOrderPlaced={handleOrderPlaced}
                      />
                    ) : (
                      <SimulatedClosedCard key={`sim-${item.data.id}`} trade={item.data} />
                    )
                  )}
                </div>
                <div className="text-center mt-6">
                  <Link
                    href={
                      sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                        ? `/stocks/performance?strategy=${sourceFilter}`
                        : "/stocks/performance"
                    }
                    className="text-sm text-[var(--dota-gold)] font-medium hover:underline"
                  >
                    Full match history →
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Pick Phase sub-group header (Divine / Rare / Bench) ────── */
function PickGroupHead({
  tone,
  label,
  count,
}: {
  tone: "divine" | "rare" | "bench";
  label: string;
  count: number;
}) {
  const style =
    tone === "divine"
      ? { sigil: "★", color: "#ffcf66", line: "rgba(245,173,20,0.35)" }
      : tone === "rare"
        ? { sigil: "◆", color: "#9ab4ff", line: "rgba(107,148,255,0.3)" }
        : { sigil: "🪑", color: "var(--dota-dim)", line: "rgba(142,152,173,0.25)" };
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[11px]" style={{ color: style.color }} aria-hidden>
        {style.sigil}
      </span>
      <span
        className="cz text-[9.5px] font-bold"
        style={{ color: style.color, letterSpacing: "0.18em" }}
      >
        {label}
      </span>
      <span className="text-[10px] text-[var(--dota-dim)] tabular-nums">{count}</span>
      <div
        className="flex-1 h-px"
        style={{ background: `linear-gradient(90deg, ${style.line}, transparent)` }}
      />
    </div>
  );
}

/* ── Pick card grid (shared by the three tiers) ─────────────── */
function PickGrid({
  list,
  prices,
  loggedRefs,
  kiteConnected,
  kiteHoldings,
  defaultTradeAmount,
  onLogged,
  onOrderPlaced,
}: {
  list: UnifiedSignal[];
  prices: CurrentPrices;
  loggedRefs: Set<string>;
  kiteConnected: boolean;
  kiteHoldings: Record<string, number>;
  defaultTradeAmount: number;
  onLogged: () => void;
  onOrderPlaced: (o: PlacedOrder) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map((s) => (
        <UnifiedSignalCard
          key={s.id}
          signal={s}
          currentPrice={prices[s.ticker] ?? undefined}
          logged={loggedRefs.has(s.id)}
          onLogged={onLogged}
          kiteConnected={kiteConnected}
          holdingQty={kiteHoldings[s.ticker.toUpperCase()] ?? 0}
          defaultTradeAmount={defaultTradeAmount}
          onOrderPlaced={onOrderPlaced}
        />
      ))}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────── */
function SectionHead({ title, tag, color }: { title: string; tag?: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3">
      <h2 className="cz text-[13px] font-bold" style={color ? { color } : undefined}>
        {title}
      </h2>
      {tag && <span className="text-[11px] text-[var(--dota-dim)]">{tag}</span>}
      <div className="flex-1 h-px bg-gradient-to-r from-[#38415a] to-transparent" />
    </div>
  );
}

/* ── Retreat banner (exit signal → GG sell) ─────────────────── */
function RetreatBanner({
  exit,
  holdingQty,
  trade,
  kiteConnected,
  defaultTradeAmount,
  onOrderPlaced,
}: {
  exit: ExitSignal;
  holdingQty: number;
  trade?: OpenTrade;
  kiteConnected: boolean;
  defaultTradeAmount: number;
  onOrderPlaced: (o: PlacedOrder) => void;
}) {
  const [ggOpen, setGgOpen] = useState(false);
  const source = (exit.strategy || trade?.source) as SignalSource | undefined;
  const hero = source && HERO_META[source] ? HERO_META[source] : null;
  const live = trade?.livePrice ?? null;
  const pnlPct = trade?.unrealizedPnlPct ?? null;

  return (
    <div className="glow-retreat rounded-lg overflow-hidden anim-rise">
      <div className="px-4 py-3 flex items-center gap-3.5 flex-wrap">
        <span className="text-xl" aria-hidden>
          🚨
        </span>
        {source && hero && <HeroPortrait source={source} size="md" />}
        <div className="min-w-[140px]">
          <p className="cz text-[10px] font-black !text-[var(--dota-dire-bright)]" style={{ letterSpacing: "0.2em" }}>
            Retreat!
          </p>
          <p className="text-base font-bold text-[var(--dota-head)] leading-tight">{exit.symbol}</p>
          {hero && (
            <p className="cz text-[8.5px] font-bold" style={{ color: hero.accent, letterSpacing: "0.12em" }}>
              {hero.name}
            </p>
          )}
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs text-[#d9a49c]">
            🗼 <b className="text-[#e8b3a9]">{exitReasonCopy(exit.reason)}</b>
            {exit.ref_price != null && <> — ref {fmtInr(exit.ref_price)}</>}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--dota-dim)]">
            {live != null && <span>LIVE {fmtInr(live)}</span>}
            {trade && <span>entry {fmtInr(trade.entryPrice)}</span>}
            {trade && <span>held {daysHeld(trade.entryDate)}d</span>}
          </div>
        </div>
        {pnlPct != null && (
          <div className="text-right mr-1">
            <p className={`text-lg font-bold ${pnlPct >= 0 ? "text-[#bcdb3e]" : "text-[#f06352]"}`}>
              {pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(1)}%
            </p>
            <p className="text-[9px] tracking-[0.1em] uppercase text-[var(--dota-dim)]">Unrealized gold</p>
          </div>
        )}
        {kiteConnected && holdingQty > 0 ? (
          <button onClick={() => setGgOpen((v) => !v)} className="cz btn-gg px-6 py-2.5 rounded-md text-[13px] font-black" style={{ letterSpacing: "0.2em" }}>
            GG
          </button>
        ) : (
          <Link
            href="/stocks/portfolio?tab=trades"
            className="cz px-4 py-2.5 rounded-md text-[10px] font-bold border border-[#76302a] !text-[#ff9d8d] hover:bg-[rgba(212,69,49,0.1)]"
          >
            Mark closed →
          </Link>
        )}
      </div>
      {ggOpen && kiteConnected && holdingQty > 0 && (
        <div className="px-4 pb-4 pt-1 border-t border-[#4e201a] max-w-md">
          <KiteTradeActions
            ticker={exit.symbol}
            ltp={live}
            holdingQty={holdingQty}
            defaultTradeAmount={defaultTradeAmount}
            signalRef={trade?.signalRef ?? `exit-${exit.symbol}`}
            strategy={exit.strategy}
            onOrderPlaced={onOrderPlaced}
          />
        </div>
      )}
    </div>
  );
}

/* ── Open position card (On the Map) ────────────────────────── */
function PositionCard({ trade, exited }: { trade: OpenTrade; exited: boolean }) {
  const source = trade.source as SignalSource;
  const hero = HERO_META[source] ?? null;
  const pnlPct = trade.unrealizedPnlPct ?? null;
  const aegis = pnlPct != null && pnlPct >= 8;
  const held = daysHeld(trade.entryDate);

  return (
    <div className={`rounded-xl overflow-hidden dota-panel flex ${exited ? "glow-retreat" : ""}`}>
      <div className="w-[3px] shrink-0" style={{ backgroundColor: hero?.accent ?? "#444" }} />
      <div className="flex-1 p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {hero && <HeroPortrait source={source} size="md" />}
            <div className="min-w-0">
              <span className="text-lg font-bold text-[var(--dota-head)]">{trade.ticker}</span>
              <p
                className="cz text-[9px] font-bold truncate"
                style={{ color: hero?.accent ?? "var(--dota-dim)", letterSpacing: "0.14em" }}
              >
                {hero?.name ?? trade.source}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {exited && (
              <span className="cz text-[8.5px] font-black px-2 py-0.5 rounded border border-[#76302a] bg-[rgba(212,69,49,0.15)] !text-[#ff9d8d]" style={{ letterSpacing: "0.15em" }}>
                Exit
              </span>
            )}
            {aegis && (
              <span className="badge-aegis cz text-[8.5px] font-black px-2 py-0.5 rounded" style={{ letterSpacing: "0.12em" }}>
                🛡 Aegis
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <div className="dota-stat rounded-md px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--dota-dim)]">Live</p>
            <p className="text-[13px] font-semibold text-[var(--dota-head)]">{fmtInr(trade.livePrice)}</p>
          </div>
          <div
            className="dota-stat rounded-md px-2 py-1.5 text-center"
            style={
              pnlPct == null
                ? undefined
                : pnlPct >= 0
                  ? { borderColor: "#46571f", background: "rgba(176,210,50,0.08)" }
                  : { borderColor: "#5e2a1f", background: "rgba(212,69,49,0.08)" }
            }
          >
            <p
              className={`text-[9px] uppercase tracking-[0.12em] ${
                pnlPct == null ? "text-[var(--dota-dim)]" : pnlPct >= 0 ? "text-[#9cc868]" : "text-[#e89080]"
              }`}
            >
              Gold · P&L
            </p>
            <p
              className={`text-[13px] font-semibold ${
                pnlPct == null ? "text-[var(--dota-head)]" : pnlPct >= 0 ? "text-[#bcdb3e]" : "text-[#f06352]"
              }`}
            >
              {pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div
            className="dota-stat rounded-md px-2 py-1.5 text-center"
            style={{ borderColor: "#5e2a1f", background: "rgba(212,69,49,0.08)" }}
          >
            <p className="text-[9px] uppercase tracking-[0.12em] text-[#e89080]">🗼 Tower SL</p>
            <p className="text-[13px] font-semibold text-[#ffb4a6]">{fmtInr(trade.stopLoss)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-[var(--dota-dim)]">
          <span>
            entry {fmtInr(trade.entryPrice)} × {trade.quantity}
          </span>
          <span>
            game time <b className="text-[var(--dota-text)]">DAY {held}</b>
          </span>
          {trade.target != null && <span>target {fmtInr(trade.target)}</span>}
        </div>

        <div className="mt-2 pt-2 border-t border-[#2a3344] flex items-center justify-between">
          <span className="text-[10px] text-[var(--dota-dim)]">
            invested <b className="text-[var(--dota-gold)]">{fmtInr(trade.invested)}</b>
          </span>
          <Link href="/stocks/portfolio?tab=trades" className="text-[11px] text-[var(--dota-gold)] hover:underline">
            Manage →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Simulated closed card (Demo Mode result) ───────────────── */
function SimulatedClosedCard({ trade }: { trade: SimClosedTrade }) {
  const source = trade.strategy as SignalSource;
  const hero = HERO_META[source] ?? null;
  const pnl = trade.pnl ?? 0;
  return (
    <div className="rounded-xl overflow-hidden dota-panel flex">
      <div className="w-[3px] shrink-0" style={{ backgroundColor: hero?.accent ?? "#444" }} />
      <div className="flex-1 p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <span className="text-lg font-bold text-[var(--dota-head)]">{trade.symbol}</span>
            <p className="text-[11px] text-[var(--dota-dim)] mt-0.5">
              Closed · {formatScanDateIST(String(trade.exit_date))}
            </p>
            <p className="text-[10px] text-[var(--dota-dim)] opacity-70">Demo Mode · ₹10k paper</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {hero && <HeroChip source={source} />}
            <PnlBadge value={pnl} unit="inr" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="dota-stat rounded-md px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--dota-dim)]">Entry</p>
            <p className="text-[13px] font-semibold text-[var(--dota-head)]">₹{trade.entry_price}</p>
          </div>
          <div className="dota-stat rounded-md px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--dota-dim)]">Exit</p>
            <p className="text-[13px] font-semibold text-[var(--dota-head)]">₹{trade.exit_price}</p>
          </div>
        </div>
        {trade.exit_reason && (
          <p className="text-[10px] text-[var(--dota-dim)] mt-2 italic">{exitReasonCopy(trade.exit_reason)}</p>
        )}
      </div>
    </div>
  );
}

/* ── Open/Closed toggle ─────────────────────────────────────── */
function StatusToggle({
  status,
  openCount,
  closedCount,
  onChange,
}: {
  status: "open" | "closed";
  openCount: number;
  closedCount: number;
  onChange: (s: "open" | "closed") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-black/40 border border-[var(--dota-border)] p-0.5 text-[11px] font-semibold shrink-0">
      <button
        type="button"
        onClick={() => onChange("open")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
          status === "open"
            ? "bg-[rgba(176,210,50,0.15)] text-[#bcdb3e] ring-1 ring-[#4a5621]"
            : "text-[var(--dota-dim)] hover:text-[var(--dota-text)]"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status === "open" ? "bg-[#bcdb3e]" : "bg-[#4a5468]"}`} />
        Open
        <span className="tabular-nums">{openCount}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("closed")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
          status === "closed"
            ? "bg-[rgba(179,148,240,0.15)] text-[#b9a3e8] ring-1 ring-[#4d4170]"
            : "text-[var(--dota-dim)] hover:text-[var(--dota-text)]"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status === "closed" ? "bg-[#b394f0]" : "bg-[#4a5468]"}`} />
        Closed
        <span className="tabular-nums">{closedCount}</span>
      </button>
    </div>
  );
}

/* ── Roster filter chip (hero face + count) ─────────────────── */
function RosterChip({
  label,
  img,
  accent,
  active,
  count,
  onClick,
  grey = false,
  title,
}: {
  label: string;
  img: string | null;
  accent: string;
  active: boolean;
  count: number | null;
  onClick?: () => void;
  grey?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={grey}
      title={title}
      className={`flex flex-col items-center gap-1 min-w-[58px] transition-opacity ${
        grey ? "cursor-not-allowed opacity-60" : active ? "opacity-100" : "opacity-70 hover:opacity-100"
      }`}
    >
      {img !== null || label !== "All" ? (
        <HeroFace img={img} accent={accent} label={label} active={active} grey={grey} />
      ) : (
        <div
          className="w-12 h-12 rounded-full border-2 flex items-center justify-center bg-black"
          style={{
            borderColor: active ? accent : "#38415a",
            boxShadow: active ? `0 0 12px ${accent}66` : undefined,
          }}
        >
          <span className="cz text-base font-black" style={{ color: accent }}>
            ★
          </span>
        </div>
      )}
      <span className="text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[var(--dota-text)] text-center leading-tight max-w-[72px] truncate">
        {label}
      </span>
      <span className="text-[9px] text-[var(--dota-dim)] tabular-nums -mt-0.5">
        {grey ? "scouting" : count}
      </span>
    </button>
  );
}
