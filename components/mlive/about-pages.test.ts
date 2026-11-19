import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhilosophyArticle, RulesArticle } from "@/components/about/articles";
import { aboutPathIsPublic } from "@/lib/about/access";
import { rulesModelFrom } from "@/lib/about/rules-model";

describe("shareable about pages", () => {
  const markdown = readFileSync(new URL("../../content/philosophy.md", import.meta.url), "utf8");
  const production = {
    markdown,
    fund: 80000,
    cash: 65432.1,
    account: 91234,
    pnl: 1500.55,
    kiteUserId: "AB1234",
    accessToken: "secret-token-xyz",
    holdings: [{ symbol: "RELIANCE", qty: 14, pnl: -4321 }],
    orders: [{ symbol: "TCS", id: 9911 }],
    positions: [{ symbol: "INFY", qty: 3 }],
    lastUpdated: "18 Nov 2026",
    settings: {
      strategies_enabled: ["momentum"],
      max_order_pct: 0.1,
      min_order_inr: 4000,
      max_open_positions: 6,
      max_per_sector: 2,
      max_daily_deploy_pct: 0.5,
      max_new_buys_per_day: 2,
      max_buys_per_strategy_per_day: 2,
      max_open_per_strategy: 4,
      max_buys_per_day: 4,
      max_sells_per_day: 4,
      breaker_pct: 0.15,
      chase_pct: 0.03,
      limit_offset_pct: 0.005,
      intraday_exit_time: "15:00",
      intraday_max_trades: 4,
      intraday_risk_pct: 0.01,
      intraday_day_loss_pct: 0.02,
      intraday_entry_window: { before: "09:20", after: "14:30" },
      login_reminder: true,
      longterm_max_changes_per_year: 12,
      longterm_proposal_expiry_days: 3,
      cash_reserve_inr: 500,
      trading_limit: 80000,
      intraday_capital_inr: 20000,
      kite_user_id: "AB1234",
    },
  };

  it("renders both pages without fund, holdings, orders, or session values", () => {
    const philosophy = renderToStaticMarkup(createElement(PhilosophyArticle, { markdown }));
    const rules = renderToStaticMarkup(createElement(RulesArticle, { model: rulesModelFrom(production) })).replace(/&#x27;/g, "'");
    const html = `${philosophy}\n${rules}`;
    expect(philosophy).toContain("Our philosophy");
    expect(philosophy).toContain("Why we do this");
    expect(philosophy).toContain("Honest expectations");
    expect(rules).toContain("Momentum M10-6 — live pilot by owner's choice, did not pass every test");
    expect(rules).toContain("EMA Pullback — parked");
    expect(rules).toContain("RS Resilience — parked");
    expect(rules).toContain("There is no price stop");
    expect(rules).toContain("id=\"long-game\"");
    expect(rules).toContain("40% Nifty 50, 20% Midcap 150, 25% Gold and 15% Liquid");
    expect(rules).toContain("Core is the only live Long Game scope");
    expect(rules).toContain("run 17");
    expect(rules).toContain("14.2%");
    expect(rules).toContain("12.5%");
    expect(rules).toContain("Last updated 18 Nov 2026");
    expect(rules).toContain("4,000");
    expect(rules).toContain("15:00");
    for (const secret of ["80000", "80,000", "65432", "91234", "1500.55", "AB1234", "secret-token-xyz", "RELIANCE", "TCS", "INFY", "4321", "20000", "20,000", "cash_reserve", "trading_limit", "kiteUserId"]) {
      expect(html).not.toContain(secret);
    }
  });

  it("stays outside the login check", () => {
    expect(aboutPathIsPublic("/about/philosophy")).toBe(true);
    expect(aboutPathIsPublic("/about/rules")).toBe(true);
    expect(aboutPathIsPublic("/live-trade-mansel")).toBe(false);
    const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../app/(public)/about/layout.tsx", import.meta.url), "utf8");
    const philosophy = readFileSync(new URL("../../app/(public)/about/philosophy/page.tsx", import.meta.url), "utf8");
    const rules = readFileSync(new URL("../../app/(public)/about/rules/page.tsx", import.meta.url), "utf8");
    expect(proxy.indexOf("aboutPathIsPublic")).toBeGreaterThan(-1);
    expect(proxy.indexOf("aboutPathIsPublic")).toBeLessThan(proxy.indexOf("sessionCookie"));
    for (const source of [layout, philosophy, rules]) {
      expect(source).toContain("noindex");
      expect(source).toContain("nofollow");
    }
    expect(readFileSync(new URL("../../app/(mlive)/layout.tsx", import.meta.url), "utf8")).toContain("requireMliveUser");
    expect(philosophy).not.toContain("requireMliveUser");
    expect(rules).not.toContain("requireMliveUser");
  });
});
