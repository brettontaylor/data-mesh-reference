-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Snowflake serving layer for "capital-markets-reference" v0.1.0
CREATE SCHEMA IF NOT EXISTS GOLD;

-- Roles: progressive sensitivity access.
CREATE ROLE IF NOT EXISTS DM_ANALYST;     -- public + internal
CREATE ROLE IF NOT EXISTS DM_RISK;        -- + confidential
CREATE ROLE IF NOT EXISTS DM_ADMIN;       -- all

-- Masking: confidential values are visible only to DM_RISK / DM_ADMIN.
CREATE MASKING POLICY IF NOT EXISTS MASK_CONFIDENTIAL AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_RISK','DM_ADMIN') THEN val ELSE '***MASKED***' END;

-- Counterparty (one row per legal counterparty)
CREATE OR REPLACE TABLE GOLD.COUNTERPARTY (
    counterparty_id      VARCHAR PRIMARY KEY COMMENT 'internal: Internal surrogate key for the counterparty.',
    lei                  VARCHAR COMMENT 'public: Legal Entity Identifier — public registry id.',
    legal_name           VARCHAR COMMENT 'confidential: Counterparty legal name (relationship-sensitive).',
    country_code         VARCHAR COMMENT 'internal: ISO 3166 country of domicile.',
    credit_rating        VARCHAR COMMENT 'confidential: External credit rating bucket.'
) COMMENT = 'data-product: counterparty; owner: reference-data';

-- Currency (one row per ISO 4217 currency)
CREATE OR REPLACE TABLE GOLD.CURRENCY (
    currency_code        VARCHAR PRIMARY KEY COMMENT 'public: ISO 4217 alphabetic code (e.g. USD, EUR, JPY).',
    name                 VARCHAR COMMENT 'public: Currency display name.',
    minor_units          NUMBER(38,0) COMMENT 'public: Number of decimal places in the minor unit.'
) COMMENT = 'data-product: currency; owner: reference-data';

-- Instrument (one row per tradable instrument)
CREATE OR REPLACE TABLE GOLD.INSTRUMENT (
    instrument_id        VARCHAR PRIMARY KEY COMMENT 'internal: Internal surrogate key for the instrument.',
    isin                 VARCHAR COMMENT 'public: ISIN — public market identifier.',
    cusip                VARCHAR COMMENT 'public: CUSIP — public market identifier (North America).',
    name                 VARCHAR COMMENT 'public: Instrument display name.',
    asset_class          VARCHAR COMMENT 'public: Asset class (EQUITY, BOND, FUND, FX, ...).',
    currency_code        VARCHAR COMMENT 'public: Trading/denomination currency.'
) COMMENT = 'data-product: instrument; owner: reference-data';

-- Position (one row per book / instrument / as-of date)
CREATE OR REPLACE TABLE GOLD.POSITION (
    position_id          VARCHAR PRIMARY KEY COMMENT 'internal: Surrogate key (book_id + instrument_id + as_of_date).',
    book_id              VARCHAR COMMENT 'internal: Trading book / portfolio identifier.',
    instrument_id        VARCHAR COMMENT 'internal: Held instrument.',
    as_of_date           DATE COMMENT 'internal: Position snapshot date.',
    quantity             NUMBER(18,4) COMMENT 'confidential: Net held quantity.',
    market_value         NUMBER(18,2) COMMENT 'confidential: Mark-to-market value.',
    currency_code        VARCHAR COMMENT 'public: Valuation currency.'
) COMMENT = 'data-product: position; owner: trading-data';

-- Trade (one row per executed trade)
CREATE OR REPLACE TABLE GOLD.TRADE (
    trade_id             VARCHAR PRIMARY KEY COMMENT 'internal: Unique trade identifier.',
    trade_date           DATE COMMENT 'internal: Execution date.',
    instrument_id        VARCHAR COMMENT 'internal: Traded instrument.',
    counterparty_id      VARCHAR COMMENT 'internal: Trade counterparty.',
    side                 VARCHAR COMMENT 'internal: BUY or SELL.',
    quantity             NUMBER(18,4) COMMENT 'confidential: Executed quantity.',
    price                NUMBER(18,6) COMMENT 'confidential: Execution price.',
    notional             NUMBER(18,2) COMMENT 'confidential: Notional value (quantity * price).',
    currency_code        VARCHAR COMMENT 'public: Settlement currency.'
) COMMENT = 'data-product: trade; owner: trading-data';

-- Apply masking policies to confidential columns
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN legal_name SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN credit_rating SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.POSITION MODIFY COLUMN quantity SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.POSITION MODIFY COLUMN market_value SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.TRADE MODIFY COLUMN quantity SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.TRADE MODIFY COLUMN price SET MASKING POLICY MASK_CONFIDENTIAL;
ALTER TABLE GOLD.TRADE MODIFY COLUMN notional SET MASKING POLICY MASK_CONFIDENTIAL;
