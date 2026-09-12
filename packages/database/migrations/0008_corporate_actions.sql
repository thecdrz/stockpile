ALTER TABLE securities
  ADD COLUMN trading_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (trading_status IN ('ACTIVE', 'HALTED', 'CORPORATE_ACTION_REVIEW', 'DELISTED'));

CREATE TABLE corporate_actions (
  source_action_id text PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES securities(id),
  action_type text NOT NULL CHECK (action_type IN ('DIVIDEND', 'SPLIT')),
  effective_date date NOT NULL,
  terms jsonb NOT NULL,
  market_data_reference text NOT NULL,
  detected_at timestamptz NOT NULL
);

CREATE TABLE corporate_action_applications (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  source_action_id text NOT NULL REFERENCES corporate_actions(source_action_id),
  position_account_id uuid NOT NULL REFERENCES position_accounts(id),
  financial_event_id uuid NOT NULL REFERENCES financial_events(id),
  applied_at timestamptz NOT NULL,
  UNIQUE (environment_id, scope, source_action_id, position_account_id)
);

CREATE TRIGGER corporate_action_applications_append_only
BEFORE UPDATE OR DELETE ON corporate_action_applications
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
