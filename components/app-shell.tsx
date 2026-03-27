"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, LogOut, Settings, TrendingUp, Zap, BarChart2, Bell } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useState, useEffect, useRef } from "react";

// Nav config lives here (client side) — icons are functions and can't
// be serialized across the server→client boundary.
const NAV_CONFIG = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
    { label: "Finances", href: "/admin/finances", icon: TrendingUp, exact: false },
    { label: "Clients", href: "/admin/clients", icon: Users, exact: false },
  ],
  stocks: [
    { label: "Signals", href: "/stocks", icon: Zap, exact: true },
    { label: "Chart", href: "/stocks/chart", icon: BarChart2, exact: false },
  ],
} as const;

const SETTINGS_HREF = {
  admin: "/admin/settings",
  stocks: "/stocks/settings",
} as const;

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
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface AppShellProps {
  section: "admin" | "stocks";
  username: string;
  children: React.ReactNode;
}

export function AppShell({ section, username, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = NAV_CONFIG[section];
  const settingsHref = SETTINGS_HREF[section];
  const [notifGranted, setNotifGranted] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationEntry[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifGranted(Notification.permission === "granted");
    }
  }, []);

  // Close popover on outside click
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
    if (notifs.length > 0) return; // already loaded
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
    router.push(section === "admin" ? "/auth/admin-login" : "/auth/stocks-login");
  }

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-4 gap-3 border-b border-white/5 bg-surface/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-bold text-foreground tracking-tight">MCube</span>
          <span className="text-foreground/20">·</span>
          <span className="text-sm font-medium text-primary">
            {section === "admin" ? "Admin" : "Stocks"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="hidden sm:block text-xs text-foreground/30 mr-1 truncate max-w-[100px]">
            {username}
          </span>

          {section === "stocks" && notifGranted && (
            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellOpen}
                title="Notification history"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Bell size={15} />
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-11 w-80 rounded-xl border border-white/10 bg-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                      Notification History
                    </span>
                    <Bell size={12} className="text-foreground/30" />
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    )}

                    {!notifsLoading && notifs.length === 0 && (
                      <div className="py-8 text-center text-xs text-foreground/30">
                        No notifications sent yet
                      </div>
                    )}

                    {!notifsLoading && notifs.map((n) => (
                      <div
                        key={n._id}
                        className="px-4 py-3 border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground leading-tight">
                            {n.title}
                          </span>
                          <span className="text-[10px] text-foreground/30 shrink-0">
                            {timeAgo(n.sentAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-foreground/50 leading-relaxed">
                          {n.body}
                        </p>
                        {n.tickers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {n.tickers.map((t) => (
                              <span
                                key={t}
                                className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-foreground/40"
                              >
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
            className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Settings size={17} />
          </Link>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 pt-14">
        {/* Left sidebar — desktop only */}
        <aside className="hidden md:flex fixed top-14 left-0 bottom-0 w-52 flex-col border-r border-white/5 bg-surface/30 backdrop-blur-xl z-40">
          <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    active
                      ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]"
                      : "text-foreground/50 hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-2 pb-4 border-t border-white/5 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-colors w-full"
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-white/5 bg-surface/80 backdrop-blur-xl flex items-stretch">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors ${
                active ? "text-primary" : "text-foreground/35 hover:text-foreground/60"
              }`}
            >
              <Icon
                size={21}
                strokeWidth={active ? 2.5 : 1.75}
                className={active ? "drop-shadow-[0_0_6px_rgba(37,99,235,0.7)]" : ""}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
