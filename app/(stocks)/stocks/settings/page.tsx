"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { NotificationSettingsCard } from "@/components/stocks/settings/notification-settings-card";

export default function StocksSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    const { error: authError } = await authClient.changePassword({ currentPassword, newPassword });

    if (authError) {
      setError(authError.message || "Failed to change password");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Account</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Change Password</h3>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="px-4 py-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="px-4 py-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="px-4 py-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
              />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {success && <p className="text-green-600 text-sm">Password changed successfully.</p>}
              <button
                type="submit"
                disabled={loading}
                className="py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update Password"}
              </button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Notifications</h2>
          <NotificationSettingsCard />
        </section>
      </div>
    </div>
  );
}
