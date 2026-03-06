"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Wallet, LogOut, Settings, TrendingUp } from "lucide-react";
import { authClient } from "@/lib/auth-client";

// Nav config lives here (client side) — icons are functions and can't
// be serialized across the server→client boundary.
const NAV_CONFIG = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
    { label: "Finances", href: "/admin/finances", icon: TrendingUp, exact: false },
    { label: "Clients", href: "/admin/clients", icon: Users, exact: false },
  ],
  stocks: [
    { label: "Budget", href: "/stocks", icon: Wallet, exact: true },
  ],
} as const;

const SETTINGS_HREF = {
  admin: "/admin/settings",
  stocks: "/stocks/settings",
} as const;

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
          const active = isActive(item.href);
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
