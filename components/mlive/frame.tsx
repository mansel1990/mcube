"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const GROUPS = [
  {
    label: "Trade",
    items: [
      { href: "/live-trade-mansel", label: "Today", icon: "today" },
      { href: "/live-trade-mansel/swing", label: "Swing", icon: "swing" },
      { href: "/live-trade-mansel/intraday", label: "Intraday", icon: "intraday" },
    ],
  },
  {
    label: "Results",
    items: [
      { href: "/live-trade-mansel/reports", label: "Reports", icon: "reports" },
      { href: "/live-trade-mansel/charts", label: "Charts", icon: "charts" },
    ],
  },
  {
    label: "Invest",
    items: [
      { href: "/live-trade-mansel/long-term", label: "Long Game", icon: "longterm" },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/live-trade-mansel/research", label: "Research", icon: "research" },
      { href: "/live-trade-mansel/audit", label: "Audit", icon: "audit" },
    ],
  },
];

const PHONE = [
  { href: "/live-trade-mansel", label: "Today", icon: "today" },
  { href: "/live-trade-mansel/swing", label: "Swing", icon: "swing" },
  { href: "/live-trade-mansel/intraday", label: "Intraday", icon: "intraday" },
  { href: "/live-trade-mansel/reports", label: "Reports", icon: "reports" },
];

function NavIcon({ name }: { name: string }) {
  const props = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "today") return <svg {...props}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
  if (name === "swing") return <svg {...props}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
  if (name === "intraday") return <svg {...props}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
  if (name === "reports") return <svg {...props}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></svg>;
  if (name === "charts") return <svg {...props}><path d="M4 16l5-5 3 3 7-8" /><path d="M14 6h6v6" /></svg>;
  if (name === "longterm") return <svg {...props}><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M3 19h18" /><path d="M16 5l2-2 2 2" /></svg>;
  if (name === "research") return <svg {...props}><path d="M9 3h6" /><path d="M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" /><path d="M8 15h8" /></svg>;
  if (name === "audit") return <svg {...props}><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6" /></svg>;
  return <svg {...props}><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
}

function current(pathname: string, href: string): boolean {
  if (href === "/live-trade-mansel") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MliveFrame({
  name,
  dryRun,
  kiteConnected,
  kiteAt,
  status,
  mode,
  marketOpen,
  children,
}: {
  name: string;
  dryRun: boolean;
  kiteConnected: boolean;
  kiteAt: string | null;
  status: string;
  mode: string;
  marketOpen: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [engineStatus, setEngineStatus] = useState(status);
  const [engineMode, setEngineMode] = useState(mode);
  const [busy, setBusy] = useState(false);
  const paused = engineStatus.startsWith("paused") || engineMode === "paused";
  const label = paused ? "Paused" : engineMode === "approve" ? "Approval" : "Running on Auto";

  async function toggleEngine() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/mlive/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(paused ? { resume: true } : { pause: true }),
    });
    setBusy(false);
    if (!res.ok) return;
    const body = (await res.json()) as { status?: string; mode?: string };
    if (body.status) setEngineStatus(body.status);
    if (body.mode) setEngineMode(body.mode);
  }

  return (
    <div className="mlive" data-theme="light">
      <div className="shell">
        <aside className="rail" aria-label="Main">
          <Link href="/live-trade-mansel" className="brand" aria-label={`Mansel Live, ${name}`}>
            <span className="mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M9 7h8v8" /></svg>
            </span>
            <span className="brand-name">Mansel Live</span>
          </Link>
          <nav className="rail-nav">
            {GROUPS.map((group) => (
              <div key={group.label} className="rail-group">
                <p className="group-label">{group.label}</p>
                {group.items.map((link) => (
                  <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined} title={link.label}>
                    <NavIcon name={link.icon} />
                    <span className="nav-label">{link.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="rail-foot">
            <div className="status-card">
              <p className={`status-line ${paused || engineMode === "approve" ? "warn" : ""}`}>
                <span className={paused ? "dot" : "dot live"} />
                <span className="status-copy">{label}</span>
              </p>
              <p className={`kite-line ${kiteConnected ? "" : "warn"}`}>
                <span className="status-copy">{kiteConnected ? `Kite connected ${kiteAt ?? ""}`.trim() : "Kite not connected"}</span>
              </p>
              <button type="button" className="rail-btn" disabled={busy} onClick={() => void toggleEngine()}>
                <span className="status-copy">{paused ? "Resume engine" : "Pause engine"}</span>
                <span className="rail-btn-icon" aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
              </button>
            </div>
            <Link href="/live-trade-mansel/settings" className="settings-link" aria-current={current(pathname, "/live-trade-mansel/settings") ? "page" : undefined} title="Settings">
              <NavIcon name="settings" />
              <span className="nav-label">Settings</span>
            </Link>
          </div>
        </aside>
        <div className="shell-main">
          {dryRun && <p className="dry-banner">DRY RUN · no real orders</p>}
          {!kiteConnected && <p className="dry-banner warn">Kite is not connected. Connect it in Settings before the engine can trade.</p>}
          {paused && <p className="dry-banner">The engine is paused. New orders wait until you resume it.</p>}
          {!marketOpen && <p className="dry-banner">The market is closed. Figures stay as of the last session.</p>}
          <main className="wrap">{children}</main>
        </div>
      </div>
      <nav className="mnav" aria-label="Main mobile">
        {PHONE.map((link) => (
          <Link key={link.href} href={link.href} aria-current={current(pathname, link.href) ? "page" : undefined}>
            <NavIcon name={link.icon} />
            {link.label}
          </Link>
        ))}
        <button type="button" aria-expanded={more} onClick={() => setMore((open) => !open)}>
          <NavIcon name="settings" />
          More
        </button>
      </nav>
      {more && (
        <div className="more-pop">
          <Link href="/live-trade-mansel/long-term" onClick={() => setMore(false)}><NavIcon name="longterm" />Long Game</Link>
          <Link href="/live-trade-mansel/audit" onClick={() => setMore(false)}>Audit</Link>
          <Link href="/live-trade-mansel/research" onClick={() => setMore(false)}>Research</Link>
          <Link href="/live-trade-mansel/settings" onClick={() => setMore(false)}>Settings</Link>
        </div>
      )}
    </div>
  );
}
