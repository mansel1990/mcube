-- Retire Intraday without deleting its tables, candles, or research rows.
-- Safe to re-run. Does not add longterm to strategies_enabled.

INSERT INTO mlive.mlive_settings (key, value) VALUES
  ('intraday_retired', 'true')
ON CONFLICT (key) DO NOTHING;
