"use client";

import Link from "next/link";

export function IntradayView() {
  return (
    <section className="page">
      <h1>Intraday</h1>
      <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <p>No intraday trades yet. The book starts after a strategy passes the bar.</p>
        <p><Link href="/live-trade-mansel/research">See Research</Link></p>
      </div>
    </section>
  );
}
