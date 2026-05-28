# Reusable Components

## `components/app-shell.tsx`

The top-level layout shell used by all three sections.

### Props
```typescript
interface AppShellProps {
  section: "admin" | "stocks" | "loans";
  username: string;
  children: React.ReactNode;
}
```

### NAV_CONFIG
Defines tabs per section. Stocks section has 8 entries:
```typescript
stocks: [
  { label: "Manish Logic",   href: "/stocks",                icon: Zap,          exact: true,  color: "blue"    },
  { label: "Breakout",       href: "/stocks/breakout",       icon: TrendingUp,   exact: false, color: "violet"  },
  { label: "EMA Pullback",   href: "/stocks/ema-pullback",   icon: Activity,     exact: false, color: "emerald" },
  { label: "VCP",            href: "/stocks/vcp",            icon: Layers,       exact: false, color: "purple"  },
  { label: "RS Resilience",  href: "/stocks/rs-resilience",  icon: Shield,       exact: false, color: "rose"    },
  { label: "Mean Reversion", href: "/stocks/mean-reversion", icon: RotateCcw,    exact: false, color: "teal"    },
  { label: "Performance",    href: "/stocks/performance",    icon: BarChart3,    exact: false, color: "amber"   },
  { label: "Chart",          href: "/stocks/chart",          icon: BarChart2,    exact: false, color: "slate"   },
]
```

### TAB_COLORS
Maps color name → `{ active: <Tailwind classes>, dot: <Tailwind bg class> }`.  
Supported: blue, violet, emerald, purple, rose, teal, amber, slate.

### Mobile nav (stocks section only)
Renders `<MobileStocksNav>` component (4 tabs: Manish Logic, Strategies, Performance, Chart).  
"Strategies" tab opens `<StrategiesSheet>` — a bottom-sheet with all 5 strategy links.  
State: `strategiesOpen` closes automatically on pathname change.

### STRATEGY_HREFS
Set of hrefs that belong to the "Strategies" group — used for active state on the mobile Strategies tab:
```typescript
const STRATEGY_HREFS = new Set([
  "/stocks/breakout", "/stocks/ema-pullback", "/stocks/vcp",
  "/stocks/rs-resilience", "/stocks/mean-reversion",
]);
```

---

## `components/stocks/swing/signal-card.tsx`

### Props
```typescript
interface SignalCardProps {
  signal: SwingSignal;
  accentColor: "blue" | "violet" | "emerald" | "purple" | "rose" | "teal";
  levelLabel: string;
}
```

### SwingSignal type
```typescript
interface SwingSignal {
  id: number; date: string; symbol: string; company_name: string;
  cmp: number; breakout_level: number;
  entry_min: number; entry_max: number;
  target: number; stop_loss: number;
  volume_ratio: number; rsi: number;
  signal_strength: string;  // "Strong" | "Moderate"
}
```

### Layout
- Header: symbol + strength badge + CMP | levelLabel + breakout_level
- Stats grid (3 cols): Entry | Target (+%) | Stop Loss (-%)
- Footer: Vol pill + RSI pill | R:R ratio
- Volume strength bar: width = `min(vol_ratio / 4 × 100, 100)%`, labeled "Volume strength — Nx avg"

---

## `components/stocks/swing/strategy-info-drawer.tsx`

Right-side slide-in drawer explaining a strategy in plain English.

### Props
```typescript
interface Props {
  strategy: "breakout" | "ema" | "vcp" | "rs" | "mr";
  open: boolean;
  onClose: () => void;
}
```

### Content per strategy (STRATEGY_INFO record)
Each entry has: title, tagline, accentClass, bgClass, market, riskProfile, holdDays, targetPct, filters (array of {label, desc}), exitLogic, tip.

### Behavior
- Closes on Escape key or backdrop click
- Renders as `position: fixed, inset-0, z-[70]` — above everything
- Animates in from the right (`animate-in slide-in-from-right`)
- Max width: `max-w-sm` (phone-friendly)

---

## `app/(stocks)/loading.tsx`

Next.js auto-uses this as the Suspense fallback for all `(stocks)/**` routes.  
Shows a card-grid skeleton with `animate-pulse` placeholders.  
Makes sidebar clicks feel instant — skeleton renders immediately while server fetches data.
