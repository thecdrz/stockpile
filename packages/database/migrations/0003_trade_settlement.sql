CREATE TABLE trade_executions (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  financial_event_id uuid NOT NULL UNIQUE REFERENCES financial_events(id),
  security_id uuid NOT NULL REFERENCES securities(id),
  executed_quantity numeric(28, 12) NOT NULL CHECK (executed_quantity > 0),
  execution_price numeric(24, 10) NOT NULL CHECK (execution_price > 0),
  listing_currency text NOT NULL CHECK (listing_currency IN ('CAD', 'USD')),
  base_notional numeric(24, 8) NOT NULL CHECK (base_notional >= 10),
  base_currency text NOT NULL CHECK (base_currency IN ('CAD', 'USD')),
  market_timestamp timestamptz NOT NULL,
  provider_received_at timestamptz NOT NULL,
  settled_at timestamptz NOT NULL,
  market_data_reference text NOT NULL,
  execution_policy_version text NOT NULL
);

CREATE TABLE position_cost_basis (
  position_account_id uuid NOT NULL,
  security_id uuid NOT NULL REFERENCES securities(id),
  currency text NOT NULL CHECK (currency IN ('CAD', 'USD')),
  quantity numeric(28, 12) NOT NULL CHECK (quantity >= 0),
  remaining_cost numeric(24, 8) NOT NULL CHECK (remaining_cost >= 0),
  realized_gain_loss numeric(24, 8) NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (position_account_id, security_id),
  FOREIGN KEY (position_account_id) REFERENCES position_accounts(id)
);

CREATE TRIGGER trade_executions_append_only
BEFORE UPDATE OR DELETE ON trade_executions
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
