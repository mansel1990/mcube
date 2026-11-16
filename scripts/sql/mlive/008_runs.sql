-- Allow the v2 engine jobs to record a run.

ALTER TABLE mlive.mlive_runs DROP CONSTRAINT IF EXISTS mlive_runs_kind_check;
ALTER TABLE mlive.mlive_runs ADD CONSTRAINT mlive_runs_kind_check CHECK (kind IN (
  'preflight', 'sells', 'refresh', 'buys', 'approvals',
  'sync', 'cancel', 'eod', 'eod-final', 'eod-stops', 'import-ideas', 'remind', 'reset-dry',
  'market-backfill', 'market-daily', 'market-check', 'research', 'quotes', 'intraday', 'swing-switch'
));
