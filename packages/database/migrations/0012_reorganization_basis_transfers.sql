CREATE TABLE corporate_action_basis_transfers (
  id uuid PRIMARY KEY,
  financial_event_id uuid NOT NULL REFERENCES financial_events(id),
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  source_position_account_id uuid NOT NULL REFERENCES position_accounts(id),
  source_security_id uuid NOT NULL REFERENCES securities(id),
  target_position_account_id uuid,
  target_security_id uuid,
  amount numeric(24, 8) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency IN ('CAD', 'USD')),
  allocation_method text NOT NULL,
  ruleset_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  CHECK ((target_position_account_id IS NULL) = (target_security_id IS NULL)),
  FOREIGN KEY (target_position_account_id) REFERENCES position_accounts(id),
  FOREIGN KEY (target_security_id) REFERENCES securities(id)
);

CREATE INDEX corporate_action_basis_transfers_source_idx
  ON corporate_action_basis_transfers(environment_id, source_position_account_id, source_security_id);

CREATE TRIGGER corporate_action_basis_transfers_append_only
BEFORE UPDATE OR DELETE ON corporate_action_basis_transfers
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
