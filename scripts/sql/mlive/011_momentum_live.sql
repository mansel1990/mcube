-- Frozen M10-6 live cohort. Safe to run more than once.

ALTER TABLE mlive.mlive_ideas
  DROP CONSTRAINT IF EXISTS mlive_ideas_strategy_check;

ALTER TABLE mlive.mlive_ideas
  ADD CONSTRAINT mlive_ideas_strategy_check
  CHECK (strategy IN ('rs', 'ema', 'momentum'));

ALTER TABLE mlive.mlive_positions
  DROP CONSTRAINT IF EXISTS mlive_positions_strategy_check;

ALTER TABLE mlive.mlive_positions
  ADD CONSTRAINT mlive_positions_strategy_check
  CHECK (strategy IN ('rs', 'ema', 'momentum'));

ALTER TABLE mlive.mlive_runs
  DROP CONSTRAINT IF EXISTS mlive_runs_kind_check;

ALTER TABLE mlive.mlive_runs
  ADD CONSTRAINT mlive_runs_kind_check CHECK (kind IN (
    'preflight', 'sells', 'refresh', 'buys', 'approvals',
    'sync', 'cancel', 'eod', 'eod-final', 'eod-stops', 'import-ideas', 'remind', 'reset-dry',
    'market-backfill', 'market-daily', 'market-check', 'research', 'quotes', 'intraday', 'swing-switch',
    'momentum-eod'
  ));

CREATE TABLE IF NOT EXISTS mlive.mlive_momentum_cohorts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signal_date date NOT NULL,
  symbol text NOT NULL,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 8),
  return_90 numeric NOT NULL,
  signal_close numeric(14, 4) NOT NULL,
  sector text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_date, symbol)
);

CREATE INDEX IF NOT EXISTS mlive_momentum_cohorts_active_idx
  ON mlive.mlive_momentum_cohorts (active, signal_date DESC, rank);

CREATE TABLE IF NOT EXISTS mlive.mlive_momentum_runs (
  signal_date date PRIMARY KEY,
  market_up boolean NOT NULL,
  eligible integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
