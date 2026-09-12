ALTER TABLE trade_executions
  ADD COLUMN foreign_notional numeric(24, 8),
  ADD COLUMN fx_rate numeric(24, 12),
  ADD COLUMN fx_market_timestamp timestamptz,
  ADD COLUMN fx_received_at timestamptz,
  ADD COLUMN fx_reference text,
  ADD COLUMN fx_spread_rate numeric(18, 12),
  ADD COLUMN fx_spread_amount numeric(24, 8),
  ADD CONSTRAINT trade_executions_fx_evidence_complete CHECK (
    (listing_currency = base_currency AND foreign_notional IS NULL AND fx_rate IS NULL
      AND fx_market_timestamp IS NULL AND fx_received_at IS NULL AND fx_reference IS NULL
      AND fx_spread_rate IS NULL AND fx_spread_amount IS NULL)
    OR
    (listing_currency <> base_currency AND foreign_notional IS NOT NULL AND fx_rate > 0
      AND fx_market_timestamp IS NOT NULL AND fx_received_at IS NOT NULL AND fx_reference IS NOT NULL
      AND fx_spread_rate >= 0 AND fx_spread_amount >= 0)
  );
