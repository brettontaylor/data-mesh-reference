-- AUTO-GENERATED from contracts/bdm/position.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "Position" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS gold;

-- Position (one row per book / instrument / as-of date)
CREATE TABLE IF NOT EXISTS gold.position (
    position_id          text PRIMARY KEY,
    book_id              text NOT NULL,
    instrument_id        text,
    as_of_date           date NOT NULL,
    quantity             numeric(18,4),
    market_value         numeric(18,2),
    currency_code        text,
    CONSTRAINT position_business_key UNIQUE (book_id, as_of_date)
);
COMMENT ON TABLE gold.position IS 'data-product: position; owner: trading-data';
COMMENT ON COLUMN gold.position.position_id IS 'internal: Surrogate key (book_id + instrument_id + as_of_date).';
COMMENT ON COLUMN gold.position.book_id IS 'internal: Trading book / portfolio identifier (natural-key component).';
COMMENT ON COLUMN gold.position.instrument_id IS 'internal: Held instrument.';
COMMENT ON COLUMN gold.position.as_of_date IS 'internal: Position snapshot date (natural-key component).';
COMMENT ON COLUMN gold.position.quantity IS 'confidential/MNPI: Net held quantity. Serve via masked view; unmasked only for roles: trader, risk, compliance.';
COMMENT ON COLUMN gold.position.market_value IS 'confidential/MNPI: Mark-to-market value. Serve via masked view; unmasked only for roles: trader, risk, compliance.';
COMMENT ON COLUMN gold.position.currency_code IS 'public: Valuation currency.';
