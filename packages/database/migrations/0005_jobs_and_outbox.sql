CREATE TABLE durable_jobs (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  job_type text NOT NULL CHECK (length(btrim(job_type)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('SCHEDULED', 'RUNNING', 'RETRY', 'COMPLETED', 'DEAD')),
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  idempotency_key text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'RUNNING') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  UNIQUE (environment_id, idempotency_key)
);

CREATE INDEX durable_jobs_claim_idx ON durable_jobs(run_at, id)
  WHERE status IN ('SCHEDULED', 'RETRY', 'RUNNING');

CREATE TABLE job_runs (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES durable_jobs(id),
  attempt integer NOT NULL CHECK (attempt > 0),
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('COMPLETED', 'RETRY', 'DEAD')),
  error text,
  CHECK ((finished_at IS NULL) = (outcome IS NULL))
);

CREATE INDEX job_runs_job_idx ON job_runs(job_id, attempt);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  payload jsonb NOT NULL,
  destination text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'RETRY', 'DEAD')),
  available_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  idempotency_key text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz,
  CHECK ((status = 'PROCESSING') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL)),
  UNIQUE (environment_id, destination, idempotency_key)
);

CREATE INDEX outbox_events_claim_idx ON outbox_events(destination, available_at, id)
  WHERE status IN ('PENDING', 'RETRY', 'PROCESSING');

CREATE TRIGGER job_runs_append_only
BEFORE UPDATE OR DELETE ON job_runs
FOR EACH ROW WHEN (OLD.finished_at IS NOT NULL)
EXECUTE FUNCTION reject_posted_financial_history_mutation();
