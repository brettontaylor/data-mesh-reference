-- AUTO-GENERATED from contracts/bdm/counterparty.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "Counterparty" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS gold;

-- Counterparty (one row per legal counterparty)
-- restricted columns excluded from serving: internal_risk_score
CREATE TABLE IF NOT EXISTS gold.counterparty (
    counterparty_id      text PRIMARY KEY,
    lei                  text NOT NULL,
    legal_name           text,
    country_code         text,
    credit_rating        text,
    CONSTRAINT counterparty_business_key UNIQUE (lei)
);
COMMENT ON TABLE gold.counterparty IS 'data-product: counterparty; owner: reference-data';
COMMENT ON COLUMN gold.counterparty.counterparty_id IS 'internal: Internal surrogate key for the counterparty.';
COMMENT ON COLUMN gold.counterparty.lei IS 'public: Legal Entity Identifier — public registry id.';
COMMENT ON COLUMN gold.counterparty.legal_name IS 'confidential/PII: Counterparty legal name (relationship-sensitive). Serve via masked view; unmasked only for roles: risk, compliance.';
COMMENT ON COLUMN gold.counterparty.country_code IS 'internal: ISO 3166 country of domicile.';
COMMENT ON COLUMN gold.counterparty.credit_rating IS 'confidential: External credit rating bucket.';
