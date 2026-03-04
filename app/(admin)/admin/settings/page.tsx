"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function AdminSettingsPage() {
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

    const { error: authError } = await authClient.changePassword({
      currentPassword,
      newPassword,
    });

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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="glass-panel p-8 rounded-2xl w-full max-w-sm border border-primary/20">
        <h1 className="text-2xl font-bold mb-1 text-foreground">Change Password</h1>
        <p className="text-foreground/50 text-sm mb-8">Update your admin password</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="px-4 py-3 rounded-lg bg-surface border border-primary/20 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="px-4 py-3 rounded-lg bg-surface border border-primary/20 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="px-4 py-3 rounded-lg bg-surface border border-primary/20 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {success && <p className="text-green-400 text-sm">Password changed successfully.</p>}

          <button
            type="submit"
            disabled={loading}
            className="py-3 px-6 rounded-full bg-primary text-white font-medium hover:bg-primary/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
