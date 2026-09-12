ALTER TABLE corporate_actions DROP CONSTRAINT corporate_actions_action_type_check;
ALTER TABLE corporate_actions ADD CONSTRAINT corporate_actions_action_type_check
  CHECK (action_type IN ('DIVIDEND', 'SPLIT', 'SYMBOL_CHANGE', 'DELISTING', 'MERGER', 'SPINOFF'));

CREATE TABLE security_status_events (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  security_id uuid NOT NULL REFERENCES securities(id),
  source_action_id text NOT NULL REFERENCES corporate_actions(source_action_id),
  prior_symbol text NOT NULL,
  new_symbol text NOT NULL,
  prior_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (environment_id, source_action_id)
);

CREATE TRIGGER security_status_events_append_only
BEFORE UPDATE OR DELETE ON security_status_events
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
