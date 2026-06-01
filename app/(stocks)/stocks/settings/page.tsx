"use client";

import { Suspense, useState } from "react";
import { AccountSettingsCard } from "@/components/stocks/settings/account-settings-card";
import { NotificationSettingsCard } from "@/components/stocks/settings/notification-settings-card";
import { KiteSettingsCard } from "@/components/stocks/settings/kite-settings-card";
import { TradeSettingsCard } from "@/components/stocks/settings/trade-settings-card";
import { UsersSettingsCard } from "@/components/stocks/settings/users-settings-card";
import {
  getSectionDescription,
  getSectionTitle,
  SettingsNav,
  type SettingsSection,
} from "@/components/stocks/settings/settings-nav";

function SectionFallback() {
  return <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />;
}

export default function StocksSettingsPage() {
  const [section, setSection] = useState<SettingsSection>("account");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your account, broker connection, and preferences.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
          <aside className="md:sticky md:top-6">
            <SettingsNav active={section} onChange={setSection} />
          </aside>

          <main className="min-w-0">
            <div className="mb-4 md:hidden">
              <h2 className="text-lg font-semibold text-slate-900">{getSectionTitle(section)}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{getSectionDescription(section)}</p>
            </div>

            <div className="hidden md:block mb-5">
              <h2 className="text-lg font-semibold text-slate-900">{getSectionTitle(section)}</h2>
              <p className="text-sm text-slate-500 mt-1">{getSectionDescription(section)}</p>
            </div>

            <div className="space-y-4">
              {section === "account" && <AccountSettingsCard />}

              {section === "broker" && (
                <Suspense fallback={<SectionFallback />}>
                  <KiteSettingsCard />
                </Suspense>
              )}

              {section === "trading" && <TradeSettingsCard />}

              {section === "notifications" && <NotificationSettingsCard />}

              {section === "users" && <UsersSettingsCard />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
