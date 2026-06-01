"use client";

import { Bell, KeyRound, Link2, TrendingUp, Users } from "lucide-react";

export type SettingsSection = "account" | "broker" | "trading" | "notifications" | "users";

const SECTIONS: { id: SettingsSection; label: string; description: string; icon: typeof KeyRound }[] = [
  { id: "account", label: "Account", description: "Password & security", icon: KeyRound },
  { id: "broker", label: "Broker", description: "Kite Connect", icon: Link2 },
  { id: "trading", label: "Trading", description: "Default trade size", icon: TrendingUp },
  { id: "notifications", label: "Alerts", description: "Push notifications", icon: Bell },
  { id: "users", label: "Team", description: "Who has access", icon: Users },
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
                      ? "bg-white border border-slate-200 shadow-sm"
                      : "hover:bg-white/70 border border-transparent"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      selected ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${selected ? "text-slate-900" : "text-slate-700"}`}>
                      {label}
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">{description}</span>
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
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600"
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
  return SECTIONS.find((s) => s.id === section)?.label ?? "Settings";
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
