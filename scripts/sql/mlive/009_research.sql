-- Research runs, results, and the page's request kind.
-- Safe to re-run. Does not write mlive_settings or touch live orders.
-- The old mlive.mlive_research table stays as it is; new runs do not write it.

ALTER TABLE mlive.mlive_requests ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  name text;
BEGIN
  FOR name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'mlive'
      AND rel.relname = 'mlive_requests'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE mlive.mlive_requests DROP CONSTRAINT %I', name);
  END LOOP;
END $$;

ALTER TABLE mlive.mlive_requests
  ADD CONSTRAINT mlive_requests_kind_check CHECK (kind IN ('recheck', 'research'));

CREATE TABLE IF NOT EXISTS mlive.mlive_research_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book text NOT NULL CHECK (book IN ('swing', 'intraday')),
  sample text NOT NULL CHECK (sample IN ('building', 'heldback')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'ok', 'error')),
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine_sha text,
  error text,
  note text
);

CREATE INDEX IF NOT EXISTS mlive_research_runs_book_idx
  ON mlive.mlive_research_runs (book, id DESC);

CREATE TABLE IF NOT EXISTS mlive.mlive_research_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES mlive.mlive_research_runs (id) ON DELETE CASCADE,
  strategy text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  params_key text NOT NULL DEFAULT 'default',
  is_default boolean NOT NULL DEFAULT false,
  trades integer NOT NULL DEFAULT 0,
  win_rate numeric(8, 4),
  profit_factor numeric(8, 3),
  avg_net_pct numeric(8, 4),
  worst_drawdown_pct numeric(8, 4),
  longest_losing_run integer,
  half_years_profitable_pct numeric(8, 4),
  cagr_pct numeric(8, 4),
  exposure_pct numeric(8, 4),
  monthly jsonb,
  equity jsonb,
  passed boolean NOT NULL DEFAULT false,
  fail_reasons text[] NOT NULL DEFAULT '{}',
  UNIQUE (run_id, strategy, params_key)
);

CREATE INDEX IF NOT EXISTS mlive_research_results_run_idx
  ON mlive.mlive_research_results (run_id, strategy);

CREATE TABLE IF NOT EXISTS mlive.mlive_research_overlap (
  run_id bigint NOT NULL REFERENCES mlive.mlive_research_runs (id) ON DELETE CASCADE,
  a text NOT NULL,
  b text NOT NULL,
  loss_day_overlap numeric(8, 4) NOT NULL,
  PRIMARY KEY (run_id, a, b)
);
