-- Symbol-level Kite holding marks for Long Game valuation.
-- Additive and idempotent. Safe to apply before the application that reads the table is deployed.
-- observed_at is when Mansel Live read the Kite holding. It is not an exchange trade timestamp.

CREATE TABLE IF NOT EXISTS mlive.mlive_longgame_marks (
  symbol text PRIMARY KEY,
  price numeric(14,4) NOT NULL CHECK (price > 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'kite_holding'
);
