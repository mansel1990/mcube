"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, LogOut, Settings, TrendingUp,
  Zap, BarChart2, Bell, Home, Building2, ScrollText,
  TrendingUp as BreakoutIcon, Activity, BarChart3,
  Layers, Shield, RotateCcw, LayoutGrid, X, TrendingDown,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useState, useEffect, useRef } from "react";

const NAV_CONFIG = {
  admin: [
    { label: "Dashboard", href: "/admin",           icon: LayoutDashboard, exact: true },
    { label: "Finances",  href: "/admin/finances",  icon: TrendingUp,      exact: false },
    { label: "Clients",   href: "/admin/clients",   icon: Users,           exact: false },
  ],
  stocks: [
    { label: "Manish Logic",   href: "/stocks",                   icon: Zap,          exact: true,  color: "blue"    },
    { label: "Breakout",       href: "/stocks/breakout",          icon: BreakoutIcon, exact: false, color: "violet"  },
    { label: "EMA Pullback",   href: "/stocks/ema-pullback",      icon: Activity,     exact: false, color: "emerald" },
    { label: "VCP",            href: "/stocks/vcp",               icon: Layers,       exact: false, color: "purple"  },
    { label: "RS Resilience",  href: "/stocks/rs-resilience",     icon: Shield,       exact: false, color: "rose"    },
    { label: "Mean Reversion", href: "/stocks/mean-reversion",    icon: RotateCcw,    exact: false, color: "teal"    },
    { label: "Fib Pullback",   href: "/stocks/fib-pullback",      icon: TrendingDown, exact: false, color: "cyan"    },
    { label: "Performance",    href: "/stocks/performance",       icon: BarChart3,    exact: false, color: "amber"   },
    { label: "Chart",          href: "/stocks/chart",             icon: BarChart2,    exact: false, color: "slate"   },
  ],
  loans: [
    { label: "Overview",  href: "/house-loan",             icon: Home,       exact: true  },
    { label: "Creditors", href: "/house-loan/creditors",   icon: Building2,  exact: false },
    { label: "History",   href: "/house-loan/history",     icon: ScrollText, exact: false },
  ],
} as const;

const SECTION_LABEL: Record<string, string> = {
  admin:  "Admin",
  stocks: "Stocks",
  loans:  "Casa Loans",
};

const SETTINGS_HREF = {
  admin:  "/admin/settings",
  stocks: "/stocks/settings",
  loans:  "/admin/settings",
} as const;

// Per-tab accent colours for the stocks section
const TAB_COLORS: Record<string, { active: string; dot: string }> = {
  blue:    { active: "bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]",       dot: "bg-blue-500"    },
  violet:  { active: "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.2)]",  dot: "bg-violet-500"  },
  emerald: { active: "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]", dot: "bg-emerald-500" },
  purple:  { active: "bg-purple-50 text-purple-700 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]",  dot: "bg-purple-500"  },
  rose:    { active: "bg-rose-50 text-rose-700 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.2)]",       dot: "bg-rose-500"    },
  teal:    { active: "bg-teal-50 text-teal-700 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.2)]",      dot: "bg-teal-500"    },
  cyan:    { active: "bg-cyan-50 text-cyan-700 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.2)]",       dot: "bg-cyan-500"    },
  amber:   { active: "bg-amber-50 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]",    dot: "bg-amber-500"   },
  slate:   { active: "bg-slate-100 text-slate-700 shadow-[inset_0_0_0_1px_rgba(100,116,139,0.2)]",  dot: "bg-slate-400"   },
};

// Hrefs of strategy items that get grouped into the mobile "Strategies" sheet.
const STRATEGY_HREFS = new Set([
  "/stocks/breakout",
  "/stocks/ema-pullback",
  "/stocks/vcp",
  "/stocks/rs-resilience",
  "/stocks/mean-reversion",
  "/stocks/fib-pullback",
]);

interface NotificationEntry {
  _id: string;
  title: string;
  body: string;
  event: "open" | "close";
  tickers: string[];
  sent: number;
  sentAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface AppShellProps {
  section: "admin" | "stocks" | "loans";
  username: string;
  children: React.ReactNode;
}

export function AppShell({ section, username, children }: AppShellProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const navItems  = NAV_CONFIG[section];
  const settingsHref = SETTINGS_HREF[section];

  const [notifGranted, setNotifGranted] = useState(false);
  const [bellOpen,     setBellOpen]     = useState(false);
  const [notifs,       setNotifs]       = useState<NotificationEntry[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [strategiesOpen, setStrategiesOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Auto-close strategies sheet on route change
  useEffect(() => { setStrategiesOpen(false); }, [pathname]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifGranted(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [bellOpen]);

  async function handleBellOpen() {
    if (bellOpen) { setBellOpen(false); return; }
    setBellOpen(true);
    if (notifs.length > 0) return;
    setNotifsLoading(true);
    try {
      const res = await fetch("/api/stocks/notifications");
      if (res.ok) setNotifs(await res.json());
    } finally {
      setNotifsLoading(false);
    }
  }

  async function handleLogout() {
    await authClient.signOut();
    router.push(section === "stocks" ? "/auth/stocks-login" : "/auth/admin-login");
  }

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function getNavItemClasses(item: typeof navItems[number], active: boolean) {
    const color = "color" in item ? (item as { color: string }).color : "slate";
    const scheme = TAB_COLORS[color] ?? TAB_COLORS.slate;
    if (active) {
      return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${scheme.active}`;
    }
    return "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-slate-500 hover:text-slate-800 hover:bg-slate-100";
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-4 gap-3 border-b border-border bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-bold text-foreground tracking-tight">MCube</span>
          <span className="text-slate-300">·</span>
          <span className="text-sm font-semibold bg-hero-gradient bg-clip-text text-transparent">
            {SECTION_LABEL[section] ?? section}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="hidden sm:block text-xs text-muted mr-1 truncate max-w-[100px]">
            {username}
          </span>

          {section === "stocks" && notifGranted && (
            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellOpen}
                title="Notification history"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Bell size={15} />
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-11 w-80 rounded-xl border border-border bg-white shadow-card-hover overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                      Notification History
                    </span>
                    <Bell size={12} className="text-slate-400" />
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    )}
                    {!notifsLoading && notifs.length === 0 && (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No notifications sent yet
                      </div>
                    )}
                    {!notifsLoading && notifs.map((n) => (
                      <div key={n._id} className="px-4 py-3 border-b border-border last:border-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground leading-tight">{n.title}</span>
                          <span className="text-[10px] text-muted shrink-0">{timeAgo(n.sentAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed">{n.body}</p>
                        {n.tickers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {n.tickers.map((t) => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-border text-muted">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Link
            href={settingsHref}
            title="Settings"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Settings size={17} />
          </Link>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 pt-14">

        {/* Left sidebar — desktop only */}
        <aside className="hidden md:flex fixed top-14 left-0 bottom-0 w-52 flex-col border-r border-border bg-white z-40 shadow-sm">
          <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon   = item.icon;
              const active = isActive(item.href, item.exact);
              const color  = "color" in item ? (item as { color: string }).color : "slate";
              const dot    = TAB_COLORS[color]?.dot ?? "bg-slate-400";
              return (
                <Link key={item.href} href={item.href} className={getNavItemClasses(item, active)}>
                  {active && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
                  <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-2 pb-4 border-t border-border pt-3 flex flex-col gap-0.5">
            {section === "admin" && (
              <Link
                href="/house-loan"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors"
              >
                <Home size={17} />
                Casa Loans
              </Link>
            )}
            {section === "loans" && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <LayoutDashboard size={17} />
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors w-full"
            >
              <LogOut size={17} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 md:ml-52 pb-20 md:pb-0 min-w-0">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar — mobile only ───────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-white/90 backdrop-blur-xl flex items-stretch">
        {section === "stocks" ? (
          <MobileStocksNav
            navItems={navItems as ReadonlyArray<{ label: string; href: string; icon: typeof Zap; exact: boolean; color?: string }>}
            isActive={isActive}
            onOpenStrategies={() => setStrategiesOpen(true)}
            strategiesActive={STRATEGY_HREFS.has(pathname) || Array.from(STRATEGY_HREFS).some((h) => pathname.startsWith(h + "/"))}
          />
        ) : (
          navItems.map((item) => {
            const Icon   = item.icon;
            const active = isActive(item.href, item.exact);
            const color  = "color" in item ? (item as { color: string }).color : "slate";
            const activeColor =
              color === "blue"    ? "text-blue-600"    :
              color === "violet"  ? "text-violet-600"  :
              color === "emerald" ? "text-emerald-600" :
              color === "amber"   ? "text-amber-600"   : "text-slate-600";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 text-[9px] font-medium tracking-wide uppercase transition-colors ${
                  active ? activeColor : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                {item.label}
              </Link>
            );
          })
        )}
      </nav>

      {/* ── Strategies bottom-sheet — mobile only, stocks section ── */}
      {section === "stocks" && strategiesOpen && (
        <StrategiesSheet
          items={(NAV_CONFIG.stocks as ReadonlyArray<{ label: string; href: string; icon: typeof Zap; color?: string }>).filter((i) => STRATEGY_HREFS.has(i.href))}
          activeHref={pathname}
          onClose={() => setStrategiesOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Mobile bottom-nav for stocks section: 4 items including grouped "Strategies" ─
function MobileStocksNav({
  navItems,
  isActive,
  onOpenStrategies,
  strategiesActive,
}: {
  navItems: ReadonlyArray<{ label: string; href: string; icon: typeof Zap; exact: boolean; color?: string }>;
  isActive: (href: string, exact?: boolean) => boolean;
  onOpenStrategies: () => void;
  strategiesActive: boolean;
}) {
  // Pick out the 3 standalone tabs
  const home  = navItems.find((i) => i.href === "/stocks");
  const perf  = navItems.find((i) => i.href === "/stocks/performance");
  const chart = navItems.find((i) => i.href === "/stocks/chart");

  function tabClass(active: boolean, color?: string) {
    const activeColor =
      color === "blue"    ? "text-blue-600"    :
      color === "amber"   ? "text-amber-600"   :
      color === "indigo"  ? "text-indigo-600"  :
      "text-slate-600";
    return `flex-1 flex flex-col items-center justify-center gap-1 text-[9px] font-medium tracking-wide uppercase transition-colors ${
      active ? activeColor : "text-slate-400 hover:text-slate-600"
    }`;
  }

  return (
    <>
      {home && (
        <Link href={home.href} className={tabClass(isActive(home.href, home.exact), home.color)}>
          <home.icon size={20} strokeWidth={isActive(home.href, home.exact) ? 2.5 : 1.75} />
          {home.label}
        </Link>
      )}
      <button
        onClick={onOpenStrategies}
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-[9px] font-medium tracking-wide uppercase transition-colors ${
          strategiesActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <LayoutGrid size={20} strokeWidth={strategiesActive ? 2.5 : 1.75} />
        Strategies
      </button>
      {perf && (
        <Link href={perf.href} className={tabClass(isActive(perf.href, perf.exact), perf.color)}>
          <perf.icon size={20} strokeWidth={isActive(perf.href, perf.exact) ? 2.5 : 1.75} />
          {perf.label}
        </Link>
      )}
      {chart && (
        <Link href={chart.href} className={tabClass(isActive(chart.href, chart.exact), chart.color)}>
          <chart.icon size={20} strokeWidth={isActive(chart.href, chart.exact) ? 2.5 : 1.75} />
          {chart.label}
        </Link>
      )}
    </>
  );
}

// ─── Bottom-sheet listing all 5 strategies ────────────────────────────────────
function StrategiesSheet({
  items,
  activeHref,
  onClose,
}: {
  items: ReadonlyArray<{ label: string; href: string; icon: typeof Zap; color?: string }>;
  activeHref: string;
  onClose: () => void;
}) {
  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="text-base font-bold text-foreground">Strategies</h2>
            <p className="text-xs text-muted">Pick a scanner to view today's signals</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-3 pb-4 pt-1 grid grid-cols-1 gap-1.5">
          {items.map((item) => {
            const Icon   = item.icon;
            const active = activeHref === item.href || activeHref.startsWith(item.href + "/");
            const color  = item.color ?? "slate";
            const scheme = TAB_COLORS[color] ?? TAB_COLORS.slate;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  active ? scheme.active : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? "bg-white/60" : "bg-slate-100"}`}>
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                {item.label}
                {active && <span className={`ml-auto w-1.5 h-1.5 rounded-full ${scheme.dot}`} />}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
