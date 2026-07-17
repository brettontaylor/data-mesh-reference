-- AUTO-GENERATED from contracts/bdm/currency.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "Currency" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS gold;

-- Currency (one row per ISO 4217 currency)
CREATE TABLE IF NOT EXISTS gold.currency (
    currency_code        text PRIMARY KEY,
    name                 text,
    minor_units          integer
);
COMMENT ON TABLE gold.currency IS 'data-product: currency; owner: reference-data';
COMMENT ON COLUMN gold.currency.currency_code IS 'public: ISO 4217 alphabetic code (e.g. USD, EUR, JPY).';
COMMENT ON COLUMN gold.currency.name IS 'public: Currency display name.';
COMMENT ON COLUMN gold.currency.minor_units IS 'public: Number of decimal places in the minor unit.';
