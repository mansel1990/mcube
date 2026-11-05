"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const LINKS = [
  { href: "/live-trade-mansel", label: "Home" },
  { href: "/live-trade-mansel/charts", label: "Charts" },
  { href: "/live-trade-mansel/reports", label: "Reports" },
  { href: "/live-trade-mansel/settings", label: "Settings" },
];

function current(pathname: string, href: string): boolean {
  if (href === "/live-trade-mansel") return pathname === href;
  return pathname.startsWith(href);
}

const themeListeners = new Set<() => void>();

function readTheme(): "dark" | "light" {
  return window.localStorage.getItem("mlive-theme") === "light" ? "light" : "dark";
}

function subscribeTheme(onChange: () => void): () => void {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

export function MliveFrame({ name, dryRun, children }: { name: string; dryRun: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark");
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/mlive/reports/alerts")
        .then(async (res) => {
          if (!res.ok) return;
          const rows = (await res.json()) as { seen: boolean }[];
          setUnseen(rows.filter((row) => !row.seen).length);
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("mlive-theme", next);
    themeListeners.forEach((listener) => listener());
  }

  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="mlive" data-theme={theme}>
      <header className="top">
        <div className="wrap">
          <Link href="/live-trade-mansel" className="logo">
            <i aria-hidden="true">↗</i>
            Mansel Live
          </Link>
          <nav className="nav" aria-label="Main">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="right">
            <Link className="icon-btn" href="/live-trade-mansel/reports" aria-label={unseen ? `Alerts, ${unseen} unseen` : "Alerts"}>
              <span aria-hidden="true">🔔</span>
              {unseen > 0 && <span className="count badge-count">{unseen}</span>}
            </Link>
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Toggle light or dark theme">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <div className="avatar" aria-label={name}>{initials}</div>
          </div>
        </div>
      </header>
      {dryRun && <p className="dry-banner">DRY RUN · no real orders</p>}
      <main className="wrap">{children}</main>
      <nav className="mnav" aria-label="Main mobile">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
