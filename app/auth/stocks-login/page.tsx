"use client";

import { useState } from "react";
import { Cinzel } from "next/font/google";
import { Swords } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const inputCls =
  "px-4 py-3 rounded-lg bg-black/30 border border-[var(--dota-border)] text-[var(--dota-head)] [color-scheme:dark] placeholder:text-[var(--dota-dim)] focus:outline-none focus:border-[#6b4c16] transition-colors";

export default function StocksLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: authError } = await authClient.signIn.username({
        username,
        password,
      });

      if (authError) {
        setError(authError.message || "Invalid credentials");
        setLoading(false);
        return;
      }

      window.location.href = "/stocks";
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <div className={`theme-dota ${cinzel.variable}`}>
      <div className="min-h-screen bg-[#0e1219] dota-bg-texture flex items-center justify-center px-4">
        <div className="dota-panel p-8 rounded-2xl w-full max-w-sm shadow-2xl shadow-black/60 anim-rise">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#2b1c08] to-[#120c04] border border-[#6b4c16] text-[var(--dota-gold)] mb-4">
              <Swords size={22} />
            </div>
            <h1 className="cz text-xl font-black leading-tight">The Dire Terminal</h1>
            <p className="text-[10px] tracking-[0.3em] uppercase text-[var(--dota-dim)] mt-1.5">
              mcube · stocks
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputCls}
            />

            {error && (
              <p className="text-[var(--dota-dire-bright)] text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-pick cz py-3 px-6 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Entering…" : "Enter the Battle"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
