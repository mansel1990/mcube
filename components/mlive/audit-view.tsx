"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DailyReport } from "@/lib/mlive/daily";
import { AuditDaily } from "./audit-daily";
import { AuditLog } from "./audit-log";
import { SystemView } from "./system-view";

const VIEWS = [
  { id: "daily", label: "Daily report" },
  { id: "log", label: "Log" },
  { id: "system", label: "System" },
] as const;

function dayName(iso: string): string {
  if (!iso) return "Today";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function AuditView() {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "log" || params.get("view") === "system" ? params.get("view")! : "daily";
  const type = params.get("type") || "decisions";
  const who = params.get("who") === "engine" || params.get("who") === "you" ? params.get("who")! : "everyone";
  const book = params.get("book") === "swing" || params.get("book") === "intraday" ? params.get("book")! : "all";
  const q = params.get("q") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Number(params.get("page") ?? "0") || 0;
  const day = params.get("day") ?? "";
  const [nav, setNav] = useState<Pick<DailyReport, "day" | "prevDay" | "nextDay" | "today"> | null>(null);

  function replace(next: Record<string, string>) {
    const url = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      const drop = !value || value === "all" || value === "everyone" || value === "decisions" || (key === "view" && value === "daily");
      if (drop) url.delete(key);
      else url.set(key, value);
    }
    if ("type" in next || "who" in next || "book" in next || "q" in next || "from" in next || "to" in next || "day" in next) url.delete("page");
    const query = url.toString();
    router.replace(query ? `/live-trade-mansel/audit?${query}` : "/live-trade-mansel/audit", { scroll: false });
  }

  useEffect(() => {
    if (view === "system") return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/mlive/audit/daily?day=${day}`, { cache: "no-store" }).then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as DailyReport;
        setNav({ day: body.day, prevDay: body.prevDay, nextDay: body.nextDay, today: body.today });
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view, day]);

  const shown = nav?.day || day;

  return (
    <section className="page">
      <div className="page-head audit-head">
        <div className="audit-title">
          <h1>Audit</h1>
          {view !== "system" && (
            <div className="day-step" role="group" aria-label="Day">
              <button type="button" className="btn tiny" onClick={() => shown && replace({ day: nav?.prevDay || shown, from: view === "log" ? (nav?.prevDay || shown) : "", to: view === "log" ? (nav?.prevDay || shown) : "" })} aria-label="Previous day">‹</button>
              <span>{dayName(shown)}</span>
              <button type="button" className="btn tiny" disabled={!nav?.nextDay} onClick={() => nav?.nextDay && replace({ day: nav.nextDay, from: view === "log" ? nav.nextDay : "", to: view === "log" ? nav.nextDay : "" })} aria-label="Next day">›</button>
            </div>
          )}
        </div>
        <div className="audit-tools">
          {view === "daily" && (
            <a className="icon-btn" href="/api/mlive/reports/csv?book=swing" aria-label="Download CSV" title="Download CSV">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></svg>
            </a>
          )}
          <div className="seg audit-switch" role="tablist" aria-label="Audit view">
            {VIEWS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => replace({ view: item.id })}>{item.label}</button>
            ))}
          </div>
        </div>
      </div>

      {view === "daily" && <AuditDaily day={day} onDay={(next) => replace({ day: next })} onSystem={() => replace({ view: "system" })} />}
      {view === "log" && (
        <AuditLog type={type} who={who} book={book} q={q} from={from} to={to} page={page} onChange={replace} />
      )}
      {view === "system" && <SystemView onReport={(next) => replace({ view: "daily", day: next })} />}
    </section>
  );
}
