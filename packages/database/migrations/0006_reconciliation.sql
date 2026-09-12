CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('PASSED', 'FAILED')),
  violation_count integer NOT NULL CHECK (violation_count >= 0),
  summary jsonb NOT NULL
);

CREATE INDEX reconciliation_runs_environment_idx
  ON reconciliation_runs(environment_id, completed_at DESC);

CREATE TABLE operational_alerts (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  alert_type text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  UNIQUE (environment_id, deduplication_key)
);

CREATE INDEX operational_alerts_open_idx
  ON operational_alerts(environment_id, severity, created_at)
  WHERE status = 'OPEN';
