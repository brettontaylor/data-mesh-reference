-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Snowflake serving layer for "capital-markets-reference" v0.1.0
-- Attribute-level access control: sensitivity tier + PII + MNPI, per role.
CREATE SCHEMA IF NOT EXISTS GOLD;

-- Roles / clearances
CREATE ROLE IF NOT EXISTS DM_PUBLIC;  -- Public: Anonymous / external. Public reference facts only.
CREATE ROLE IF NOT EXISTS DM_ANALYST;  -- Analyst: Internal analyst. Internal attributes; no PII, no MNPI.
CREATE ROLE IF NOT EXISTS DM_TRADER;  -- Trader: Front office. Sees market-sensitive (MNPI) figures; no PII.
CREATE ROLE IF NOT EXISTS DM_RISK;  -- Risk: Risk management. Counterparty PII + MNPI up to confidential.
CREATE ROLE IF NOT EXISTS DM_COMPLIANCE;  -- Compliance: Oversight. Full visibility, including restricted attributes.

-- Per-attribute masking policies (allowed roles computed from the access model)
CREATE MASKING POLICY IF NOT EXISTS MASK_COUNTERPARTY_COUNTERPARTY_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_COUNTERPARTY_LEGAL_NAME AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/PII

CREATE MASKING POLICY IF NOT EXISTS MASK_COUNTERPARTY_COUNTRY_CODE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_COUNTERPARTY_CREDIT_RATING AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential

CREATE MASKING POLICY IF NOT EXISTS MASK_INSTRUMENT_INSTRUMENT_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_POSITION_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_BOOK_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_INSTRUMENT_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_AS_OF_DATE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_QUANTITY AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/MNPI

CREATE MASKING POLICY IF NOT EXISTS MASK_POSITION_MARKET_VALUE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/MNPI

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_TRADE_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_TRADE_DATE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_INSTRUMENT_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_COUNTERPARTY_ID AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_SIDE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_ANALYST', 'DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- internal

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_QUANTITY AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/MNPI

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_PRICE AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/MNPI

CREATE MASKING POLICY IF NOT EXISTS MASK_TRADE_NOTIONAL AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_TRADER', 'DM_RISK', 'DM_COMPLIANCE') THEN val ELSE '***MASKED***' END;  -- confidential/MNPI

-- Counterparty (one row per legal counterparty)
CREATE OR REPLACE TABLE GOLD.COUNTERPARTY (
    counterparty_id      VARCHAR PRIMARY KEY COMMENT 'internal: Internal surrogate key for the counterparty.',
    lei                  VARCHAR COMMENT 'public: Legal Entity Identifier — public registry id.',
    legal_name           VARCHAR COMMENT 'confidential/PII: Counterparty legal name (relationship-sensitive).',
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
    quantity             NUMBER(18,4) COMMENT 'confidential/MNPI: Net held quantity.',
    market_value         NUMBER(18,2) COMMENT 'confidential/MNPI: Mark-to-market value.',
    currency_code        VARCHAR COMMENT 'public: Valuation currency.'
) COMMENT = 'data-product: position; owner: trading-data';

-- Trade (one row per executed trade)
CREATE OR REPLACE TABLE GOLD.TRADE (
    trade_id             VARCHAR PRIMARY KEY COMMENT 'internal: Unique trade identifier.',
    trade_date           DATE COMMENT 'internal: Execution date.',
    instrument_id        VARCHAR COMMENT 'internal: Traded instrument.',
    counterparty_id      VARCHAR COMMENT 'internal: Trade counterparty.',
    side                 VARCHAR COMMENT 'internal: BUY or SELL.',
    quantity             NUMBER(18,4) COMMENT 'confidential/MNPI: Executed quantity.',
    price                NUMBER(18,6) COMMENT 'confidential/MNPI: Execution price.',
    notional             NUMBER(18,2) COMMENT 'confidential/MNPI: Notional value (quantity * price).',
    currency_code        VARCHAR COMMENT 'public: Settlement currency.'
) COMMENT = 'data-product: trade; owner: trading-data';

-- Apply masking policies
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN counterparty_id SET MASKING POLICY MASK_COUNTERPARTY_COUNTERPARTY_ID;
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN legal_name SET MASKING POLICY MASK_COUNTERPARTY_LEGAL_NAME;
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN country_code SET MASKING POLICY MASK_COUNTERPARTY_COUNTRY_CODE;
ALTER TABLE GOLD.COUNTERPARTY MODIFY COLUMN credit_rating SET MASKING POLICY MASK_COUNTERPARTY_CREDIT_RATING;
ALTER TABLE GOLD.INSTRUMENT MODIFY COLUMN instrument_id SET MASKING POLICY MASK_INSTRUMENT_INSTRUMENT_ID;
ALTER TABLE GOLD.POSITION MODIFY COLUMN position_id SET MASKING POLICY MASK_POSITION_POSITION_ID;
ALTER TABLE GOLD.POSITION MODIFY COLUMN book_id SET MASKING POLICY MASK_POSITION_BOOK_ID;
ALTER TABLE GOLD.POSITION MODIFY COLUMN instrument_id SET MASKING POLICY MASK_POSITION_INSTRUMENT_ID;
ALTER TABLE GOLD.POSITION MODIFY COLUMN as_of_date SET MASKING POLICY MASK_POSITION_AS_OF_DATE;
ALTER TABLE GOLD.POSITION MODIFY COLUMN quantity SET MASKING POLICY MASK_POSITION_QUANTITY;
ALTER TABLE GOLD.POSITION MODIFY COLUMN market_value SET MASKING POLICY MASK_POSITION_MARKET_VALUE;
ALTER TABLE GOLD.TRADE MODIFY COLUMN trade_id SET MASKING POLICY MASK_TRADE_TRADE_ID;
ALTER TABLE GOLD.TRADE MODIFY COLUMN trade_date SET MASKING POLICY MASK_TRADE_TRADE_DATE;
ALTER TABLE GOLD.TRADE MODIFY COLUMN instrument_id SET MASKING POLICY MASK_TRADE_INSTRUMENT_ID;
ALTER TABLE GOLD.TRADE MODIFY COLUMN counterparty_id SET MASKING POLICY MASK_TRADE_COUNTERPARTY_ID;
ALTER TABLE GOLD.TRADE MODIFY COLUMN side SET MASKING POLICY MASK_TRADE_SIDE;
ALTER TABLE GOLD.TRADE MODIFY COLUMN quantity SET MASKING POLICY MASK_TRADE_QUANTITY;
ALTER TABLE GOLD.TRADE MODIFY COLUMN price SET MASKING POLICY MASK_TRADE_PRICE;
ALTER TABLE GOLD.TRADE MODIFY COLUMN notional SET MASKING POLICY MASK_TRADE_NOTIONAL;
