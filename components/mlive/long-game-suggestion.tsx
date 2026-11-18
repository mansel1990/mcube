"use client";

import { useMemo, useState } from "react";
import { estimateCharges } from "@/lib/mlive/charges";
import { wholeUnitPlan } from "@/engine/longterm/suggest";

const CHIPS = [0, 10_000, 50_000, 100_000];

export function LongGameSuggestion() {
  const [amount, setAmount] = useState(10_000);
  const [message, setMessage] = useState("This is a preview. Long Game is off, so Approve does not place an order.");
  const plan = useMemo(() => wholeUnitPlan({
    selected: amount,
    suggested: 10_000,
    price: 300,
    side: "BUY",
    chargeFor: (side, turnover) => estimateCharges(side, turnover).total,
  }), [amount]);

  return (
    <section className="page">
      <h1>Suggestion</h1>
      <p className="sub">Core preview for NIFTYBEES at ₹300. Steps are ₹5,000. The book is off.</p>
      <p className="lbl">Amount {`₹${amount.toLocaleString("en-IN")}`}</p>
      <div className="seg" role="group" aria-label="Amount steps">
        <button type="button" className="btn" onClick={() => setAmount((value) => Math.max(0, value - 5000))}>− ₹5,000</button>
        <button type="button" className="btn" onClick={() => setAmount((value) => Math.min(100_000, value + 5000))}>+ ₹5,000</button>
      </div>
      <div className="seg" role="group" aria-label="Amount chips" style={{ marginTop: 8 }}>
        {CHIPS.map((chip) => (
          <button key={chip} type="button" className="btn" aria-pressed={amount === chip} onClick={() => setAmount(chip)}>
            {chip === 0 ? "₹0" : `₹${chip.toLocaleString("en-IN")}`}
          </button>
        ))}
      </div>
      <article className="card" style={{ marginTop: 16 }}>
        <p>Plan is {plan.relation} the suggested ₹10,000.</p>
        <p>{plan.units} whole units. Charges ₹{plan.charges.toFixed(2)}. Tax ₹{plan.tax.toFixed(2)}. Leftover ₹{plan.leftover.toFixed(2)}.</p>
        <p className="sub">Rules {plan.rulesVersion}. Sells stay off unless that suggestion turns the advanced option on.</p>
      </article>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn primary" disabled onClick={() => setMessage("Approve stays off while Long Game is disabled.")}>Approve</button>
        <button type="button" className="btn" onClick={() => setMessage("Rejected the preview. No order was sent.")}>Reject</button>
      </div>
      <p className="sub">{message}</p>
    </section>
  );
}
