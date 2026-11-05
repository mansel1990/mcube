"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { inr, signed } from "./format";

type Point = { date: string; value: number; peak: number; drawdown: number };
type Payload = { series: Point[]; strategies: { strategy: string; pnl: number }[]; breakerPct: number };

function coords(values: number[], width: number, height: number, min: number, max: number) {
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 28) - 8;
    return { x, y, value };
  });
}

export function ChartsView() {
  const [range, setRange] = useState<"all" | "1m">("all");
  const [data, setData] = useState<Payload | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/charts?range=${range}`).then(async (res) => {
        if (res.ok) setData(await res.json());
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [range]);

  const series = data?.series ?? [];
  const last = series[series.length - 1];
  const first = series[0];
  const change = last && first ? last.value - first.value : 0;
  const values = series.map((point) => point.value);
  const peaks = series.map((point) => point.peak);
  const min = values.length ? Math.min(...values, ...peaks) : 0;
  const max = values.length ? Math.max(...values, ...peaks) : 1;
  const account = coords(values, 800, 240, min, max);
  const peakLine = coords(peaks, 800, 240, min, max);
  const drawdowns = series.map((point) => -point.drawdown);
  const dd = coords(drawdowns, 800, 220, -Math.max(data?.breakerPct ?? 25, ...series.map((point) => point.drawdown), 1), 0);
  const line = (points: { x: number; y: number }[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  function hover(event: MouseEvent<SVGSVGElement>, points: { x: number; y: number; value: number }[], format: (value: number, index: number) => string) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 800;
    const index = Math.max(0, Math.min(points.length - 1, Math.round((x / 800) * (points.length - 1))));
    const point = points[index];
    if (!point) return;
    setTip({ x: event.clientX - rect.left + 12, y: event.clientY - rect.top - 28, text: format(point.value, index) });
  }

  return (
    <section className="page">
      <div className="sec-h">
        <div>
          <h1>Charts</h1>
          <p className="sub">Live money only. Paper and backtest results are never mixed in.</p>
        </div>
        <div className="seg">
          <button type="button" aria-pressed={range === "1m"} onClick={() => setRange("1m")}>1M</button>
          <button type="button" aria-pressed={range === "all"} onClick={() => setRange("all")}>All</button>
        </div>
      </div>
      <div className="card chart-card" style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2>Account value</h2>
            <p className="sub">{last ? inr(last.value) : "No equity yet"}{last ? ` · ${signed(change)} in this view` : ""}</p>
          </div>
          <div className="legend"><span>Account value</span><span>Peak, dashed</span></div>
        </div>
        <svg viewBox="0 0 800 240" width="100%" height="240" role="img" aria-label="Account value and peak" onMouseMove={(event) => hover(event, account, (value, index) => `${series[index]?.date ?? ""} · ${inr(value)} · peak ${inr(peaks[index] ?? 0)}`)} onMouseLeave={() => setTip(null)}>
          <path d={line(peakLine)} fill="none" stroke="var(--ink3)" strokeDasharray="5 4" strokeWidth="1.5" />
          <path d={line(account)} fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>
        {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      </div>
      <div className="two" style={{ marginTop: 16 }}>
        <div className="card chart-card" style={{ position: "relative" }}>
          <h2>Down from peak</h2>
          <p className="sub">The engine pauses itself at {data?.breakerPct ?? 25}%.</p>
          <svg viewBox="0 0 800 220" width="100%" height="220" role="img" aria-label="Drawdown from peak" onMouseMove={(event) => hover(event, dd, (value, index) => `${series[index]?.date ?? ""} · ${value.toFixed(1)}% from peak`)} onMouseLeave={() => setTip(null)}>
            <path d={line(dd)} fill="none" stroke="var(--down)" strokeWidth="2" />
          </svg>
          {last && <p className="note">Latest drawdown {last.drawdown.toFixed(1)}%. The breaker line is {data?.breakerPct ?? 25}%.</p>}
        </div>
        <div className="card chart-card">
          <h2>Profit by strategy</h2>
          <p className="sub">Realised after charges. Open profit is in the account line.</p>
          {(data?.strategies ?? []).length === 0 && <p className="muted">No closed trades yet.</p>}
          {(data?.strategies ?? []).map((row) => (
            <div key={row.strategy} className="field" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span className="strat"><i style={{ background: row.strategy === "ema" ? "var(--ema)" : "var(--rs)" }} />{row.strategy === "ema" ? "EMA Pullback" : "RS Resilience"}</span>
              <b className={`n ${row.pnl >= 0 ? "up" : "down"}`}>{signed(row.pnl)}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
