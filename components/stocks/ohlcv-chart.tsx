"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type Time,
} from "lightweight-charts";

function toDateStr(d: string) {
  return d.slice(0, 10);
}

function calcMA(data: OhlcvRow[], period: number): { time: Time; value: number }[] {
  const result: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += Number(data[j].close);
    result.push({ time: toDateStr(data[i].date) as Time, value: sum / period });
  }
  return result;
}

export interface OhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi: number | null;
}

export interface MAConfig {
  ma20: boolean;
  ma50: boolean;
  ma200: boolean;
}

interface OhlcvChartProps {
  data: OhlcvRow[];
  maConfig: MAConfig;
  visibleDays: number;
}

const COLORS = {
  bg: "#0f1117",
  grid: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "rgba(255,255,255,0.35)",
  up: "#26a69a",
  down: "#ef5350",
  volume: "rgba(100,120,200,0.4)",
  rsi: "#818cf8",
  ma20: "#f59e0b",
  ma50: "#3b82f6",
  ma200: "#a855f7",
};

export function OhlcvChart({ data, maConfig, visibleDays }: OhlcvChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "inherit",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLORS.border },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight || 500,
    });
    chartRef.current = chart;

    // ── Candlestick ──────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    candleSeries.setData(
      data.map((d) => ({
        time: toDateStr(d.date) as Time,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
      }))
    );

    // ── Moving averages (overlaid on main price scale) ───────────
    const maList: [boolean, number, string][] = [
      [maConfig.ma20, 20, COLORS.ma20],
      [maConfig.ma50, 50, COLORS.ma50],
      [maConfig.ma200, 200, COLORS.ma200],
    ];
    for (const [enabled, period, color] of maList) {
      if (!enabled) continue;
      const maData = calcMA(data, period);
      if (maData.length === 0) continue;
      const maSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      maSeries.setData(maData);
    }

    // ── Volume histogram ─────────────────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: COLORS.volume,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(
      data.map((d) => ({
        time: toDateStr(d.date) as Time,
        value: Number(d.volume),
        color:
          Number(d.close) >= Number(d.open)
            ? "rgba(38,166,154,0.35)"
            : "rgba(239,83,80,0.35)",
      }))
    );

    // ── RSI line ─────────────────────────────────────────────────
    const rsiRows = data.filter((d) => d.rsi != null);
    if (rsiRows.length > 0) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: COLORS.rsi,
        lineWidth: 1,
        priceScaleId: "rsi",
        priceFormat: { type: "price", precision: 1, minMove: 0.1 },
      });
      chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: 0.78, bottom: 0.15 },
      });
      rsiSeries.setData(
        rsiRows.map((d) => ({
          time: toDateStr(d.date) as Time,
          value: Number(d.rsi!),
        }))
      );
    }

    // Zoom to the selected range while keeping all data (so MAs always have history)
    if (visibleDays < 3650 && data.length > 0) {
      const last = toDateStr(data[data.length - 1].date);
      const from = new Date(last);
      from.setDate(from.getDate() - visibleDays);
      chart.timeScale().setVisibleRange({
        from: from.toISOString().slice(0, 10) as Time,
        to: last as Time,
      });
    } else {
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, maConfig, visibleDays]);

  return <div ref={containerRef} className="w-full h-full" />;
}
