"use client";

import { useEffect, useState } from "react";
import { formatINR, formatINRCompact, formatMonthYear } from "./format";
import { PiggyBank, CheckCircle, Trophy, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Creditor {
  _id: string;
  name: string;
  remaining: number;
}

interface PhasePayment {
  key: string;
  label: string;
  amount: number;     // per month
  color: string;
  badge?: "closed" | "savings" | "final" | "last-emi";
}

interface PhaseTotalRow {
  key: string;
  label: string;
  color: string;
  total: number;
}

interface Phase {
  id: number;
  title: string;
  subtitle: string;
  start: string;  // "2026-05"
  end: string;
  months: number;
  budget: number;
  payments: PhasePayment[];
  monthlyTotal: number;
  phaseTotal: number;
  phaseTotals: PhaseTotalRow[];   // per-creditor totals for the whole phase
  momAfter: number;
  milestones: string[];
  isFinal?: boolean;
}

// ── Colors ─────────────────────────────────────────────────────────────────────

const C = {
  bank:    "#f59e0b",
  mom:     "#3b82f6",
  anantha: "#ef4444",
  cc:      "#10b981",
  nive:    "#8b5cf6",
};

// ── Computation ────────────────────────────────────────────────────────────────

function computePhases(creditors: Creditor[]): Phase[] {
  const EMI      = 108_470;
  const LAST_EMI = 110_000;
  const MOM_BAL  = creditors.find(c => c.name === "Mom")?.remaining     ?? 7_000_000;
  const ANT_BAL  = creditors.find(c => c.name === "Anantha")?.remaining ?? 1_000_000;
  const ANT_MO   = Math.round(ANT_BAL / 10);  // ₹1,00,000

  // ── Phase 2: Breathing space — EMI + Mom ₹1L + Anantha savings ──────────────
  const P2_MOM   = 100_000;                   // ₹1,00,000/mo to Mom

  // ── Phase 3: Full budget — EMI + Mom (remainder) + Anantha savings ───────────
  const p3MomMo  = 350_000 - EMI - ANT_MO;  // ₹1,41,530/mo

  // ── Mom running total ─────────────────────────────────────────────────────────
  const momAfterP1 = MOM_BAL;                            // Mom untouched in Phase 1
  const momAfterP2 = MOM_BAL - P2_MOM * 2;              // ₹68,00,000
  const momAfterP3 = momAfterP2 - p3MomMo * 8;          // ₹56,67,760

  // ── Phase 4: Heads Down — EMI + Mom until Mom closes ─────────────────────────
  const p4MomMo     = 350_000 - EMI;                     // ₹2,41,530/mo
  const p4FullMonths = Math.floor(momAfterP3 / p4MomMo); // 23 full months
  const momFinalP4   = momAfterP3 - p4FullMonths * p4MomMo; // ₹1,12,570 — closing balance

  // Phase 4: Apr 2027 – Mar 2029 (24 months total)
  //   Months 1–23: ₹3,50,000/mo    Month 24 (Mar 2029): EMI + momFinalP4 — Mom closes
  const t4 = 350_000 * p4FullMonths + (EMI + momFinalP4);

  // ── Phase totals ──────────────────────────────────────────────────────────────
  const t1 = EMI + 100_000 + 100_000;           // ₹3,08,470
  const t2 = (EMI + P2_MOM + ANT_MO) * 2;      // ₹6,16,940
  const t3 = 350_000 * 8;                       // ₹28,00,000
  const t5 = LAST_EMI;                          // ₹1,10,000 (Mom already done in P4)

  return [
    {
      id: 1, title: "Clear & Begin", subtitle: "Kick off EMI, clear CC and Nive",
      start: "2026-05", end: "2026-05", months: 1, budget: 300_000,
      payments: [
        { key: "emi",  label: "Bank EMI",    amount: EMI,     color: C.bank },
        { key: "cc",   label: "Credit Card", amount: 100_000, color: C.cc,   badge: "closed" },
        { key: "nive", label: "Nive",        amount: 100_000, color: C.nive, badge: "closed" },
      ],
      monthlyTotal: t1, phaseTotal: t1, momAfter: momAfterP1,
      phaseTotals: [], // single month — payment rows already show amounts
      milestones: ["Credit Card cleared", "Nive cleared"],
    },
    {
      id: 2, title: "Breathing Space", subtitle: "Light months — EMI, Mom ₹1L & Anantha fund",
      start: "2026-06", end: "2026-07", months: 2, budget: 300_000,
      payments: [
        { key: "emi",     label: "Bank EMI", amount: EMI,    color: C.bank },
        { key: "mom",     label: "Mom",      amount: P2_MOM, color: C.mom },
        { key: "anantha", label: "Anantha",  amount: ANT_MO, color: C.anantha, badge: "savings" },
      ],
      monthlyTotal: EMI + P2_MOM + ANT_MO, phaseTotal: t2, momAfter: momAfterP2,
      phaseTotals: [
        { key: "emi",     label: "Bank EMI", color: C.bank,    total: EMI * 2 },
        { key: "mom",     label: "Mom",      color: C.mom,     total: P2_MOM * 2 },
        { key: "anantha", label: "Anantha",  color: C.anantha, total: ANT_MO * 2 },
      ],
      milestones: [],
    },
    {
      id: 3, title: "Full Speed", subtitle: "All three running — EMI, Mom and Anantha fund",
      start: "2026-08", end: "2027-03", months: 8, budget: 350_000,
      payments: [
        { key: "emi",     label: "Bank EMI", amount: EMI,     color: C.bank },
        { key: "mom",     label: "Mom",      amount: p3MomMo, color: C.mom },
        { key: "anantha", label: "Anantha",  amount: ANT_MO,  color: C.anantha, badge: "savings" },
      ],
      monthlyTotal: 350_000, phaseTotal: t3, momAfter: momAfterP3,
      phaseTotals: [
        { key: "emi",     label: "Bank EMI", color: C.bank,    total: EMI * 8 },
        { key: "mom",     label: "Mom",      color: C.mom,     total: p3MomMo * 8 },
        { key: "anantha", label: "Anantha",  color: C.anantha, total: ANT_MO * 8 },
      ],
      milestones: [
        "Mom payments increase · Aug 2026",
        `Anantha ${formatINRCompact(ANT_BAL)} fund complete · Mar 2027`,
      ],
    },
    {
      id: 4, title: "Heads Down", subtitle: "Bank + Mom every month — Mom closes Mar 2029",
      start: "2027-04", end: "2029-03", months: 24, budget: 350_000,
      payments: [
        { key: "emi", label: "Bank EMI", amount: EMI,     color: C.bank },
        { key: "mom", label: "Mom",      amount: p4MomMo, color: C.mom },
      ],
      monthlyTotal: 350_000, phaseTotal: t4, momAfter: 0,
      phaseTotals: [
        { key: "emi", label: "Bank EMI", color: C.bank, total: EMI * 24 },
        { key: "mom", label: "Mom",      color: C.mom,  total: p4MomMo * p4FullMonths + momFinalP4 },
      ],
      milestones: [
        `Mom fully repaid · Mar 2029 (closing balance ${formatINR(momFinalP4)})`,
      ],
    },
    {
      id: 5, title: "Last EMI", subtitle: "Mom is done — one final bank payment",
      start: "2029-04", end: "2029-04", months: 1, budget: 350_000,
      payments: [
        { key: "emi", label: "Bank EMI", amount: LAST_EMI, color: C.bank, badge: "last-emi" },
      ],
      monthlyTotal: t5, phaseTotal: t5, momAfter: 0,
      phaseTotals: [], // single month
      milestones: ["Last EMI paid", "DEBT FREE 🎉"],
      isFinal: true,
    },
  ];
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function Badge({ type }: { type: PhasePayment["badge"] }) {
  if (!type) return null;
  const styles: Record<string, string> = {
    closed:   "bg-green-50 text-green-600 border-green-200",
    savings:  "bg-orange-50 text-orange-600 border-orange-200",
    final:    "bg-blue-50 text-blue-600 border-blue-200",
    "last-emi": "bg-amber-50 text-amber-600 border-amber-200",
  };
  const labels: Record<string, React.ReactNode> = {
    closed:   "closed ✓",
    savings:  <><PiggyBank size={9} className="inline mr-0.5" />savings</>,
    final:    "balance cleared ✓",
    "last-emi": "final EMI",
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-medium border rounded-full px-1.5 py-0.5 leading-none ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

// ── Phase card ─────────────────────────────────────────────────────────────────

const PHASE_COLORS = [
  { num: "bg-orange-100 text-orange-700", card: "border-orange-200 bg-orange-50/30", header: "text-orange-700" },
  { num: "bg-slate-100 text-slate-600",   card: "border-slate-200 bg-slate-50/50",   header: "text-slate-700" },
  { num: "bg-blue-100 text-blue-700",     card: "border-blue-200 bg-blue-50/30",     header: "text-blue-700" },
  { num: "bg-indigo-100 text-indigo-700", card: "border-indigo-200 bg-indigo-50/30", header: "text-indigo-700" },
  { num: "bg-yellow-200 text-yellow-800", card: "border-yellow-300 bg-yellow-50",    header: "text-yellow-800" },
];

function PhaseCard({ phase }: { phase: Phase }) {
  const pc = PHASE_COLORS[(phase.id - 1) % PHASE_COLORS.length];
  const monthLabel =
    phase.start === phase.end
      ? formatMonthYear(phase.start)
      : `${formatMonthYear(phase.start)} – ${formatMonthYear(phase.end)}`;

  return (
    <div className={`rounded-2xl border ${pc.card} overflow-hidden`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${pc.num}`}>
            {phase.isFinal ? <Trophy size={15} /> : phase.id}
          </div>
          <div className="min-w-0">
            <p className={`text-base font-bold leading-tight ${pc.header}`}>{phase.title}</p>
            <p className="text-sm text-slate-500 mt-0.5">{phase.subtitle}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400">{monthLabel}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            {phase.months} month{phase.months > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Milestones */}
      {phase.milestones.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {phase.milestones.map((m) => (
            <span
              key={m}
              className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 ${
                phase.isFinal
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              {phase.isFinal ? "🎉" : <CheckCircle size={10} className="text-green-500" />}
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Payment breakdown */}
      <div className="px-5 pb-2">
        {/* Stacked bar */}
        <div className="flex h-2 rounded-full overflow-hidden gap-[2px] mb-4">
          {phase.payments.map((p) => (
            <div
              key={p.key}
              style={{
                width: `${(p.amount / phase.budget) * 100}%`,
                background: p.color,
              }}
              title={`${p.label}: ${formatINR(p.amount)}`}
            />
          ))}
          {phase.monthlyTotal < phase.budget && (
            <div className="flex-1 bg-slate-200 rounded-r-full" />
          )}
        </div>

        {/* Rows */}
        <div className="space-y-1 mb-4">
          {phase.payments.map((p) => (
            <div key={p.key} className="flex items-center gap-3">
              {/* Mini bar */}
              <div className="w-28 md:w-40 shrink-0 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(p.amount / phase.budget) * 100}%`,
                    background: p.color,
                  }}
                />
              </div>
              {/* Dot + label */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-sm text-slate-600 truncate">{p.label}</span>
                <Badge type={p.badge} />
              </div>
              {/* Amount */}
              <div className="text-sm font-semibold text-slate-800 tabular-nums shrink-0">
                {formatINR(p.amount)}
                {phase.months > 1 && <span className="text-xs text-slate-400 font-normal">/mo</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-black/5 bg-black/[0.02]">
        {/* Per-creditor phase totals — shown for multi-month phases */}
        {phase.months > 1 && phase.phaseTotals.length > 0 && (
          <div className="px-5 pt-3 pb-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Phase total breakdown
            </p>
            <div className="flex flex-col gap-1">
              {phase.phaseTotals.map((t) => (
                <div key={t.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                    <span className="text-xs text-slate-500">{t.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">
                    {formatINR(t.total)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-black/5 pt-1 mt-0.5">
                <span className="text-xs font-semibold text-slate-500">Phase total</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {formatINRCompact(phase.phaseTotal)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Summary row */}
        <div className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1">
          {phase.months > 1 ? (
            <div>
              <span className="text-xs text-slate-400">Per month  </span>
              <span className="text-sm font-semibold text-slate-700">{formatINR(phase.monthlyTotal)}</span>
            </div>
          ) : (
            <div>
              <span className="text-xs text-slate-400">Total this month  </span>
              <span className="text-sm font-semibold text-slate-700">{formatINR(phase.monthlyTotal)}</span>
            </div>
          )}
          {!phase.isFinal && phase.momAfter > 0 && (
            <div className="ml-auto">
              <span className="text-xs text-slate-400">Mom remaining  </span>
              <span className="text-sm font-semibold text-slate-700">{formatINRCompact(phase.momAfter)}</span>
            </div>
          )}
          {(!phase.isFinal && phase.momAfter === 0 && phase.id !== 5) && (
            <div className="ml-auto">
              <span className="text-xs font-medium text-green-600">Mom fully repaid ✓</span>
            </div>
          )}
          {phase.isFinal && (
            <div className="ml-auto">
              <span className="text-sm font-bold text-yellow-700">₹0 — completely free! 🎉</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function StrategyTimeline() {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/house-loan/creditors")
      .then(r => r.json())
      .then((creds: Creditor[]) => {
        setTotalDebt(creds.reduce((s, c) => s + c.remaining, 0));
        setPhases(computePhases(creds));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading strategy…
      </div>
    );
  }

  const totalMonths = phases.reduce((s, p) => s + p.months, 0);

  return (
    <div className="px-4 py-6 md:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Repayment Strategy</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your vision — 5 phases from May 2026 to debt freedom in April 2029.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Total Debt" value={formatINRCompact(totalDebt)} sub={formatINR(totalDebt)} />
        <Stat label="Freedom Date" value="Apr 2029" sub={`${totalMonths} months`} />
        <Stat label="Budget (month 1–3)" value="₹3,00,000" sub="Breathing space" />
        <Stat label="Budget (month 4+)" value="₹3,50,000" sub="Full speed" />
      </div>

      {/* Phases */}
      <div className="flex flex-col gap-3">
        {phases.map((phase, i) => (
          <div key={phase.id}>
            <PhaseCard phase={phase} />
            {i < phases.length - 1 && (
              <div className="flex justify-center py-1">
                <ChevronRight size={16} className="text-slate-300 rotate-90" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
