-- Persist momentum weekly-sell re-price cadence. Safe to run more than once.

ALTER TABLE mlive.mlive_orders
  ADD COLUMN IF NOT EXISTS last_reprice_at timestamptz;
