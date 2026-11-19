"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { todayIst } from "@/lib/mlive/calendar";
import {
  LONG_GAME_CHART_COLOURS,
  formatLongDate,
  formatMoney,
  sliceChart,
  type ChartPoint,
} from "@/lib/mlive/long-game-value";

const RANGES = ["3M", "1Y", "All"] as const;

export function LongGameChart({ points, note }: { points: ChartPoint[]; note: string | null }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("All");
  const shown = sliceChart(points, range, todayIst());
  if (points.length === 0) return null;
  return (
    <article className="card lg-chart">
      <div className="lg-chart-head">
        <h2>Value</h2>
        <div className="lg-range" role="group" aria-label="Chart range">
          {RANGES.map((item) => (
            <button key={item} type="button" aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>
          ))}
        </div>
      </div>
      <div className="lg-chart-frame">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={shown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tickFormatter={(value: string) => formatLongDate(String(value)).replace(/ \d{4}$/, "")} minTickGap={28} tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value: number) => formatMoney(value)} width={88} tick={{ fontSize: 12 }} />
            <Tooltip content={<ChartTip />} />
            <Line type="monotone" dataKey="value" name="Long Game" stroke={LONG_GAME_CHART_COLOURS.value} strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line type="stepAfter" dataKey="moneyAdded" name="Money added" stroke={LONG_GAME_CHART_COLOURS.moneyAdded} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="nifty" name="Nifty 50" stroke={LONG_GAME_CHART_COLOURS.nifty} strokeDasharray="6 4" strokeWidth={1.5} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="legend">
        <span><i className="swatch longgame" /> Long Game</span>
        <span><i className="swatch ink" /> Money added</span>
        <span><i className="swatch nifty" /> Nifty 50</span>
      </p>
      {note && <p className="lg-note">{note}</p>}
    </article>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="lg-tip">
      <b>{formatLongDate(String(label))}</b>
      {payload.map((item) => (
        <p key={item.name}>{item.name}: {item.value == null ? "—" : formatMoney(item.value)}</p>
      ))}
    </div>
  );
}
