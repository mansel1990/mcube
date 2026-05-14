# Stocks Section

## Pages & Colors

| Page | Path | Color | Icon | Strategy |
|---|---|---|---|---|
| Manish Logic | `/stocks` | blue | Zap | Suggestions (existing feature) |
| Breakout | `/stocks/breakout` | violet | TrendingUp | Consolidation breakout |
| EMA Pullback | `/stocks/ema-pullback` | emerald | Activity | 20 EMA bounce |
| VCP | `/stocks/vcp` | purple | Layers | Minervini contractions |
| RS Resilience | `/stocks/rs-resilience` | rose | Shield | Outperforming weak Nifty |
| Mean Reversion | `/stocks/mean-reversion` | teal | RotateCcw | RSI<30 support bounce |
| Performance | `/stocks/performance` | amber | BarChart3 | Trade history & KPIs |
| Chart | `/stocks/chart` | slate | BarChart2 | OHLCV chart viewer |

## Each Strategy Page Structure
```
page.tsx          — thin server component, just renders the client
<name>-client.tsx — "use client", fetches from API, renders header + SignalCard grid
```

The client component pattern:
```tsx
const [signals, setSignals] = useState<SwingSignal[]>([]);
const [loading, setLoading] = useState(true);
const [infoOpen, setInfoOpen] = useState(false);  // info drawer

// fetch from /api/stocks/swing/<name>
// render:
//   header (icon + title + subtitle + ⓘ info button + refresh button)
//   legend chips (what filters were applied)
//   loading spinner | empty state | grid of <SignalCard>
//   <StrategyInfoDrawer strategy="<key>" open={infoOpen} onClose={...} />
```

## Signal Cards
`<SignalCard signal={s} accentColor="violet" levelLabel="Breakout Level" />`

- `accentColor`: blue | violet | emerald | purple | rose | teal
- `levelLabel`: displayed above `breakout_level` value — changes per strategy (e.g. "Pivot", "Support", "20 EMA Support")
- Shows: symbol, strength badge, CMP, reference level, entry range, target, stop loss, volume ratio, RSI, R:R ratio
- Bottom: "Volume strength" bar (colored by accentColor, width = vol_ratio / 4, max 100%)

## Strategy Info Drawer
Every strategy page has an `ⓘ` icon button (top-right). Tapping it opens a right-side slide-in panel with:
- Strategy tagline
- Quick stats: Market regime / Typical hold / Target %
- Numbered list of all filters with plain-English explanations
- Entry / Exit plan
- Pro tip
- Risk profile badge

Implemented in: `components/stocks/swing/strategy-info-drawer.tsx`  
Strategy key values: `"breakout" | "ema" | "vcp" | "rs" | "mr"`

## Top N Limit
Scanner is limited to **TOP_N = 5** per strategy (sorted by volume_ratio DESC).  
Reason: disciplined trading — too many signals cause confusion and over-trading.

## API routes
All signal routes live under `app/api/stocks/swing/`:
```
GET /api/stocks/swing/breakout          → swing.signals WHERE date = CURRENT_DATE
GET /api/stocks/swing/ema-pullback      → swing.ema_signals
GET /api/stocks/swing/vcp               → swing.vcp_signals
GET /api/stocks/swing/rs-resilience     → swing.rs_signals
GET /api/stocks/swing/mean-reversion    → swing.mean_reversion_signals
GET /api/stocks/swing/performance       → swing.strategy_performance (all rows + aggregated stats)
```
