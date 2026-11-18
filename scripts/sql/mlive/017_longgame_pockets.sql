-- Long Game pockets. Additive. Does not enable longterm and does not rewrite swing rows.

INSERT INTO mlive.mlive_settings (key, value) VALUES
  ('longterm_secondary', '"mid"'),
  ('longterm_core_enabled', 'false'),
  ('longterm_radar_enabled', 'false'),
  ('longterm_min_add', '10000'),
  ('longterm_max_add', '100000')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pocket text NOT NULL CHECK (pocket IN ('core', 'radar')),
  kind text NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'opening_holding', 'income_units', 'sale_proceeds', 'charges', 'tax')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  units numeric(14,4) NOT NULL DEFAULT 0,
  symbol text,
  price numeric(14,4),
  ref text,
  idempotency_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mlive_longgame_ledger_idem
  ON mlive.mlive_longgame_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_holdings (
  pocket text NOT NULL CHECK (pocket IN ('core', 'radar')),
  symbol text NOT NULL,
  units numeric(14,4) NOT NULL,
  avg_price numeric(14,4) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pocket, symbol)
);

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_lots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pocket text NOT NULL CHECK (pocket IN ('core', 'radar')),
  symbol text NOT NULL,
  qty_open numeric(14,4) NOT NULL,
  qty_original numeric(14,4) NOT NULL,
  price numeric(14,4) NOT NULL,
  acquired_on date NOT NULL,
  suggestion_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_suggestions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pocket text NOT NULL CHECK (pocket IN ('core', 'radar')),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  rules_version text NOT NULL,
  reason text NOT NULL,
  current_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_inr numeric(14,2) NOT NULL DEFAULT 0,
  min_inr numeric(14,2) NOT NULL DEFAULT 0,
  max_inr numeric(14,2) NOT NULL DEFAULT 0,
  selected_inr numeric(14,2),
  charges_inr numeric(14,2) NOT NULL DEFAULT 0,
  tax_inr numeric(14,2) NOT NULL DEFAULT 0,
  expires_on date,
  idempotency_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS mlive_longgame_suggestion_idem
  ON mlive.mlive_longgame_suggestions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mlive_longgame_one_pending_pocket
  ON mlive.mlive_longgame_suggestions (pocket)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_plans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suggestion_id bigint NOT NULL REFERENCES mlive.mlive_longgame_suggestions (id),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  units integer NOT NULL,
  price numeric(14,4),
  amount_inr numeric(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_reconcile (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('increase', 'reduction')),
  status text NOT NULL CHECK (status IN ('needs_you', 'applied', 'flagged', 'untracked')),
  units numeric(14,4) NOT NULL,
  price numeric(14,4),
  price_source text CHECK (price_source IN ('fill', 'close')),
  allocation jsonb,
  idempotency_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mlive_longgame_reconcile_idem
  ON mlive.mlive_longgame_reconcile (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE mlive.mlive_longterm_proposals ADD COLUMN IF NOT EXISTS pocket text NOT NULL DEFAULT 'core';
ALTER TABLE mlive.mlive_longterm_proposals DROP CONSTRAINT IF EXISTS mlive_longterm_proposals_pocket_check;
ALTER TABLE mlive.mlive_longterm_proposals
  ADD CONSTRAINT mlive_longterm_proposals_pocket_check CHECK (pocket IN ('core', 'radar'));
DROP INDEX IF EXISTS mlive.mlive_longterm_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS mlive_longterm_one_pending_pocket
  ON mlive.mlive_longterm_proposals (pocket)
  WHERE status = 'pending';

ALTER TABLE mlive.mlive_decisions ADD COLUMN IF NOT EXISTS suggestion_id bigint;
ALTER TABLE mlive.mlive_decisions ADD COLUMN IF NOT EXISTS pocket text;
ALTER TABLE mlive.mlive_orders ADD COLUMN IF NOT EXISTS suggestion_id bigint;
ALTER TABLE mlive.mlive_orders ADD COLUMN IF NOT EXISTS pocket text;
