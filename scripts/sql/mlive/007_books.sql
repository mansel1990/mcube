-- Two books, quote snapshot, research results, and intraday setting defaults.

ALTER TABLE mlive.mlive_positions ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'swing';
ALTER TABLE mlive.mlive_positions ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'long';
ALTER TABLE mlive.mlive_orders ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'swing';
ALTER TABLE mlive.mlive_decisions ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'swing';
ALTER TABLE mlive.mlive_ideas ADD COLUMN IF NOT EXISTS book text NOT NULL DEFAULT 'swing';

ALTER TABLE mlive.mlive_positions DROP CONSTRAINT IF EXISTS mlive_positions_strategy_check;

CREATE TABLE IF NOT EXISTS mlive.mlive_quotes (
  symbol text PRIMARY KEY,
  price numeric(14, 4) NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mlive.mlive_research (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy text NOT NULL,
  book text NOT NULL,
  sample text NOT NULL,
  profit_factor numeric(8, 3),
  average_net numeric(8, 4),
  trades integer NOT NULL DEFAULT 0,
  win_rate numeric(8, 4),
  worst_drawdown numeric(8, 4),
  longest_losing_run integer,
  half_years_profitable numeric(8, 4),
  passed boolean NOT NULL DEFAULT false,
  note text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO mlive.mlive_settings (key, value) VALUES
  ('intraday_capital_inr', '20000'),
  ('intraday_leverage', '1'),
  ('intraday_risk_pct', '0.01'),
  ('intraday_day_loss_pct', '0.02'),
  ('intraday_max_trades', '4'),
  ('intraday_exit_time', '"15:10"'),
  ('intraday_short', 'true'),
  ('intraday_entry_window', '{"before":"","after":""}'),
  ('intraday_watchlist', '10'),
  ('intraday_freeze_days', '10'),
  ('swing_half_size', 'false'),
  ('pending_limit', '{}')
ON CONFLICT (key) DO NOTHING;
