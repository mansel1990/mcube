"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Swords, Bot, Crown, Settings, LogOut, Bell } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useState, useEffect, useRef, useCallback } from "react";

const NAV = [
  { label: "War Room", href: "/stocks", icon: Swords, exact: true },
  { label: "Demo", href: "/stocks/performance", icon: Bot, exact: false },
  { label: "Ranked", href: "/stocks/portfolio", icon: Crown, exact: false },
] as const;

interface NotificationEntry {
  _id: string;
  title: string;
  body: string;
  event: "open" | "close" | "morning" | "scan" | "kite";
  tickers: string[];
  sent: number;
  sentAt: string;
  url: string;
  read: boolean;
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

export function DotaShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [notifPermission, setNotifPermission] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (notifPermission !== "granted") return;
    try {
      const res = await fetch("/api/stocks/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifs(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // ignore
    }
  }, [notifPermission]);

  useEffect(() => {
    if (notifPermission !== "granted") return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [notifPermission, fetchNotifications]);

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
    if (bellOpen) {
      setBellOpen(false);
      return;
    }
    setBellOpen(true);
    setNotifsLoading(true);
    try {
      await fetchNotifications();
    } finally {
      setNotifsLoading(false);
    }
  }

  async function handleNotifClick(n: NotificationEntry) {
    if (!n.read) {
      await fetch(`/api/stocks/notifications/${n._id}/read`, { method: "POST" });
      setNotifs((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setBellOpen(false);
    router.push(n.url || "/stocks");
  }

  async function handleMarkAllRead() {
    await fetch("/api/stocks/notifications/read-all", { method: "POST" });
    setNotifs((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  }

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/stocks-login");
  }

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dota-bg)] dota-bg-texture">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 sm:px-4 gap-2 border-b border-[#38415a] bg-[#11161f]/95 backdrop-blur-xl">
        <Link href="/stocks" className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#2b1c08] to-[#120c04] border border-[#6b4c16] text-[var(--dota-gold)] shrink-0">
            <Swords size={16} />
          </div>
          <div className="min-w-0 leading-tight">
            <span className="cz block text-[13px] font-bold truncate">The Dire Terminal</span>
            <span className="block text-[9px] tracking-[0.25em] uppercase text-[var(--dota-dim)]">
              mcube · stocks
            </span>
          </div>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <div
            className="flex items-center gap-1.5 mr-0.5 sm:mr-1 pl-0.5 pr-2 py-0.5 rounded-full border border-[#574212] bg-[rgba(255,216,77,0.06)]"
            title={username}
          >
            <span className="w-7 h-7 rounded-full bg-[#1c1610] border border-[#6b4c16] flex items-center justify-center text-[10px] font-bold text-[var(--dota-gold)] shrink-0">
              {userInitials(username)}
            </span>
            <span className="text-xs font-semibold text-[var(--dota-text)] max-w-[64px] sm:max-w-[100px] truncate hidden sm:inline">
              {username}
            </span>
          </div>

          {notifPermission !== "unsupported" && (
            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellOpen}
                title={
                  notifPermission === "granted"
                    ? "Announcer history"
                    : notifPermission === "denied"
                      ? "Announcer muted — open Options"
                      : "Enable the announcer in Options"
                }
                className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  notifPermission === "granted"
                    ? "text-[var(--dota-dim)] hover:text-[var(--dota-head)] hover:bg-white/5"
                    : "text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <Bell size={15} />
                {notifPermission === "granted" && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--dota-dire-bright)] text-[9px] font-bold text-white ring-2 ring-[#11161f]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && notifPermission === "granted" && (
                <div className="fixed inset-x-3 top-[3.75rem] sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-11 sm:w-80 rounded-xl border border-[var(--dota-border)] bg-[var(--dota-panel)] shadow-2xl shadow-black/60 overflow-hidden z-[60]">
                  <div className="px-4 py-3 border-b border-[var(--dota-border)] flex items-center justify-between bg-black/20">
                    <span className="cz text-[10px] font-semibold">Announcer</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-semibold text-[var(--dota-gold)] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[min(20rem,60vh)] sm:max-h-80 overflow-y-auto">
                    {notifsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-[#574212] border-t-[var(--dota-gold)] rounded-full animate-spin" />
                      </div>
                    )}
                    {!notifsLoading && notifs.length === 0 && (
                      <div className="py-8 text-center text-xs text-[var(--dota-dim)]">
                        The announcer has nothing to report
                      </div>
                    )}
                    {!notifsLoading &&
                      notifs.map((n) => (
                        <button
                          key={n._id}
                          type="button"
                          onClick={() => handleNotifClick(n)}
                          className={`w-full text-left px-4 py-3 border-b border-[#2a3344] last:border-0 hover:bg-white/5 transition-colors ${
                            !n.read ? "border-l-2 border-l-[var(--dota-gold)] bg-[rgba(255,216,77,0.04)]" : "opacity-70"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span
                              className={`text-xs leading-tight ${
                                n.read ? "font-medium text-[var(--dota-text)]" : "font-semibold text-[var(--dota-head)]"
                              }`}
                            >
                              {n.title}
                            </span>
                            <span className="text-[10px] text-[var(--dota-dim)] shrink-0">{timeAgo(n.sentAt)}</span>
                          </div>
                          <p className="text-[11px] text-[var(--dota-dim)] leading-relaxed">{n.body}</p>
                          {n.tickers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {[...new Set(n.tickers)].map((t) => (
                                <span
                                  key={t}
                                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/30 border border-[var(--dota-border)] text-[var(--dota-text)]"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Link
            href="/stocks/settings"
            title="Options"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--dota-dim)] hover:text-[var(--dota-head)] hover:bg-white/5 transition-colors"
          >
            <Settings size={17} />
          </Link>
          <button
            onClick={handleLogout}
            title="Leave game"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--dota-dim)] hover:text-[var(--dota-dire-bright)] hover:bg-[rgba(212,69,49,0.1)] transition-colors"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 pt-14">
        {/* Left sidebar — desktop only */}
        <aside className="hidden md:flex fixed top-14 left-0 bottom-0 w-52 flex-col border-r border-[#38415a] bg-[#11161f] z-40">
          <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`cz flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                    active
                      ? "text-[var(--dota-gold)] border border-[#574212] bg-gradient-to-b from-[rgba(255,216,77,0.1)] to-transparent"
                      : "text-[var(--dota-dim)] border border-transparent hover:text-[var(--dota-head)] hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-2 pb-4 border-t border-[#2a3344] pt-3">
            <button
              onClick={handleLogout}
              className="cz flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-bold text-[var(--dota-dim)] hover:text-[var(--dota-dire-bright)] hover:bg-[rgba(212,69,49,0.08)] transition-colors w-full"
            >
              <LogOut size={16} />
              Leave Game
            </button>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 md:ml-52 pb-20 md:pb-0 min-w-0">{children}</main>
      </div>

      {/* ── Bottom HUD bar — mobile only ───────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-[#38415a] bg-[#0a0d12]/95 backdrop-blur-xl flex items-stretch">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cz flex-1 flex flex-col items-center justify-center gap-1 text-[9px] font-bold transition-colors ${
                active ? "!text-[var(--dota-gold)]" : "!text-[var(--dota-dim)]"
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
