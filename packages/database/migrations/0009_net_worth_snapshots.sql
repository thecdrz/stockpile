CREATE TABLE net_worth_snapshots (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  player_id uuid NOT NULL REFERENCES players(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  effective_at timestamptz NOT NULL,
  cash_amount numeric(24, 8) NOT NULL,
  security_market_value numeric(24, 8) NOT NULL,
  prestige_liquidation_value numeric(24, 8) NOT NULL DEFAULT 0,
  collectible_loan_receivables numeric(24, 8) NOT NULL DEFAULT 0,
  total_debt numeric(24, 8) NOT NULL DEFAULT 0,
  accrued_interest numeric(24, 8) NOT NULL DEFAULT 0,
  net_worth numeric(24, 8) NOT NULL,
  currency text NOT NULL CHECK (currency IN ('CAD', 'USD')),
  valuation_ruleset_version text NOT NULL,
  source_key text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (environment_id, player_id, scope, source_key)
);

CREATE TABLE net_worth_snapshot_positions (
  snapshot_id uuid NOT NULL REFERENCES net_worth_snapshots(id),
  security_id uuid NOT NULL REFERENCES securities(id),
  quantity numeric(28, 12) NOT NULL CHECK (quantity > 0),
  market_value numeric(24, 8) NOT NULL CHECK (market_value >= 0),
  market_data_reference text NOT NULL,
  fx_reference text,
  PRIMARY KEY (snapshot_id, security_id)
);

CREATE TRIGGER net_worth_snapshots_append_only
BEFORE UPDATE OR DELETE ON net_worth_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();

CREATE TRIGGER net_worth_snapshot_positions_append_only
BEFORE UPDATE OR DELETE ON net_worth_snapshot_positions
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
