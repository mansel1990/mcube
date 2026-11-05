-- Go-live fixes. Safe to re-run.

ALTER TABLE mlive.mlive_state ADD COLUMN IF NOT EXISTS halt_reason text;
ALTER TABLE mlive.mlive_decisions ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false;
ALTER TABLE mlive.mlive_positions ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false;
ALTER TABLE mlive.mlive_fund_ledger ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false;
ALTER TABLE mlive.mlive_gtts ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false;
ALTER TABLE mlive.mlive_orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order';
ALTER TABLE mlive.mlive_orders ALTER COLUMN tag DROP NOT NULL;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'mlive.mlive_runs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%preflight%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE mlive.mlive_runs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE mlive.mlive_runs ADD CONSTRAINT mlive_runs_kind_check CHECK (kind IN (
  'preflight', 'sells', 'refresh', 'buys', 'approvals',
  'sync', 'cancel', 'eod', 'eod-final', 'eod-stops', 'import-ideas', 'remind', 'reset-dry'
));

DELETE FROM mlive.mlive_decisions a
 USING mlive.mlive_decisions b
 WHERE a.idea_id IS NOT NULL
   AND a.idea_id = b.idea_id
   AND a.trade_date = b.trade_date
   AND a.side = b.side
   AND a.id <> b.id
   AND a.outcome IN ('proposed', 'skipped')
   AND (b.outcome IN ('approved', 'sent') OR b.id > a.id);

DELETE FROM mlive.mlive_decisions a
 USING mlive.mlive_decisions b
 WHERE a.position_id IS NOT NULL
   AND a.position_id = b.position_id
   AND a.trade_date = b.trade_date
   AND a.side = b.side
   AND a.id <> b.id
   AND a.outcome IN ('proposed', 'skipped')
   AND (b.outcome IN ('approved', 'sent') OR b.id > a.id);

CREATE UNIQUE INDEX IF NOT EXISTS mlive_decisions_buy_idea_day
  ON mlive.mlive_decisions (trade_date, side, idea_id) WHERE idea_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mlive_decisions_sell_position_day
  ON mlive.mlive_decisions (trade_date, side, position_id) WHERE position_id IS NOT NULL;
