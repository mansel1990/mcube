-- A request the site leaves for the engine. Safe to re-run.
-- The web writes the row. The approvals job does the work and sets done_at.

CREATE TABLE IF NOT EXISTS mlive.mlive_requests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('recheck')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  by_user       text NOT NULL,
  done_at       timestamptz
);

CREATE INDEX IF NOT EXISTS mlive_requests_open_idx
  ON mlive.mlive_requests (kind, requested_at)
  WHERE done_at IS NULL;
