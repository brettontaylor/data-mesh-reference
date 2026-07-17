-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Lakebase (Postgres) serving layer for "capital-markets-reference" v0.1.0
-- Idempotent: safe to re-apply. Classification is carried in column comments;
-- PII/MNPI columns are exposed through masked views (see column comments).
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
