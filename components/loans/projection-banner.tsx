"use client";

import { useState } from "react";
import { TrendingDown, Edit2, Check, X } from "lucide-react";
import { formatINRCompact } from "./format";

interface ProjectionBannerProps {
  totalRemaining: number;
  monthlyBudget: number;
  projectionMonths: number;
  clearByDate: string;
  onBudgetChange: (newBudget: number) => void;
}

export function ProjectionBanner({
  totalRemaining,
  monthlyBudget,
  projectionMonths,
  clearByDate,
  onBudgetChange,
}: ProjectionBannerProps) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(monthlyBudget));
  const [saving, setSaving] = useState(false);

  const [sliderValue, setSliderValue] = useState(monthlyBudget);
  const whatIfMonths =
    totalRemaining > 0 && sliderValue > 0
      ? Math.ceil(totalRemaining / sliderValue)
      : 0;

  function whatIfDate(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }

  async function saveBudget() {
    const val = parseInt(budgetInput.replace(/,/g, ""), 10);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/house-loan/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudget: val }),
      });
      onBudgetChange(val);
      setSliderValue(val);
      setEditingBudget(false);
    } finally {
      setSaving(false);
    }
  }

  const clearLabel = new Date(clearByDate).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Projection card */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
              Payoff Projection
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black leading-none">{projectionMonths}</span>
              <span className="text-blue-200 text-lg font-medium">months</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
            <TrendingDown size={22} className="text-white" />
          </div>
        </div>

        <p className="text-white font-semibold text-sm mb-1">
          Clear by <span className="text-blue-100">{clearLabel}</span>
        </p>
        <p className="text-blue-200 text-xs">{formatINRCompact(totalRemaining)} remaining</p>

        {/* Budget */}
        <div className="mt-4 pt-4 border-t border-blue-500/50 flex items-center gap-2">
          <p className="text-blue-200 text-xs">Monthly budget:</p>
          {editingBudget ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveBudget()}
                className="w-28 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs focus:outline-none focus:border-white/40 placeholder:text-blue-300"
                autoFocus
              />
              <button onClick={saveBudget} disabled={saving} className="text-blue-200 hover:text-white">
                <Check size={14} />
              </button>
              <button onClick={() => setEditingBudget(false)} className="text-blue-300 hover:text-white">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setBudgetInput(String(monthlyBudget)); setEditingBudget(true); }}
              className="flex items-center gap-1 text-white font-bold text-sm hover:text-blue-100 group"
            >
              {formatINRCompact(monthlyBudget)}/mo
              <Edit2 size={11} className="text-blue-300 group-hover:text-blue-100" />
            </button>
          )}
        </div>
        <p className="text-blue-300 text-[10px] mt-1">Bank EMI of ₹61,550 included</p>
      </div>

      {/* What-if card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          What-if Calculator
        </p>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-black text-slate-800">{whatIfMonths}</span>
          <span className="text-slate-400 font-medium">months</span>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          at <span className="font-bold text-slate-700">{formatINRCompact(sliderValue)}/month</span>
          {whatIfMonths > 0 && (
            <span className="text-slate-400"> → {whatIfDate(whatIfMonths)}</span>
          )}
        </p>

        <input
          type="range"
          min={100000}
          max={600000}
          step={10000}
          value={sliderValue}
          onChange={(e) => setSliderValue(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600 bg-slate-100"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
          <span>₹1L</span>
          <span>₹3.5L</span>
          <span>₹6L</span>
        </div>
      </div>
    </div>
  );
}
