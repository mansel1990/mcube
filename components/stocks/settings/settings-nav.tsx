"use client";

import { Bell, KeyRound, Link2, TrendingUp, Users } from "lucide-react";

export type SettingsSection = "account" | "broker" | "trading" | "notifications" | "users";

const SECTIONS: { id: SettingsSection; label: string; description: string; icon: typeof KeyRound }[] = [
  { id: "account", label: "Account", description: "Password & security", icon: KeyRound },
  { id: "broker", label: "Game Coordinator", description: "Kite Connect", icon: Link2 },
  { id: "trading", label: "Gold Per Pick", description: "Default trade size", icon: TrendingUp },
  { id: "notifications", label: "Announcer", description: "Push notifications", icon: Bell },
  { id: "users", label: "Party", description: "Who has access", icon: Users },
];

interface SettingsNavProps {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
}

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <>
      <nav className="hidden md:block">
        <ul className="space-y-1">
          {SECTIONS.map(({ id, label, description, icon: Icon }) => {
            const selected = active === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border border-[#574212] bg-[rgba(255,216,77,0.06)]"
                      : "border border-transparent hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      selected
                        ? "border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]"
                        : "border-[var(--dota-border)] bg-black/30 text-[var(--dota-dim)]"
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`cz block text-[11px] font-bold ${
                        selected ? "!text-[var(--dota-gold)]" : "!text-[var(--dota-text)]"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="block text-[11px] text-[var(--dota-dim)] truncate">{description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="md:hidden -mx-1 overflow-x-auto pb-1">
        <div className="flex gap-2 px-1 min-w-max">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const selected = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors border ${
                  selected
                    ? "border-[#574212] bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)]"
                    : "border-[var(--dota-border)] bg-black/30 text-[var(--dota-dim)]"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function getSectionTitle(section: SettingsSection): string {
  return SECTIONS.find((s) => s.id === section)?.label ?? "Options";
}

export function getSectionDescription(section: SettingsSection): string {
  const descriptions: Record<SettingsSection, string> = {
    account: "Manage your login and password.",
    broker: "Connect Zerodha Kite for portfolio sync and live prices.",
    trading: "Set defaults used when placing trades from signals.",
    notifications: "Control daily buy alerts and scanner notifications.",
    users: "See who can access the stocks section.",
  };
  return descriptions[section];
}
