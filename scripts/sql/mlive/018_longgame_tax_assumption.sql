-- Estimates-only fields for an opening lot. Trading and order logic do not read these columns.
ALTER TABLE mlive.mlive_longgame_lots
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS tax_date_assumption text,
  ADD COLUMN IF NOT EXISTS registered_on date,
  ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;

ALTER TABLE mlive.mlive_longgame_ledger
  ADD COLUMN IF NOT EXISTS tradebook_sha256 text;
