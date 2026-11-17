-- Allow a labelled intraday diagnostic sample. It is not a building pass.
-- Safe to re-run. Does not write settings, orders, or positions.

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
       AND pg_get_constraintdef(con.oid) ILIKE '%sample%'
  LOOP
    EXECUTE format('ALTER TABLE mlive.mlive_research_runs DROP CONSTRAINT %I', name);
  END LOOP;
END $$;

ALTER TABLE mlive.mlive_research_runs
  ADD CONSTRAINT mlive_research_runs_sample_check
  CHECK (sample IN ('building', 'heldback', 'diagnostic'));
