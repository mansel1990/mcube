"use client";

import { useState } from "react";
import { AccountSettingsCard } from "@/components/stocks/settings/account-settings-card";
import { NotificationSettingsCard } from "@/components/stocks/settings/notification-settings-card";
import { TradeSettingsCard } from "@/components/stocks/settings/trade-settings-card";
import { UsersSettingsCard } from "@/components/stocks/settings/users-settings-card";
import {
  getSectionDescription,
  getSectionTitle,
  SettingsNav,
  type SettingsSection,
} from "@/components/stocks/settings/settings-nav";

export default function StocksSettingsPage() {
  const [section, setSection] = useState<SettingsSection>("account");

  return (
    <div className="min-h-screen text-[var(--dota-text)] px-4 py-6 sm:py-8 dota-bg-texture">
      <div className="max-w-4xl mx-auto anim-rise">
        <header className="mb-6">
          <h1 className="cz text-2xl font-bold">Options</h1>
          <p className="text-sm text-[var(--dota-dim)] mt-1">
            Manage your account and preferences.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
          <aside className="md:sticky md:top-20">
            <SettingsNav active={section} onChange={setSection} />
          </aside>

          <main className="min-w-0">
            <div className="mb-4 md:hidden">
              <h2 className="cz text-sm font-bold">{getSectionTitle(section)}</h2>
              <p className="text-xs text-[var(--dota-dim)] mt-0.5">{getSectionDescription(section)}</p>
            </div>

            <div className="hidden md:block mb-5">
              <h2 className="cz text-sm font-bold">{getSectionTitle(section)}</h2>
              <p className="text-sm text-[var(--dota-dim)] mt-1">{getSectionDescription(section)}</p>
            </div>

            <div className="space-y-4">
              {section === "account" && <AccountSettingsCard />}

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
