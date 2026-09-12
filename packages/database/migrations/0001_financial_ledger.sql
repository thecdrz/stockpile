CREATE TABLE environments (
  id uuid PRIMARY KEY,
  discord_guild_id text NOT NULL UNIQUE,
  base_currency text NOT NULL CHECK (base_currency IN ('CAD', 'USD')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE', 'SYSTEM')),
  kind text NOT NULL,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, environment_id, scope)
);

CREATE TABLE financial_events (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE', 'SYSTEM')),
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'POSTED', 'FAILED', 'REVERSED')),
  business_effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  posted_at timestamptz,
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  correlation_id uuid NOT NULL,
  economy_ruleset_version text NOT NULL,
  market_data_reference text,
  initiating_discord_user_id text,
  reverses_event_id uuid REFERENCES financial_events(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK ((status = 'POSTED' AND posted_at IS NOT NULL) OR status <> 'POSTED'),
  UNIQUE (environment_id, scope, idempotency_key),
  UNIQUE (id, environment_id, scope)
);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY,
  financial_event_id uuid NOT NULL,
  ledger_account_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE', 'SYSTEM')),
  direction text NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount numeric(24, 8) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('CAD', 'USD')),
  created_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (financial_event_id, environment_id, scope)
    REFERENCES financial_events(id, environment_id, scope),
  FOREIGN KEY (ledger_account_id, environment_id, scope)
    REFERENCES ledger_accounts(id, environment_id, scope)
);

CREATE INDEX journal_entries_event_idx ON journal_entries(financial_event_id);
CREATE INDEX journal_entries_account_idx ON journal_entries(ledger_account_id, currency, created_at);
CREATE INDEX financial_events_effective_idx
  ON financial_events(environment_id, scope, business_effective_at);

CREATE UNIQUE INDEX ledger_accounts_player_kind_idx
  ON ledger_accounts(environment_id, scope, owner_id, kind)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX ledger_accounts_system_kind_idx
  ON ledger_accounts(environment_id, scope, kind)
  WHERE owner_id IS NULL;

CREATE TABLE security_quantity_entries (
  id uuid PRIMARY KEY,
  financial_event_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  position_account_id uuid NOT NULL,
  security_id uuid NOT NULL,
  quantity_delta numeric(28, 12) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_amount numeric(24, 8),
  unit_cost_currency text CHECK (unit_cost_currency IN ('CAD', 'USD')),
  effective_at timestamptz NOT NULL,
  entry_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK ((unit_cost_amount IS NULL) = (unit_cost_currency IS NULL)),
  FOREIGN KEY (financial_event_id, environment_id, scope)
    REFERENCES financial_events(id, environment_id, scope)
);

CREATE INDEX security_quantity_position_idx
  ON security_quantity_entries(environment_id, scope, position_account_id, security_id, effective_at);

CREATE FUNCTION assert_financial_event_balanced(target_event_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM journal_entries
    WHERE financial_event_id = target_event_id
    GROUP BY currency
    HAVING sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END) <> 0
  ) THEN
    RAISE EXCEPTION 'financial event % is unbalanced', target_event_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION check_financial_event_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_financial_event_balanced(COALESCE(NEW.financial_event_id, OLD.financial_event_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER journal_entries_balance_guard
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_financial_event_balance();

CREATE FUNCTION reject_posted_financial_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'posted financial history is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER financial_events_append_only
BEFORE UPDATE OR DELETE ON financial_events
FOR EACH ROW WHEN (OLD.status = 'POSTED')
EXECUTE FUNCTION reject_posted_financial_history_mutation();

CREATE TRIGGER journal_entries_append_only
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION reject_posted_financial_history_mutation();

CREATE TRIGGER security_quantity_entries_append_only
BEFORE UPDATE OR DELETE ON security_quantity_entries
FOR EACH ROW
EXECUTE FUNCTION reject_posted_financial_history_mutation();
