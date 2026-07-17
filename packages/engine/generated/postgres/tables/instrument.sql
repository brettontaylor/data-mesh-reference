-- AUTO-GENERATED from contracts/bdm/instrument.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "Instrument" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS gold;

-- Instrument (one row per tradable instrument)
CREATE TABLE IF NOT EXISTS gold.instrument (
    instrument_id        text PRIMARY KEY,
    isin                 text NOT NULL,
    cusip                text NOT NULL,
    name                 text,
    asset_class          text,
    currency_code        text,
    CONSTRAINT instrument_business_key UNIQUE (isin, cusip)
);
COMMENT ON TABLE gold.instrument IS 'data-product: instrument; owner: reference-data';
COMMENT ON COLUMN gold.instrument.instrument_id IS 'internal: Internal surrogate key for the instrument.';
COMMENT ON COLUMN gold.instrument.isin IS 'public: ISIN — public market identifier.';
COMMENT ON COLUMN gold.instrument.cusip IS 'public: CUSIP — public market identifier (North America).';
COMMENT ON COLUMN gold.instrument.name IS 'public: Instrument display name.';
COMMENT ON COLUMN gold.instrument.asset_class IS 'public: Asset class (EQUITY, BOND, FUND, FX, ...).';
COMMENT ON COLUMN gold.instrument.currency_code IS 'public: Trading/denomination currency.';
