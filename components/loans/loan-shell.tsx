"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Building2, ScrollText, LogOut, LayoutDashboard, Menu, X, Map } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

const NAV = [
  { label: "Overview",  href: "/house-loan",            icon: Home,        exact: true },
  { label: "Creditors", href: "/house-loan/creditors",  icon: Building2,   exact: false },
  { label: "History",   href: "/house-loan/history",    icon: ScrollText,  exact: false },
  { label: "Strategy",  href: "/house-loan/strategy",   icon: Map,         exact: false },
];

interface LoanShellProps {
  username: string;
  children: React.ReactNode;
}

export function LoanShell({ username, children }: LoanShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/admin-login");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-56 flex-col bg-white border-r border-slate-200 z-40">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Home size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-none">Casa Loans</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Repayment Tracker</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-5 flex flex-col gap-0.5 border-t border-slate-100 pt-3">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LayoutDashboard size={16} strokeWidth={2} />
            Admin
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors w-full text-left"
          >
            <LogOut size={16} />
            Sign Out
          </button>
          <p className="text-[10px] text-slate-300 px-3 pt-2">{username}</p>
        </div>
      </aside>

      {/* ── Mobile header ───────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
            <Home size={12} className="text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800">Casa Loans</span>
        </div>
      </header>

      {/* ── Mobile drawer ───────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 bg-white h-full flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Home size={13} className="text-white" />
                </div>
                <span className="text-sm font-bold text-slate-800">Casa Loans</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-5 border-t border-slate-100 pt-3">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LayoutDashboard size={16} />
                Admin
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 w-full text-left mt-0.5"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 md:ml-56 pt-14 md:pt-0 min-w-0">
        {children}
      </main>
    </div>
  );
}
