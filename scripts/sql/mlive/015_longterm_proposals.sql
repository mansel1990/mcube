-- Long Game owner approval. Safe to re-run.
-- Does not enable Long Game and does not change strategies_enabled.

ALTER TABLE mlive.mlive_runs DROP CONSTRAINT IF EXISTS mlive_runs_kind_check;
ALTER TABLE mlive.mlive_runs ADD CONSTRAINT mlive_runs_kind_check CHECK (kind IN (
  'preflight', 'sells', 'refresh', 'buys', 'approvals',
  'sync', 'cancel', 'eod', 'eod-final', 'eod-stops', 'import-ideas', 'remind', 'reset-dry',
  'market-backfill', 'market-daily', 'market-check', 'research', 'quotes', 'intraday', 'swing-switch',
  'momentum-eod', 'longterm-proposal'
));

ALTER TABLE mlive.mlive_positions DROP CONSTRAINT IF EXISTS mlive_positions_strategy_check;
ALTER TABLE mlive.mlive_positions
  ADD CONSTRAINT mlive_positions_strategy_check
  CHECK (strategy IS NULL OR strategy IN ('rs', 'ema', 'momentum', 'longterm'));

CREATE TABLE IF NOT EXISTS mlive.mlive_longterm_proposals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  signal_date date NOT NULL,
  proposed_on date NOT NULL,
  expires_on date NOT NULL,
  reason text NOT NULL,
  current_weights jsonb NOT NULL,
  target_weights jsonb NOT NULL,
  trades jsonb NOT NULL,
  costs_inr numeric(14,2) NOT NULL DEFAULT 0,
  tax_inr numeric(14,2) NOT NULL DEFAULT 0,
  events_used integer NOT NULL,
  events_cap integer NOT NULL,
  note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mlive_longterm_one_pending
  ON mlive.mlive_longterm_proposals (status)
  WHERE status = 'pending';

INSERT INTO mlive.mlive_settings (key, value) VALUES
  ('longterm_max_changes_per_year', '12'),
  ('longterm_proposal_expiry_days', '3')
ON CONFLICT (key) DO NOTHING;
