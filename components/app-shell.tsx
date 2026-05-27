"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, LogOut, Settings, TrendingUp,
  Zap, Bell, Home, Building2, ScrollText,
  BarChart3, Briefcase,
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
    { label: "Signals",    href: "/stocks",             icon: Zap,       exact: true,  color: "blue"    },
    { label: "Simulated",  href: "/stocks/performance", icon: BarChart3, exact: false, color: "amber"   },
    { label: "Portfolio",  href: "/stocks/portfolio",   icon: Briefcase, exact: false, color: "emerald" },
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

const SECTION_HOME: Record<string, string> = {
  admin:  "/admin",
  stocks: "/stocks",
  loans:  "/house-loan",
};

const SECTION_BADGE: Record<string, string> = {
  admin:  "text-violet-700 bg-violet-50 border-violet-200",
  stocks: "text-blue-700 bg-blue-50 border-blue-200",
  loans:  "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const USER_AVATAR: Record<string, string> = {
  admin:  "bg-violet-100 text-violet-700 ring-violet-200",
  stocks: "bg-blue-100 text-blue-700 ring-blue-200",
  loans:  "bg-emerald-100 text-emerald-700 ring-emerald-200",
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
  amber:   { active: "bg-amber-50 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]",    dot: "bg-amber-500"   },
  slate:   { active: "bg-slate-100 text-slate-700 shadow-[inset_0_0_0_1px_rgba(100,116,139,0.2)]",  dot: "bg-slate-400"   },
};

interface NotificationEntry {
  _id: string;
  title: string;
  body: string;
  event: "open" | "close" | "morning" | "scan";
  tickers: string[];
  sent: number;
  sentAt: string;
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

  const [notifPermission, setNotifPermission] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [bellOpen,     setBellOpen]     = useState(false);
  const [notifs,       setNotifs]       = useState<NotificationEntry[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    function syncPermission() {
      setNotifPermission(Notification.permission as "granted" | "denied" | "default");
    }
    syncPermission();
    window.addEventListener("focus", syncPermission);
    return () => window.removeEventListener("focus", syncPermission);
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
    if (notifPermission !== "granted") {
      router.push("/stocks/settings");
      return;
    }
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
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">

      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 sm:px-4 gap-2 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
        <Link href={SECTION_HOME[section]} className="flex items-center gap-2 min-w-0 shrink-0">
          <Image
            src="/logo.png"
            alt="MCube"
            width={32}
            height={32}
            className="rounded-lg shrink-0 ring-1 ring-slate-200"
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-slate-900 tracking-tight text-sm sm:text-base">MCube</span>
            <span className="text-slate-300 hidden sm:inline">·</span>
            <span className={`sm:hidden text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${SECTION_BADGE[section]}`}>
              {SECTION_LABEL[section]}
            </span>
            <span className={`hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${SECTION_BADGE[section]}`}>
              {SECTION_LABEL[section]}
            </span>
          </div>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <div
            className={`flex items-center gap-1.5 mr-0.5 sm:mr-1 pl-0.5 pr-2 py-0.5 rounded-full ${USER_AVATAR[section]} ring-1`}
            title={username}
          >
            <span className="w-7 h-7 rounded-full bg-white/60 flex items-center justify-center text-[10px] font-bold shrink-0">
              {userInitials(username)}
            </span>
            <span className="text-xs font-semibold text-slate-800 max-w-[64px] sm:max-w-[100px] truncate hidden sm:inline">
              {username}
            </span>
          </div>

          {section === "stocks" && notifPermission !== "unsupported" && (
            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellOpen}
                title={
                  notifPermission === "granted"
                    ? "Notification history"
                    : notifPermission === "denied"
                      ? "Notifications blocked — open Settings"
                      : "Enable notifications in Settings"
                }
                className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  notifPermission === "granted"
                    ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    : notifPermission === "denied"
                      ? "text-amber-400 hover:text-amber-600 hover:bg-amber-50"
                      : "text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                }`}
              >
                <Bell size={15} />
                {notifPermission === "granted" && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                )}
              </button>

              {bellOpen && notifPermission === "granted" && (
                <div className="fixed inset-x-3 top-[3.75rem] sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-11 sm:w-80 rounded-xl border border-slate-200 bg-white shadow-card-hover overflow-hidden z-[60]">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Notification History
                    </span>
                    <Bell size={12} className="text-slate-400" />
                  </div>

                  <div className="max-h-[min(20rem,60vh)] sm:max-h-80 overflow-y-auto">
                    {notifsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                      </div>
                    )}
                    {!notifsLoading && notifs.length === 0 && (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No notifications sent yet
                      </div>
                    )}
                    {!notifsLoading && notifs.map((n) => (
                      <div key={n._id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-900 leading-tight">{n.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(n.sentAt)}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{n.body}</p>
                        {n.tickers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {n.tickers.map((t) => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
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
        {navItems.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.href, item.exact);
          const color  = "color" in item ? (item as { color: string }).color : "slate";
          const activeColor =
            color === "blue"    ? "text-blue-600"    :
            color === "amber"   ? "text-amber-600"   :
            color === "emerald" ? "text-emerald-600" :
            "text-slate-600";
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
        })}
      </nav>
    </div>
  );
}
