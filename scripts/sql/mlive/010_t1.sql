-- Yesterday's buy is t1_quantity until it settles. kite_qty stays the settled quantity.
-- Safe to re-run.

ALTER TABLE mlive.mlive_reconciliations
  ADD COLUMN IF NOT EXISTS kite_t1_qty integer NOT NULL DEFAULT 0;
