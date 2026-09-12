CREATE TABLE interaction_action_requests (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  player_id uuid NOT NULL REFERENCES players(id),
  action_type text NOT NULL CHECK (action_type IN ('TRADE')),
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('PREVIEW', 'SUBMITTED', 'CANCELLED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  submitted_order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX interaction_action_requests_active_idx
  ON interaction_action_requests(environment_id, player_id, expires_at)
  WHERE status IN ('PREVIEW', 'SUBMITTED');
