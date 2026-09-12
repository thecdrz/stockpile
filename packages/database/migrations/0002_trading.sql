CREATE TABLE securities (
  id uuid PRIMARY KEY,
  symbol text NOT NULL,
  name text NOT NULL,
  exchange text NOT NULL,
  listing_currency text NOT NULL CHECK (listing_currency IN ('CAD', 'USD')),
  kind text NOT NULL CHECK (kind IN ('STOCK', 'ETF')),
  is_synthetic boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (exchange, symbol)
);

CREATE TABLE position_accounts (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  owner_id text NOT NULL,
  league_period text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((scope = 'LEAGUE') = (league_period IS NOT NULL)),
  UNIQUE (id, environment_id, scope),
  UNIQUE NULLS NOT DISTINCT (environment_id, scope, owner_id, league_period)
);

ALTER TABLE security_quantity_entries
  ADD FOREIGN KEY (position_account_id, environment_id, scope)
  REFERENCES position_accounts(id, environment_id, scope),
  ADD FOREIGN KEY (security_id) REFERENCES securities(id);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  position_account_id uuid NOT NULL,
  player_cash_account_id uuid NOT NULL,
  security_id uuid NOT NULL REFERENCES securities(id),
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT')),
  status text NOT NULL CHECK (status IN (
    'PENDING_VERIFIED_PRICE', 'PENDING_MARKET_OPEN', 'OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED'
  )),
  quantity numeric(28, 12) NOT NULL CHECK (quantity > 0),
  limit_price numeric(24, 10),
  listing_currency text NOT NULL CHECK (listing_currency IN ('CAD', 'USD')),
  time_in_force text NOT NULL CHECK (time_in_force IN ('DAY', 'GOOD_FOR_7_DAYS')),
  accepted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((order_type = 'LIMIT') = (limit_price IS NOT NULL)),
  CHECK (limit_price IS NULL OR limit_price > 0),
  FOREIGN KEY (position_account_id, environment_id, scope)
    REFERENCES position_accounts(id, environment_id, scope),
  FOREIGN KEY (player_cash_account_id, environment_id, scope)
    REFERENCES ledger_accounts(id, environment_id, scope),
  UNIQUE (id, environment_id, scope),
  UNIQUE (environment_id, scope, idempotency_key)
);

CREATE INDEX orders_pending_idx ON orders(environment_id, status, accepted_at)
  WHERE status IN ('PENDING_VERIFIED_PRICE', 'PENDING_MARKET_OPEN', 'OPEN');

CREATE TABLE cash_reservations (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  ledger_account_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  amount numeric(24, 8) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('CAD', 'USD')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CHECK ((status = 'ACTIVE') = (resolved_at IS NULL)),
  FOREIGN KEY (ledger_account_id, environment_id, scope)
    REFERENCES ledger_accounts(id, environment_id, scope),
  FOREIGN KEY (order_id, environment_id, scope)
    REFERENCES orders(id, environment_id, scope)
);

CREATE INDEX cash_reservations_active_idx ON cash_reservations(ledger_account_id, currency)
  WHERE status = 'ACTIVE';

CREATE TABLE share_reservations (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('CAREER', 'LEAGUE')),
  position_account_id uuid NOT NULL,
  security_id uuid NOT NULL REFERENCES securities(id),
  order_id uuid NOT NULL UNIQUE,
  quantity numeric(28, 12) NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CHECK ((status = 'ACTIVE') = (resolved_at IS NULL)),
  FOREIGN KEY (position_account_id, environment_id, scope)
    REFERENCES position_accounts(id, environment_id, scope),
  FOREIGN KEY (order_id, environment_id, scope)
    REFERENCES orders(id, environment_id, scope)
);

CREATE INDEX share_reservations_active_idx ON share_reservations(position_account_id, security_id)
  WHERE status = 'ACTIVE';

CREATE TABLE order_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL,
  effective_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER order_events_append_only
BEFORE UPDATE OR DELETE ON order_events
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_history_mutation();
