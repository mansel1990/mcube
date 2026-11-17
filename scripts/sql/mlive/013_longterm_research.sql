-- Long Game research storage. Safe to re-run.
-- This does not touch live positions, orders, settings, or trading books.

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
       AND rel.relname = 'mlive_research_runs'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%book%'
  LOOP
    EXECUTE format('ALTER TABLE mlive.mlive_research_runs DROP CONSTRAINT %I', name);
  END LOOP;
END $$;

ALTER TABLE mlive.mlive_research_runs
  ADD CONSTRAINT mlive_research_runs_book_check
  CHECK (book IN ('swing', 'intraday', 'longterm'));

CREATE TABLE IF NOT EXISTS mlive.mlive_longterm_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES mlive.mlive_research_runs (id) ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('STATIC-NEXT', 'STATIC-MID', 'RADAR-NEXT', 'RADAR-MID')),
  control_variant text,
  metrics jsonb NOT NULL,
  equity jsonb NOT NULL,
  allocations jsonb NOT NULL,
  events jsonb NOT NULL,
  stresses jsonb NOT NULL,
  provenance jsonb NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  fail_reasons text[] NOT NULL DEFAULT '{}',
  UNIQUE (run_id, variant)
);

CREATE INDEX IF NOT EXISTS mlive_longterm_results_run_idx
  ON mlive.mlive_longterm_results (run_id, variant);
