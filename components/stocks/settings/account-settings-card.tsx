"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const inputCls =
  "mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] [color-scheme:dark] text-sm focus:outline-none focus:border-[#6b4c16]";

export function AccountSettingsCard() {
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

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
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
    <div className="rounded-xl dota-panel p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]">
          <KeyRound size={18} />
        </div>
        <div>
          <h3 className="cz text-[11px] font-bold">Change Password</h3>
          <p className="text-xs text-[var(--dota-dim)] mt-0.5">Update your login credentials</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="current-password"
            className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
          >
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="new-password"
              className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-[rgba(212,69,49,0.1)] px-3 py-2 text-sm text-[var(--dota-dire-bright)] border border-[#76302a]">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg bg-[rgba(176,210,50,0.08)] px-3 py-2 text-sm text-[var(--dota-radiant-bright)] border border-[#3a4413]">
            Password changed successfully.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-pick inline-flex items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}
