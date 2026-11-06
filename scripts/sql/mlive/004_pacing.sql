-- Pacing limits. Safe to re-run. Existing values are left alone.
INSERT INTO mlive.mlive_settings (key, value) VALUES
  ('max_new_buys_per_day', '2'),
  ('max_buys_per_strategy_per_day', '2'),
  ('max_open_per_strategy', '4'),
  ('max_daily_deploy_pct', '0.5')
ON CONFLICT (key) DO NOTHING;
