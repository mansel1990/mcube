"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Zap } from "lucide-react";
import { formatScanDateIST, isWithinDays, maxDateStr, normalizeDateStr } from "@/lib/stocks/format-date";
import type { SignalSource, UnifiedSignal } from "@/lib/stocks/types";
import { SOURCE_META, SOURCE_PRIORITY } from "@/lib/stocks/types";
import { UnifiedSignalCard } from "./swing/unified-signal-card";
import { StrategyBadge, PnlBadge } from "./strategy-badge";
import { KiteOrderToast, type PlacedOrder } from "./kite-order-toast";

type CurrentPrices = Record<string, { price: number; change: number; changePct: number } | null>;

type KiteHolding = { tradingsymbol: string; quantity: number };

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

const SWING_SOURCES = new Set<SignalSource>(SOURCE_PRIORITY.filter((s) => s !== "manish"));

const ALL_SOURCES: SignalSource[] = SOURCE_PRIORITY;

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
  const [loggedRefs, setLoggedRefs] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<CurrentPrices>({});
  const [simClosed, setSimClosed] = useState<SimClosedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kiteConnected, setKiteConnected] = useState(false);
  const [kiteHoldings, setKiteHoldings] = useState<Record<string, number>>({});
  const [defaultTradeAmount, setDefaultTradeAmount] = useState(10000);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

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
      const [sigRes, tradesRes, perfRes, kiteStatusRes, settingsRes] = await Promise.all([
        fetch("/api/stocks/signals/all"),
        fetch("/api/stocks/trades?status=open"),
        fetch("/api/stocks/swing/performance"),
        fetch("/api/kite/status"),
        fetch("/api/stocks/settings"),
      ]);
      if (!sigRes.ok) throw new Error("Failed to load signals");
      const payload = await sigRes.json();
      const all = flattenPayload(payload);
      setSignals(all);

      if (tradesRes.ok) {
        const trades = await tradesRes.json();
        setLoggedRefs(new Set(trades.map((t: { signalRef: string }) => t.signalRef)));
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

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function setSource(s: SignalSource | "all") {
    const next = new URLSearchParams(params.toString());
    if (s === "all") next.delete("strategy"); else next.set("strategy", s);
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  function setStatus(s: "open" | "closed") {
    const next = new URLSearchParams(params.toString());
    if (s === "open") next.delete("status"); else next.set("status", s);
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  function clearFresh() {
    const next = new URLSearchParams(params.toString());
    next.delete("fresh");
    router.replace(`/stocks?${next.toString()}`, { scroll: false });
  }

  let filtered =
    statusFilter === "closed"
      ? signals.filter(
          (s) => s.status === "closed" && s.exitDate && isWithinDays(s.exitDate, 14)
        )
      : signals.filter((s) => s.status === "open");
  if (freshOnly && lastScanDate && statusFilter === "open") {
    filtered = filtered.filter((s) => normalizeDateStr(s.signalDate) === lastScanDate);
  }
  if (sourceFilter !== "all") {
    filtered = filtered.filter((s) => s.source === sourceFilter);
  }

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

  function countForSource(src: SignalSource) {
    return statusFilter === "closed" ? countClosed(src) : countOpen(src);
  }

  const hasContent =
    statusFilter === "open" ? filtered.length > 0 : closedItems.length > 0;

  const handleOrderPlaced = useCallback((order: PlacedOrder) => {
    setPlacedOrder(order);
    // Refresh holdings after a short delay
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
    <div className="min-h-full bg-[#F8FAFC]">
      <KiteOrderToast order={placedOrder} onDismiss={() => setPlacedOrder(null)} />
      <div className="md:sticky md:top-14 md:z-10 bg-white border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Zap size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Signals</h1>
                <p className="text-[11px] text-slate-500 truncate">
                  {sourceFilter !== "all" && (
                    <span className="font-semibold text-slate-700">{SOURCE_META[sourceFilter].short} · </span>
                  )}
                  {lastScanDate ? `Last scan ${formatScanDateIST(lastScanDate)} · ` : ""}
                  <span className="text-emerald-600 font-semibold">{filteredOpenCount} open</span>
                  {" · "}
                  <span className="text-violet-600 font-semibold">{filteredClosedCount} closed</span>
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50 shrink-0"
              aria-label="Refresh"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Mobile: colorful strategy tile grid */}
        <div className="md:hidden px-4 pb-4 grid grid-cols-3 gap-1.5">
          <StrategyTile
            label="All"
            openCount={countOpen("all")}
            closedCount={countClosed("all")}
            active={sourceFilter === "all"}
            onClick={() => setSource("all")}
          />
          {ALL_SOURCES.map((src) => (
            <StrategyTile
              key={src}
              label={SOURCE_META[src].short}
              openCount={countOpen(src)}
              closedCount={countClosed(src)}
              active={sourceFilter === src}
              onClick={() => setSource(src)}
              meta={SOURCE_META[src]}
            />
          ))}
        </div>

        {/* Desktop: colorful wrapped chips */}
        <div className="hidden md:flex flex-wrap gap-2 px-4 md:px-6 pb-4">
          <Chip
            active={sourceFilter === "all"}
            onClick={() => setSource("all")}
            label={`All (${statusFilter === "open" ? countOpen("all") : countClosed("all")})`}
          />
          {ALL_SOURCES.map((src) => {
            const count = countForSource(src);
            const m = SOURCE_META[src];
            return (
              <Chip
                key={src}
                active={sourceFilter === src}
                onClick={() => setSource(src)}
                label={`${m.short} (${count})`}
                meta={m}
              />
            );
          })}
        </div>
      </div>

      {freshOnly && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between gap-2 text-xs text-blue-800">
          <span>Showing last scan · {filtered.length} idea{filtered.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-2 shrink-0">
            <Link href="/stocks?status=open&fresh=1" className="font-semibold hover:underline">All ideas →</Link>
            <button onClick={clearFresh} className="text-blue-600 hover:underline">Show all</button>
          </div>
        </div>
      )}

      <div className="px-4 md:px-6 pt-4 pb-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Loading signals…</p>
          </div>
        )}

        {!loading && error && (
          <p className="text-center text-sm text-red-500 py-12">{error}</p>
        )}

        {!loading && !error && !hasContent && (
          <div className="text-center py-16 px-4">
            <p className="text-sm text-slate-500 mb-3">
              {statusFilter === "open"
                ? "Scanner runs daily at 6 PM IST. Check back after market close."
                : sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                  ? `No simulated ${SOURCE_META[sourceFilter].short} closes in the last 14 days.`
                  : "No trades closed in the last 14 days."}
            </p>
            <Link
              href={
                sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                  ? `/stocks/performance?strategy=${sourceFilter}`
                  : "/stocks/performance"
              }
              className="text-sm text-primary font-medium hover:underline"
            >
              View full simulated history →
            </Link>
          </div>
        )}

        {!loading && !error && hasContent && (
          <>
            {statusFilter === "closed" && showSimClosed && filteredSimClosed.length > 0 && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Swing closes below are <strong>simulated</strong> (₹10k auto-buy). For your real trades see{" "}
                <Link href="/stocks/portfolio" className="font-semibold underline">Portfolio</Link>.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {statusFilter === "closed" &&
                closedItems.map((item) =>
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
              {statusFilter === "open" &&
                filtered.map((s) => (
                  <UnifiedSignalCard
                    key={s.id}
                    signal={s}
                    currentPrice={prices[s.ticker] ?? undefined}
                    logged={loggedRefs.has(s.id)}
                    onLogged={fetchAll}
                    kiteConnected={kiteConnected}
                    holdingQty={kiteHoldings[s.ticker.toUpperCase()] ?? 0}
                    defaultTradeAmount={defaultTradeAmount}
                    onOrderPlaced={handleOrderPlaced}
                  />
                ))}
            </div>
            {statusFilter === "closed" && (
              <div className="text-center mt-6">
                <Link
                  href={
                    sourceFilter !== "all" && SWING_SOURCES.has(sourceFilter)
                      ? `/stocks/performance?strategy=${sourceFilter}`
                      : "/stocks/performance"
                  }
                  className="text-sm text-primary font-medium hover:underline"
                >
                  View full simulated history →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SimulatedClosedCard({ trade }: { trade: SimClosedTrade }) {
  const meta = SOURCE_META[trade.strategy as SignalSource];
  const pnl = trade.pnl ?? 0;
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-slate-200 flex">
      <div className={`w-[3px] shrink-0 ${meta?.stripe ?? "bg-slate-400"}`} />
      <div className="flex-1 p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <span className="text-lg font-bold text-slate-900">{trade.symbol}</span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Closed · {formatScanDateIST(String(trade.exit_date))}
            </p>
            <p className="text-[10px] text-slate-400">Simulated · ₹10k auto-buy</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StrategyBadge source={trade.strategy as SignalSource} />
            <PnlBadge value={pnl} unit="inr" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100 rounded-lg overflow-hidden text-center">
          <div className="bg-white px-2 py-2">
            <p className="text-[10px] text-slate-500 uppercase">Entry</p>
            <p className="text-sm font-semibold text-slate-900">₹{trade.entry_price}</p>
          </div>
          <div className="bg-white px-2 py-2">
            <p className="text-[10px] text-slate-500 uppercase">Exit</p>
            <p className="text-sm font-semibold text-slate-900">₹{trade.exit_price}</p>
            <p className="text-[10px] text-slate-500">{formatScanDateIST(String(trade.exit_date))}</p>
          </div>
        </div>
        {trade.exit_reason && (
          <p className="text-[10px] text-slate-500 mt-2 capitalize">{trade.exit_reason.replace(/_/g, " ")}</p>
        )}
      </div>
    </div>
  );
}

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
    <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5 text-[11px] font-semibold shrink-0">
      <button
        type="button"
        onClick={() => onChange("open")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
          status === "open"
            ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status === "open" ? "bg-emerald-500" : "bg-slate-300"}`} />
        Open
        <span className={`tabular-nums ${status === "open" ? "text-emerald-600" : "text-slate-400"}`}>{openCount}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("closed")}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
          status === "closed"
            ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status === "closed" ? "bg-violet-500" : "bg-slate-300"}`} />
        Closed
        <span className={`tabular-nums ${status === "closed" ? "text-violet-600" : "text-slate-400"}`}>{closedCount}</span>
      </button>
    </div>
  );
}

function StrategyTile({
  label,
  openCount,
  closedCount,
  active,
  onClick,
  meta,
}: {
  label: string;
  openCount: number;
  closedCount: number;
  active: boolean;
  onClick: () => void;
  meta?: (typeof SOURCE_META)[SignalSource];
}) {
  const inactive = meta
    ? `${meta.bg} ${meta.border} ${meta.color}`
    : "bg-slate-50 border-slate-200 text-slate-700";
  const activeClass = meta
    ? meta.activeBtn
    : "bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border p-2 text-left transition-all active:scale-[0.98] ${
        active ? activeClass : inactive
      }`}
    >
      {meta && (
        <span className={`absolute top-0 left-2 right-2 h-0.5 rounded-full ${meta.stripe} ${active ? "opacity-80" : "opacity-100"}`} />
      )}
      <p className={`text-[10px] font-semibold truncate leading-tight ${active && !meta ? "text-white" : ""}`}>
        {label}
      </p>
      <div className={`flex items-baseline gap-1.5 mt-0.5 ${active ? "text-white" : ""}`}>
        <span className={`text-sm font-bold tabular-nums ${!active ? "text-emerald-700" : ""}`}>{openCount}</span>
        <span className={`text-[9px] ${active ? "text-white/70" : "text-slate-400"}`}>/</span>
        <span className={`text-sm font-bold tabular-nums ${!active ? "text-violet-600" : ""}`}>{closedCount}</span>
      </div>
    </button>
  );
}

function Chip({
  label,
  active,
  onClick,
  meta,
  disabled,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  meta?: (typeof SOURCE_META)[SignalSource];
  disabled?: boolean;
  title?: string;
}) {
  const inactive = meta
    ? `${meta.bg} ${meta.border} ${meta.color} hover:opacity-90`
    : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200";
  const activeClass = meta
    ? meta.activeBtn
    : "bg-slate-800 text-white border-slate-800";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      type="button"
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
        disabled
          ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
          : active
            ? activeClass
            : inactive
      }`}
    >
      {meta && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.stripe}`} aria-hidden />
      )}
      {label}
    </button>
  );
}
