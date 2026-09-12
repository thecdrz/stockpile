ALTER TABLE securities
  ADD COLUMN mic text,
  ADD COLUMN country_code text CHECK (country_code IS NULL OR country_code IN ('CA', 'US')),
  ADD COLUMN isin text,
  ADD COLUMN figi text,
  ADD COLUMN first_supported_date date,
  ADD COLUMN last_supported_date date,
  ADD COLUMN eligible_for_trading boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE TABLE security_symbol_aliases (
  id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES securities(id),
  symbol text NOT NULL,
  valid_from date,
  valid_through date,
  created_at timestamptz NOT NULL,
  CHECK (valid_from IS NULL OR valid_through IS NULL OR valid_from <= valid_through),
  UNIQUE (security_id, symbol)
);

CREATE TABLE security_provider_identifiers (
  id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES securities(id),
  provider text NOT NULL,
  provider_security_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (provider, provider_security_id),
  UNIQUE (security_id, provider)
);

CREATE INDEX securities_active_search_idx ON securities(symbol, exchange)
  WHERE trading_status = 'ACTIVE' AND eligible_for_trading;
