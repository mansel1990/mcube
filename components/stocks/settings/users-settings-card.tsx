"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";

interface StocksUser {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
}

export function UsersSettingsCard() {
  const [users, setUsers] = useState<StocksUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
      await fetchUsers();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    setError(null);
    const res = await fetch(`/api/stocks/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete user");
      return;
    }
    await fetchUsers();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Manage Users</h3>
        <p className="text-xs text-slate-500 mt-0.5">Stocks section accounts</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{u.username}</p>
                <p className="text-[11px] text-slate-500 truncate">{u.name}</p>
              </div>
              <button
                onClick={() => handleDelete(u.id)}
                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                title="Remove user"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="space-y-2 pt-2 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-600 flex items-center gap-1">
          <UserPlus size={13} /> Add user
        </p>
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
        />
        <input
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
        />
        <input
          type="password"
          placeholder="Temporary password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="w-full py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
