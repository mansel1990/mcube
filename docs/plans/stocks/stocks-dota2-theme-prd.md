# PRD — Stocks Section DOTA2 Theme Redesign ("The Dire Terminal")

**Date:** 2026-06-12 (rev 3)
**Owner:** Sanjay
**Status:** **Frontend built (2026-06-12); ML heroes live.** Phases 1, 2 and 4 plus Phase 3 are live in mcube: theme foundation (`lib/stocks/heroes.ts`, `.theme-dota` tokens in `globals.css`, Cinzel, `DotaShell`), War Room (`/stocks` with Retreat Calls → On the Map → Pick Phase, Divine/Rare tiers, bench, FIRST BLOOD), Demo Mode, Ranked, Options, themed login, and `/api/stocks/swing/exit-signals` (returns empty until the RS backend lands). **Phase 0b resolved (2026-06-12):** `daily_suggestor` already persists to Neon — schema `daily_suggestor` with `trades` (full lifecycle incl. `hero` column, `proba`, buy range, exits `target|stop|time|outside_buy_range`, `pnl_rs`) and `daily_runs`. The 6 ML heroes now render real picks in the War Room (`/api/stocks/ml/signals`, OPEN_PENDING_FILL rows, top-2 proba per scan = Divine) and full history/stats in Demo Mode. **Still pending:** Phase 0a (RS exit engine in the trading repo).
**Audience:** Personal app (Sanjay + brother). Not professional. Fun is a feature.

> **Rev 3.2 (2026-06-12, at build):** **EMA Pullback promoted off the bench into the active roster** (Juggernaut, full color). This restores the original scope of `trading/docs/PRD-rs-ema-exit-signals.md` — RS **and** EMA both run with the trend-break exit engine. Bench is now 4: Breakout, VCP, Fib Pullback, Fear Reversion. The Pick Phase also gained subtle tier segregation: Recommended (Divine) → Also scouted (Rare) → From the bench.
> **Rev 2:** Rebuilt around the current production `main.py` (6 ML strategies from `daily_suggestor` + `swing_mr`, hero-named by the backend). Legacy swing strategies are **not killed** — they go to the bench on an extended paper trial.
> **Rev 3.1:** Decision — **"5 scouted, 2 recommended" for every strategy.** All scanners (RS, MiRana, the 6 ML heroes, bench) keep emitting and paper-logging up to 5 signals for sample size, but each strategy recommends **at most 2 per day** (Divine tier); the rest render as Rare. See §2.3.
> **Rev 3:** **RS Resilience promoted into the active roster (8th strategy).** RS was excluded from the Jan–May backtest only because the backtest had no Nifty data (Mansfield RS couldn't be computed — see `rs-ema-exit-redesign.md` §3.5), and it was the top live paper earner over 20 May–8 Jun. It rejoins the daily run **with the improved exit-signal logic** from `trading/docs/PRD-rs-ema-exit-signals.md` (EOD trend-break exits, `swing.exit_signals`, one-position-per-symbol). That backend PRD is back in scope for RS only.

---

## 1. What we're doing, in one paragraph

Reskin the entire stocks section of mcube as a full-immersion DOTA2 experience — dark fantasy UI, strategies as heroes, buys as picks, the nightly sell decisions as retreat calls, P&L as gold, the performance page as a post-game scoreboard — **while keeping every functional behaviour exactly as it is today** (filters, Kite buy/sell + GTT, trade logging, live prices, push, auth). The active roster is **8 strategies**: the seven the backend already defines in `main.py` (**GARudaVahana, Wayuputra, Gobin xood, GaMomra, TeCNa, KlaMeReous, MiRana**) plus **RS Resilience**, promoted back in with the improved exit-signal engine from the RS exit PRD. The five remaining legacy swing strategies stay alive as a **benched roster on paper trial**, with their stats visible so promotion/demotion later is a data decision.

---

## 2. Goals & non-goals

### Goals
1. Every screen in `/stocks/*` looks and reads like DOTA2 — copy, color, iconography, motion.
2. The app answers three questions every evening, in this order: **what to SELL** (resolver exits), **what you're HOLDING**, **what to BUY** (tonight's picks).
3. Real numbers stay first-class. Theme labels decorate, never replace: every gold count shows actual ₹, every stop shows the actual price.
4. The full 8-hero active roster (7 from `main.py` + RS) is visible in the UI — today only MiRana's and the legacy tables' signals reach the frontend (see §2.1 dependencies).
5. The bench (legacy strategies) is visible-but-grey, with rolling paper stats, framed as an ongoing trial — not deleted.

### Non-goals
- **No functional changes** to existing behaviour: no new trading logic in the frontend, no changes to auth, Kite, push, MongoDB.
- No sound effects or voice lines in v1 (announcer-style *copy* yes; audio is a Phase-5 optional toggle).
- No changes to admin/loans sections.
- No copyrighted Valve assets committed to the repo (§8).
- Not redesigning the backend strategies themselves — we render what the orchestrator produces.

### 2.1 Backend baseline + dependencies

Production backend = current `trading/scanner/main.py` (cron 6 PM IST):
1. `daily_suggestor.run_daily` — refreshes ~1700-ticker data, **resolves open positions (sells)**, scores 6 ML strategies, saves `OPEN_PENDING_FILL` trades, ntfy buys/sells.
2. `swing_mr` (MiRana) → `swing.mean_reversion_signals` (+ `invested_rs`) + paper book in `swing.strategy_performance`.
3. **New — RS Resilience step** (to be added to the orchestrator): `rs_scanner` entries → `swing.rs_signals`, plus the exit engine from `trading/docs/PRD-rs-ema-exit-signals.md`:
   - EOD exits per open position: `trend_break` (close < 20 EMA; 10 EMA once unrealized ≥ +8%), `stop_loss`, `rs_fade` (Mansfield RS fading while in profit), `time_exit` (20 trading days).
   - New table **`swing.exit_signals`** `(date, symbol, strategy, reason, ref_price)` — the frontend's RETREAT feed.
   - **One open position per symbol per strategy** (kills the re-entry churn that concentrated 84% of RS profit in 2 names).
   - RS noise-reduction filters (RS-line persistence, liquidity floor) + **conviction ranking** (§2.3).
   - Needs the **Nifty (^NSEI) series** — either a small yfinance fetch in this step or added to the CSV refresh. The same data unblocks the brother's RS backtest (redesign doc §3.5).

**ML data contract — RESOLVED (2026-06-12).** Schema discovery found `daily_suggestor` already writes to Neon:

| Need | Where it actually lives |
|---|---|
| Tonight's buys | `daily_suggestor.trades` with `status='OPEN_PENDING_FILL'` — `ticker, strategy, signal_date, proba, signal_close, buy_range_low/high, target_pct, stop_pct, max_days, invested_rs, hero` |
| Open positions | same table, `status='OPEN'` (+ `entry_date/price, target_price, stop_price, expiry_date`) |
| Sells / history | same table, `status='CLOSED'` with `exit_reason ∈ {target, stop, time}`, `pnl_pct` (fraction), `pnl_rs`; `CANCELLED` = `outside_buy_range` |
| Run telemetry | `daily_suggestor.daily_runs` (universe size, new buys, fills, closes, realised P&L, open positions) |
| Hero config | the table carries a `hero` column (GARudaVahana, Wayuputra, …) — frontend mirrors it in `HERO_META` |

Frontend wiring (done): `/api/stocks/ml/signals` serves pending-fill picks as UnifiedSignals (top-2 `proba` per strategy per scan = Divine; target/stop derived from `signal_close × (1±pct)`); the performance API merges ML trades + computed stats into Demo Mode. No backend change was needed.

### 2.2 The bench — longer run, not a kill (decision)

**RS is promoted** (rev 3): its backtest exclusion was a data artifact (no Nifty series → Mansfield RS skipped), and it was the top live paper earner (+₹3,026 over 20 May–8 Jun while Nifty fell 2%). It rejoins the daily run with the improved exit engine (§2.1 step 3). Once Nifty data is available, the brother's backtest should validate it properly (redesign doc §3.5).

For the remaining five, the evidence is thin in both directions — three weeks of paper is too small a sample, and a backtest is not live data. **Decision: nothing gets deleted.**

- A paper-only cron step (subset of `main_sanjay.py --save`) keeps `ema_pullback`, `breakout`, `fib_pullback`, `vcp`, `fear_reversion` accumulating live paper trades in `swing.strategy_performance`. No ntfy, no real-money prompts.
- The UI shows them as the **BENCHED roster**: greyed hero rows with rolling 30/90-day paper win-rate and P&L — a visible trial scoreboard.
- Review checkpoint: revisit the bench after ~3 months of parallel live paper data; promote/demote based on the scoreboard.

*(Backend to-do, trading repo: confirm/wire the second cron step on the DO box. One line in the cron file or a second call in `main.py`.)*

### 2.3 "5 scouted, 2 recommended" — conviction ranking, all strategies (decision, rev 3.1)

Question considered: should strategies emit only 2 signals instead of 5? **Decision: keep up to 5 in every scanner, rank them, recommend at most 2 — uniformly across the whole roster** (RS, MiRana, the 6 ML heroes; bench strategies too, for when they're promoted).

- **Scanners keep emitting and paper-logging up to 5 per strategy.** Cutting to 2 at the source would more than halve the rate at which the paper book accumulates evidence — fatal for strategies that were just promoted (RS) or are on trial — and would discard the information of how picks #3–5 perform.
- **Each strategy ranks its night's signals by its natural conviction metric** — RS by Mansfield outperformance vs Nifty (not volume ratio, which the redesign doc already distrusts for RS); ML heroes by their model score; MiRana and the swing bench by setup quality (e.g. reversal strength × volume). Rank 1–2 → `signal_strength = 'Strong'`, rank 3–5 → `'Moderate'` — giving that existing column a real, computed meaning. For the ML tables this means the data contract (§2.1) must expose the score or a strength/rank field.
- **UI mapping:** rank 1–2 = **Divine** tier (glowing cards, sorted first), rank 3–5 = **Rare** ("also scouted", below). On the "All" filter, Divine picks from every hero sort above all Rare ones, so the evening read is: a handful of Divine cards on top, everything else collapsed visual noise below. The user acts on Divine; everything still feeds the stats.
- Note the one-position-per-symbol cap (§2.1) already thins the actionable list naturally — repeat names render as "Already on the map" — so most evenings will surface only a few genuinely new Divine picks across the whole roster.

---

## 3. Theme concept

### 3.1 The metaphor map

| Trading concept | DOTA2 concept | Where it appears |
|---|---|---|
| The market | The map | Background texture, header |
| A strategy | A hero | Cards, filters, performance tabs |
| Tonight's signals | **Draft / picks phase** | `/stocks` "PICK PHASE" section |
| Buying (Kite/log) | **Picking the hero** ("PICK" button) | Signal card actions |
| `OPEN_PENDING_FILL` | **Hero picked, waiting to spawn** (pending fill in the entry zone) | Pick card state |
| Open position | Hero on the map (alive) | "ON THE MAP" section |
| Unrealized P&L | **Gold / net worth** (gold coin, ₹) | Position cards, portfolio |
| `invested_rs` per strategy | **Starting gold** | Card stat |
| Stop loss / RS trend stop (20/10 EMA) | **Your tower** — fall behind it and you're in danger. For RS this is the live trend stop; for others, the stop-loss price | Card stat |
| RS profit ratchet (≥ +8% → 10 EMA stop) | **Aegis acquired** — your gains are now protected (real mechanic for RS; display-only flair elsewhere) | Position card badge |
| Exit signal / resolver sell today | **"RETREAT!" / red EXIT banner** | Top of `/stocks`, push copy |
| Exit reasons | trend_break = *"Your tower has fallen"* · stop_loss = *"You have been slain"* · rs_fade = *"The buff has expired"* · time_exit / timeout = *"The game has gone late"* · target_hit = *"Objective secured"* · (ML resolver reasons mapped as discovered) | Exit banner + closed cards |
| Selling | **"GG" button** (tap to concede the position) | Exit banner, position card |
| Win rate | **KDA / W-L record** | Performance scoreboard |
| Cumulative P&L chart | **The gold-advantage graph** — green above zero (Radiant), red below (Dire) | Performance + portfolio charts |
| Simulated performance | **Demo mode / bot match** | `/stocks/performance` framing |
| Benched legacy strategies | **The bench** — greyed portraits + trial scoreboard | Roster row, performance tabs |
| Real portfolio | **Ranked match history + inventory** | `/stocks/portfolio` |
| Best trade ever | **Roshan kill** | KPI card |
| Win streak (3/4/5+) | *Killing Spree → Dominating → GODLIKE* | Scoreboard flair |
| First buy of the day | *FIRST BLOOD* toast | Order toast |
| Big single-trade win (≥ +10%) | *RAMPAGE* | Closed card flair |
| Conviction rank 1–2 / 3–5 (`signal_strength` Strong / Moderate, §2.3) | Item tier: **Divine** (recommended) / **Rare** (also scouted) border glow | Signal card border + sort order |
| Daily 6 PM scan | **"Your match is ready" — Ready Check** | Push notification + fresh-scan banner |
| Settings | **Options menu** | `/stocks/settings` |
| Login | **Loading screen** | `/auth/stocks-login` |
| Kite disconnected | *"Reconnect to the game coordinator"* banner | Kite status banner |

### 3.2 Hero roster — strategy names × Dota heroes (locked 2026-06-12)

Roster names come from `main.py`; each is now bound to an actual Dota 2 hero (portrait, color identity, voice of the lore line). Backtest stats render as "hero stats" (matches, win impact, gold earned):

| Roster name | Strategy | **Dota hero** | Flavor (one-line lore in the info drawer) | Accent |
|---|---|---|---|---|
| **GARudaVahana** | `s05_garch_volume` | **Outworld Destroyer** | Banishes volatility to the astral plane — Sanity's Eclipse when the vol regime turns. Top earner: +₹40,159. | Astral purple |
| **Wayuputra** | `s07_wavelet_volume` | **Windranger** | Son of the wind — Windruns through volume waves others can't see, then Focus Fires the breakout. | Forest auburn |
| **Gobin xood** | `sanjay_xgb_b8` | **Nature's Prophet** | A forest of boosted trees whispers to him — and he teleports anywhere on the 1700-ticker map. | Verdant green |
| **GaMomra** | `s08_gap_momentum` | **Pudge** | Hooks the runaway gap and drags it home. Lands few hooks (12 matches) but every one is Fresh Meat: +7.5% a bite. | Rot green / blood |
| **TeCNa** | `s06_tcn_ohlcv` | **Techies** | Remote mines planted across the time axis — the convolution detonates when price walks over the pattern. | Blast yellow |
| **KlaMeReous** | `s11_cluster_meanrev` | **Meepo** | Five of him, one brain. When a clone strays too far from the pack, it Poofs back — that snap-back is the trade. | Earth brown |
| **MiRana** | `swing_mr` | **Mirana** | The name tells it. Waits in moonlight at the 200 EMA and releases the Sacred Arrow on the oversold bounce. | Moonlight blue |
| **RudraShakti** | `rs_resilience` | **Spectre** | Wins from behind — strongest when the whole map is losing. Haunts every winner until its tower falls; never re-buys a hero already on the map. | Spectral violet |
| **Manish** | `sim.stock_suggestions` | **Invoker** | The human quant — z-scores Quas, peer slopes Wex, ten spells of his own pipeline. Kept visually separate. | Quas-Wex-Exort tri-tone |

**The bench (trial roster, rev 3.2):** Breakout, Fib Pullback, VCP, Fear Reversion — greyed portraits in a collapsed "BENCHED — ON TRIAL" row, each with rolling 30/90-day paper stats. Tap → their historical/paper performance. Copy: *"Fighting for a roster spot."* (EMA Pullback was promoted to the active roster at build — rev 3.2.)

Bench hero assignments (locked at build, 2026-06-12 — they had to have faces): EMA Pullback = **Juggernaut** (Omnislash on the dip — *promoted, full color*), Breakout = **Sven** (God's Strength through the ceiling), VCP = **Templar Assassin** (Refraction coils, Psi Blade strikes), Fib Pullback = **Puck** (phase-shifts to the golden ratio), Fear Reversion = **Bane** (feeds on the map's nightmares). Portraits render desaturated while benched; full color on promotion.

Portrait art per hero (SVG sigil vs runtime Dota portraits vs AI art — §8); lore copy reviewed at demo.

### 3.3 Visual language

| Token | Spec |
|---|---|
| Background | Near-black `#0B0E13` with subtle dark-fantasy texture (CSS noise/gradient) |
| Panels/cards | `#151A23`, 1px beveled borders `#2A3140`; Radiant green `#92A525` / Dire red `#C23C2A` edge-glows for P&L states |
| Gold | `#F4D03F` — all ₹ amounts, coin glyph |
| Text | Parchment-grey `#C8CCD4` body, `#F0EDE2` headings |
| Headings font | **Cinzel** (free, Google Fonts) — ALL-CAPS, letter-spaced |
| Numbers/body font | Keep **Geist Mono / Geist** — price readability is non-negotiable |
| Strength glow | Strong = Divine orange; Moderate = Rare blue |
| Motion | framer-motion (already in deps): card stagger, banner slide-in, gold count-up. Respect `prefers-reduced-motion` |
| Mobile | Mobile-first (bottom nav = Dota HUD bar). Themed PWA icons |

Stocks section flips light → **dark**, scoped via CSS variables / `data-theme="dota"` on the `(stocks)` layout so admin/loans stay untouched.

---

## 4. Page-by-page spec (functional behaviour preserved per page)

### 4.1 `/stocks` — "The War Room" (main screen)

Three-glance layout:

**Section 1 — RETREAT CALLS (only when sells exist)**
- Red Dire-styled banner strip: one row per exit decided tonight — RS rows from **`swing.exit_signals`** (new API route `GET /api/stocks/swing/exit-signals`), ML rows from the resolver's closes (once §2.1 contract lands), MiRana paper closes — matched against Kite holdings / open logged trades.
- Shows: hero chip, symbol, reason copy (*"Your tower has fallen — close below 20 EMA ₹712.40"*), live price, unrealized P&L in gold.
- Action: **GG** → existing `KiteTradeActions` sell flow (unchanged), or "Mark closed" for logged trades.
- *RS retreat calls work day one (own backend, no ML dependency); ML rows light up after the data contract.*

**Section 2 — ON THE MAP (open positions)**
- Cards for held names (Kite holdings + open logged trades; later: ML open positions), sorted: exit-signalled first, then by unrealized P&L.
- Each card: hero portrait corner, live price + LIVE badge, gold P&L count-up, **Tower** (RS: live 20/10 EMA trend stop sourced from the backend; others: stop-loss price), starting gold (`invested_rs` where available), days-held as game time (RS: `DAY 7/20` against the time backstop), **Aegis** badge (RS: ratchet active at ≥ +8%; others: display-only flair).
- Existing actions preserved: Sell, edit, close sheet.

**Section 3 — PICK PHASE (tonight's signals)**
- Header: *"PICK PHASE — scouted at 6:00 PM IST"* + scan date + refresh (unchanged).
- Filter chips = hero portraits: All / 8 active heroes / Manish + collapsed **BENCHED** row (legacy strategies, still filterable — their paper signals keep flowing from `main_sanjay.py`). URL params (`strategy`, `status`, `fresh`) unchanged; new ML strategy keys added to the same scheme.
- Signal card = **hero pick card**: portrait, Divine/Rare border by conviction rank (§2.3 — Divine picks sorted first, header reads *"5 scouted · 2 recommended"*), entry zone, Tower (stop), target, Vol/RSI pills as "buffs", R:R, live price. ML cards show model score where exposed. `OPEN_PENDING_FILL` state = *"waiting to spawn"* badge. RS cards drop the Target cell for **"Tower: 20 EMA ₹___"** (no fixed target under the new exit engine) and grey out as *"Already on the map"* when the one-position cap blocks re-entry.
- Actions unchanged: **PICK** (Kite buy w/ GTT), **Scout** (log buy), info drawer (lore line + real rules below).
- Open/Closed toggle unchanged; closed cards use exit-reason copy from §3.1.
- First Kite buy of the day → **FIRST BLOOD** order toast (5-second cancel window unchanged).

### 4.2 `/stocks/performance` — "Demo Mode" (simulated / paper)

- Framed as a **bot match / demo mode** banner — paper ≠ real money stays obvious.
- KPI cards as scoreboard: NET WORTH (total P&L), W-L + win% (KDA), ROSHAN (best trade), AVG GOLD/GAME. Streak flair (*Killing Spree…GODLIKE*) computed client-side, display-only.
- Cumulative P&L chart = **gold-advantage graph** (green above zero, red below). Per-trade bars and outcome charts re-themed (Recharts, colors only).
- Tabs: active heroes first, then a **BENCH TRIAL** group — this is the bench's trial scoreboard (rolling 30/90-day paper stats per benched strategy, the data behind the promote/demote decision in §2.2). Manish split into its own card.
- Trade table = **match history**; pagination/sorting/live-price behaviour unchanged.

### 4.3 `/stocks/portfolio` — "Ranked" (real money)

- Overview = **ranked profile**: net-worth header, gold-advantage cumulative chart, monthly/yearly = "seasons". Analytics unchanged.
- Logged Trades / Holdings / Positions = **Inventory**: item-slot rows with gold values. Edit/close sheets functionally unchanged.
- Banner: *"Ranked — this is real gold."*

### 4.4 `/stocks/settings` — "Options"

- Dota options-menu styling: ACCOUNT / BROKER / GOLD PER PICK (default trade amount) / ANNOUNCER (push) / PARTY (users, admin only). Functionality unchanged.

### 4.5 `/auth/stocks-login` — loading screen

- Full-bleed dark loading-screen treatment. Same better-auth username flow.

### 4.6 Cross-cutting

- **App shell:** bottom nav as HUD bar — WAR ROOM / DEMO / RANKED + options gear. Desktop sidebar same items.
- **Kite status banner:** *"Disconnected from the game coordinator — reconnect"*.
- **Push copy** (mcube web-push; ntfy stays as-is): 6 PM = *"Your match is ready: N picks, M retreat calls"*; sell = *"RETREAT: SELL {symbol} — {reason}"*.
- **Loading skeleton:** dark shimmer.

---

## 5. Functional invariants (acceptance checklist)

Identical before/after:

- [ ] Signal fetch/merge (`/api/stocks/signals/all`), URL filters `strategy`/`status`/`fresh`
- [ ] Live prices via `/api/stocks/current-price` + LIVE badge cadence
- [ ] Kite: status, holdings, positions, buy/sell, qty calc, GTT validation, 5-sec cancel toast, OAuth
- [ ] Trade logging: create/edit/close/delete, `signalRef` linkage
- [ ] Performance analytics, pagination, 60-day window
- [ ] Portfolio analytics, tracking start 2026-06-01, all tabs
- [ ] Settings, push subscribe/unsubscribe, user management
- [ ] Auth gate, 1-year session, login redirect
- [ ] Push read-tracking, notification bell, PWA install

New behaviour (additions only):
- [ ] RS exit layer: `/api/stocks/swing/exit-signals` route, RETREAT banner + GG action, Tower trend-stop stat, Aegis ratchet badge, "Already on the map" no-re-entry state *(gated on the RS exit backend — §2.1 step 3)*
- [x] ML hero signals + history rendered (War Room picks via `/api/stocks/ml/signals`; Demo Mode stats/history via the performance API — §2.1 contract found live in Neon)
- [ ] `invested_rs` mapped and displayed for MiRana (and ML heroes once exposed)
- [ ] Divine-first sorting + "5 scouted · 2 recommended" header in the Pick Phase (reads `signal_strength`, §2.3)
- [ ] BENCHED roster row + bench trial scoreboard (reads existing `swing.*` tables — no backend change needed)
- [ ] Streak/flair copy (pure display)

---

## 6. Demo plan (gate before build)

**Deliverable:** static, self-contained mockup with hardcoded sample data — no app code touched.

- Standalone HTML under `docs/plans/stocks/mockups/`, mobile + desktop widths.
- Screens: War Room (one RS `trend_break` RETREAT call, one Aegis RS position with its Tower price, Divine + Rare picks across several heroes, BENCHED row), Demo-mode scoreboard with gold-advantage graph + bench trial stats, one Ranked/inventory view.
- Sample data mirrors real shapes (real-looking NSE tickers/prices) and uses the real hero names.
- Review → tweaks → approval → build.

## 7. Build phases (after demo approval)

0a. **RS backend** — implement `trading/docs/PRD-rs-ema-exit-signals.md` for RS: exit engine in `performance.py`, `swing.exit_signals` table, one-position cap, RS step in `main.py`, Nifty data feed, conviction ranking → `signal_strength` (§2.3). Backtest RS once Nifty data exists (redesign §3.5). *Trading repo; self-contained, testable offline.*
0b. **ML data contract discovery** — ✅ done (2026-06-12): `daily_suggestor` schema found live in Neon and wired end-to-end (§2.1). Bench paper cron (§2.2) still open.
1. **Theme foundation** — stocks-scoped dark tokens, Cinzel, hero metadata (extend `SOURCE_META` with ML keys, RS, bench flags), themed shell/nav/skeleton/login.
2. **War Room** — three-section `/stocks`, hero pick cards, hero filters, BENCHED row, FIRST BLOOD toast. *(Works with RS entries + MiRana + bench + Manish even while Phase 0 is pending.)*
3. **RETREAT layer + ML roster** — RS first: exit-signals API route, RETREAT banner + GG, Tower/Aegis stats, no-re-entry state *(needs 0a)*. Then ML: routes over the ML tables, full-roster cards, pending-fill state *(needs 0b)*.
4. **Demo Mode + Ranked** — scoreboard, gold-advantage charts, match history, bench trial scoreboard, inventory, Options, themed push copy.
5. **Polish (optional)** — motion pass, themed PWA icons, audio toggle (off by default).

---

## 8. Assets & legal note

Personal-use app, but the repo stays clean: no ripped Valve art committed. With real Dota heroes now mapped (§3.2), the options are:
1. **Runtime Dota portraits** — load official hero images from Steam's public CDN (e.g. `cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<hero>.png`) by URL at runtime; nothing committed to the repo. Simplest and most authentic for a personal app.
2. **CSS/SVG-first fallback** — custom sigils per hero in each hero's color identity; color, type, bevels, copy still carry the Dota feel offline.
3. Free fantasy icon/texture packs (game-icons.net, CC-BY) for coins, aegis, tower glyphs either way.

Default plan: option 1 for portraits + option 3 for glyphs; mockup will show it so you can judge at demo.

## 9. Open questions

1. ~~Where does `daily_suggestor` persist trades?~~ **Resolved (2026-06-12):** Neon schema `daily_suggestor` (`trades`, `daily_runs`) — wired into the frontend. (§2.1)
2. Where should the RS step live: inside `main.py` as step 4 (reusing the refreshed CSVs + a small ^NSEI fetch), or in the bench cron? Recommendation: inside `main.py`, since RS is active roster.
3. Bench paper cron: subset of `main_sanjay.py --save` as a separate cron entry, or a final orchestrator step? (Either works; same DB writes.)
4. FIRST BLOOD / RAMPAGE flair frequency — every qualifying event, or once per day max?
5. Bench review cadence — monthly glance, formal 3-month checkpoint, or both?

**Resolved:** hero mapping locked (§3.2, 2026-06-12) — OD, Windranger, Nature's Prophet, Pudge, Techies, Meepo, Mirana, Spectre, Invoker. Portrait approach defaults to runtime Steam CDN (§8), final judgment at demo.

---

## 10. References

- `docs/reference/stocks-functional-behaviour.md` — current end-to-end behaviour (rev'd for the orchestrator)
- `C:\Projects\trading\scanner\main.py` — production orchestrator, roster + backtest table
- `C:\Projects\trading\docs\PRD-rs-ema-exit-signals.md` — **back in scope for RS**: exit engine, `swing.exit_signals`, one-position cap (EMA portions stay benched)
- `C:\Projects\trading\docs\rs-ema-exit-redesign.md` — rationale + exit rules detail; §3.5 = the Nifty-data backtest gap that caused RS's exclusion
- `docs/plans/stocks/stocks-ui-redesign-prd.md` — prior UI consolidation (implemented)
