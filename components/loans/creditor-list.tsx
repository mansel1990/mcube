"use client";

import { CreditorCard, CreditorWithStats } from "./creditor-card";

interface CreditorListProps {
  creditors: CreditorWithStats[];
  onQuickPay: (creditor: CreditorWithStats) => void;
}

export function CreditorList({ creditors, onQuickPay }: CreditorListProps) {
  const active = creditors
    .filter((c) => c.isActive && c.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  const done = creditors.filter((c) => !c.isActive || c.remaining <= 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {active.map((c) => (
          <CreditorCard key={c._id} creditor={c} onQuickPay={onQuickPay} />
        ))}
      </div>

      {done.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Completed
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {done.map((c) => (
              <CreditorCard key={c._id} creditor={c} onQuickPay={onQuickPay} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
