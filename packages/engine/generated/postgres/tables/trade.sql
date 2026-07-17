-- AUTO-GENERATED from contracts/bdm/trade.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "Trade" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS gold;

-- Trade (one row per executed trade)
-- restricted columns excluded from serving: trader_id
CREATE TABLE IF NOT EXISTS gold.trade (
    trade_id             text PRIMARY KEY,
    source_trade_ref     text NOT NULL,
    trade_date           date,
    instrument_id        text,
    counterparty_id      text,
    side                 text,
    quantity             numeric(18,4),
    price                numeric(18,6),
    notional             numeric(18,2),
    currency_code        text,
    CONSTRAINT trade_business_key UNIQUE (source_trade_ref)
);
COMMENT ON TABLE gold.trade IS 'data-product: trade; owner: trading-data';
COMMENT ON COLUMN gold.trade.trade_id IS 'internal: Unique trade identifier (surrogate key).';
COMMENT ON COLUMN gold.trade.source_trade_ref IS 'internal: Source-system trade reference (natural/business key from the OMS).';
COMMENT ON COLUMN gold.trade.trade_date IS 'internal: Execution date.';
COMMENT ON COLUMN gold.trade.instrument_id IS 'internal: Traded instrument.';
COMMENT ON COLUMN gold.trade.counterparty_id IS 'internal: Trade counterparty.';
COMMENT ON COLUMN gold.trade.side IS 'internal: BUY or SELL.';
COMMENT ON COLUMN gold.trade.quantity IS 'confidential/MNPI: Executed quantity. Serve via masked view; unmasked only for roles: trader, risk, compliance.';
COMMENT ON COLUMN gold.trade.price IS 'confidential/MNPI: Execution price. Serve via masked view; unmasked only for roles: trader, risk, compliance.';
COMMENT ON COLUMN gold.trade.notional IS 'confidential/MNPI: Notional value (quantity * price). Serve via masked view; unmasked only for roles: trader, risk, compliance.';
COMMENT ON COLUMN gold.trade.currency_code IS 'public: Settlement currency.';
