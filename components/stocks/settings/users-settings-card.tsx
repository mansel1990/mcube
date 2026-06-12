"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { isStocksAdmin, STOCKS_ADMIN_USERNAME } from "@/lib/stocks/admin";

interface StocksUser {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
}

interface UsersResponse {
  users: StocksUser[];
  canManageUsers: boolean;
}

const inputCls =
  "mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] [color-scheme:dark] text-sm placeholder:text-[var(--dota-dim)] focus:outline-none focus:border-[#6b4c16]";

export function UsersSettingsCard() {
  const [users, setUsers] = useState<StocksUser[]>([]);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/users");
      if (res.ok) {
        const data: UsersResponse = await res.json();
        setUsers(data.users);
        setCanManageUsers(data.canManageUsers);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/stocks/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }
      setUsername("");
      setName("");
      setPassword("");
      setShowAddForm(false);
      await fetchUsers();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, targetUsername: string) {
    if (!confirm(`Remove ${targetUsername}? They will lose access immediately.`)) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/stocks/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete user");
        return;
      }
      await fetchUsers();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl dota-panel p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]">
            <Users size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="cz text-[11px] font-bold">Party · Team Access</h3>
            <p className="text-xs text-[var(--dota-dim)] mt-0.5">
              {canManageUsers
                ? "You can add or remove stocks accounts."
                : `Only ${STOCKS_ADMIN_USERNAME} can add or remove users.`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin text-[var(--dota-dim)]" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-[var(--dota-dim)] py-4 text-center">No users found.</p>
        ) : (
          <ul className="divide-y divide-[#2a3344] rounded-xl border border-[#2a3344] overflow-hidden">
            {users.map((u) => {
              const admin = isStocksAdmin(u.username);
              const canDelete = canManageUsers && !admin;

              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-black/20 hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1c1610] border border-[#6b4c16] text-xs font-semibold text-[var(--dota-gold)] uppercase">
                      {u.username.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[var(--dota-head)] truncate">{u.username}</p>
                        {admin && (
                          <span className="badge-aegis inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                            <Shield size={10} />
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--dota-dim)] truncate">{u.name}</p>
                    </div>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id, u.username)}
                      disabled={deletingId === u.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#76302a] bg-transparent px-2.5 py-1.5 text-xs text-[var(--dota-dire-bright)] hover:bg-[rgba(212,69,49,0.1)] disabled:opacity-50 shrink-0 transition-colors"
                      title="Remove user"
                    >
                      {deletingId === u.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canManageUsers && (
        <div className="rounded-xl dota-panel p-6">
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="btn-pick inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"
            >
              <UserPlus size={15} />
              Add to party
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="cz text-[11px] font-bold">New party member</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setError(null);
                  }}
                  className="text-xs text-[var(--dota-dim)] hover:text-[var(--dota-head)]"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-username"
                    className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
                  >
                    Username
                  </label>
                  <input
                    id="new-username"
                    placeholder="e.g. brother"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-name"
                    className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
                  >
                    Display name
                  </label>
                  <input
                    id="new-name"
                    placeholder="e.g. Brother"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
                >
                  Temporary password
                </label>
                <input
                  id="new-password"
                  type="password"
                  placeholder="Min 6 characters — share securely"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputCls}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-[rgba(212,69,49,0.1)] px-3 py-2 text-xs text-[var(--dota-dire-bright)] border border-[#76302a]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="btn-pick inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                {creating ? "Creating…" : "Create account"}
              </button>
            </form>
          )}

          {!showAddForm && error && (
            <p className="mt-3 rounded-lg bg-[rgba(212,69,49,0.1)] px-3 py-2 text-xs text-[var(--dota-dire-bright)] border border-[#76302a]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
