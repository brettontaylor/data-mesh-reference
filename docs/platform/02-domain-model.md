# 02 — Metadata Domain Model

This is the heart of the platform: what a "model" is, how it's stored in Git (the
system of record), and how it's projected into Postgres (the query layer).

## 1. Model classes

| Class | Purpose | Versioned | Owner |
|-------|---------|-----------|-------|
| **Source** | Registration of an upstream feed (system, cadence, connection ref) | yes | platform / domain |
| **BDM** | Business Data Model — entity, attributes (classified), relationships, metrics/dimensions, upstream | yes (independently) | domain |
| **PDM** | Physical Data Model — physical binding for a BDM (table, load strategy, partitioning, key) | yes (independently) | platform-eng |
| **Semantic model** | Consumption model — dimensions + measures over the curated layer | yes (independently) | analytics / domain |
| **Glossary term** | Business term/definition, linked to fields | yes | governance |
| **Access policy** | Roles, clearances, classification → visibility rules | yes | governance |
| **Data-quality contract** | Expectations/SLA on a model (freshness, nullability, ranges, referential) | yes | domain |
| **Data product** | Published, consumable bundle composed of the above | derived + pinned versions | domain |

All classes share a **model envelope** (common metadata): `id`, `kind`, `version`
(semver), `status` (draft/active/deprecated/retired), `owner`, `domain`,
`description`, `tags`, `links` (glossary, related models), `createdBy/at`,
`lastChange`. This envelope is what governance, audit, registry, and lineage key
off.

## 2. Source of record: Git layout

A dedicated **models repo** (separate from the platform code repo) holds all
definitions. Layout is domain-first so ownership maps to paths + CODEOWNERS:

```
models-repo/
├── dct.yaml                 # repo-level config: standard version, environments, settings
├── CODEOWNERS                        # domain path → steward groups (drives reviewer assignment)
├── domains/
│   ├── trading/
│   │   ├── domain.yaml               # domain metadata: owner group, description, SLAs
│   │   ├── bdm/
│   │   │   ├── trade.yaml
│   │   │   └── position.yaml
│   │   ├── pdm/
│   │   │   ├── trade_physical.yaml
│   │   │   └── position_physical.yaml
│   │   ├── semantic/
│   │   │   └── trading_activity.yaml
│   │   ├── dq/
│   │   │   └── trade.dq.yaml          # data-quality contract for trade
│   │   └── products/
│   │       └── trading_activity.product.yaml
│   └── reference/
│       ├── domain.yaml
│       ├── bdm/ { currency, instrument, counterparty }.yaml
│       ├── pdm/ ...
│       └── semantic/ reference_master.yaml
├── sources/                          # upstream feed registrations (cross-domain)
│   ├── trades_feed.yaml
│   └── reference_feed.yaml
├── policy/
│   └── access.yaml                   # org access model (roles, clearances)
├── glossary/
│   └── *.yaml                        # business terms
└── registry.lock.json                # the registered version baseline (governance lock)
```

Notes:
- **Definitions are YAML**, identical in spirit to today's engine contracts (so the
  engine reads them unchanged). The platform adds the envelope fields.
- **`registry.lock.json`** is committed; it is the semver governance baseline (see
  [03](03-governance-workflows.md#semver-enforcement)).
- The platform repo and the models repo are decoupled: upgrade the platform without
  touching models, and vice versa. Multiple models repos are supported (e.g., one
  per region) via config.

## 3. Postgres projection schema

The reconciler materializes Git into these tables. **Every row carries
`source_sha`** (the Git commit it was built from) and is rebuildable. Simplified
DDL (full migrations in `db/migrations/`):

```sql
-- Domains -------------------------------------------------------------------
CREATE TABLE domain (
  id            text PRIMARY KEY,           -- 'trading'
  name          text NOT NULL,
  owner_group   text NOT NULL,              -- IdP group / steward group
  description   text,
  slas          jsonb,
  source_sha    text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Models (one row per model, all classes) -----------------------------------
CREATE TABLE model (
  id            text NOT NULL,              -- 'trade'
  kind          text NOT NULL,             -- bdm|pdm|semantic|source|glossary|policy|dq|product
  domain_id     text REFERENCES domain(id),
  version       text NOT NULL,             -- semver
  status        text NOT NULL,             -- draft|active|deprecated|retired
  owner         text,
  description   text,
  upstream      text,                       -- for BDMs
  spec          jsonb NOT NULL,             -- the full parsed definition
  signature     text NOT NULL,             -- control-surface hash
  tags          text[] DEFAULT '{}',
  source_path   text NOT NULL,             -- git path
  source_sha    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
CREATE INDEX ON model (domain_id);
CREATE INDEX ON model USING gin (spec);
CREATE INDEX ON model USING gin (to_tsvector('english', coalesce(description,'') || ' ' || id));

-- Fields (flattened from BDM specs for query/lineage/classification) ---------
CREATE TABLE model_field (
  model_kind     text NOT NULL,
  model_id       text NOT NULL,
  name           text NOT NULL,
  type           text NOT NULL,
  classification text NOT NULL,            -- public|internal|confidential|restricted
  pii            boolean NOT NULL DEFAULT false,
  mnpi           boolean NOT NULL DEFAULT false,
  is_pk          boolean NOT NULL DEFAULT false,
  fk_ref         text,                      -- 'instrument.instrument_id'
  ordinal        int NOT NULL,
  PRIMARY KEY (model_kind, model_id, name),
  FOREIGN KEY (model_kind, model_id) REFERENCES model(kind, id) ON DELETE CASCADE
);

-- Version history (every registered version, for timeline & rollback) --------
CREATE TABLE model_version (
  model_kind   text NOT NULL,
  model_id     text NOT NULL,
  version      text NOT NULL,
  signature    text NOT NULL,
  status       text NOT NULL,
  change_kind  text,                        -- major|minor|patch
  change_set_id uuid,                        -- the approval that introduced it
  spec         jsonb NOT NULL,
  committed_sha text NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (model_kind, model_id, version)
);

-- Dependency edges (model → model / model → source) --------------------------
CREATE TABLE model_edge (
  from_kind text, from_id text,
  to_kind   text, to_id   text,
  edge_type text NOT NULL,                  -- fk|derives_from|consumes|binds|references
  PRIMARY KEY (from_kind, from_id, to_kind, to_id, edge_type)
);

-- Lineage (column-level, populated from generation + OpenLineage run events) --
CREATE TABLE lineage_node (
  id uuid PRIMARY KEY, urn text UNIQUE NOT NULL,  -- stable URN: layer/table/column
  layer text, table_name text, column_name text, model_ref text
);
CREATE TABLE lineage_edge (
  from_node uuid REFERENCES lineage_node(id),
  to_node   uuid REFERENCES lineage_node(id),
  transform text,                            -- 'select','cast','agg:sum',...
  run_id    text,                            -- which pipeline run produced it
  PRIMARY KEY (from_node, to_node)
);

-- Workflow / approvals -------------------------------------------------------
CREATE TABLE change_set (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  domain_id text,
  author    text NOT NULL,                  -- maker
  status    text NOT NULL,                  -- draft|in_review|approved|merged|rejected|withdrawn
  pr_ref    text,                            -- provider PR id/url
  branch    text,
  required_bump jsonb,                       -- per model: required vs declared
  impact    jsonb,                           -- impact analysis snapshot
  created_at timestamptz NOT NULL DEFAULT now(),
  merged_sha text
);
CREATE TABLE approval (
  id uuid PRIMARY KEY,
  change_set_id uuid REFERENCES change_set(id),
  approver text NOT NULL,
  decision text NOT NULL,                    -- approve|reject|request_changes
  comment  text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- Pipeline runs --------------------------------------------------------------
CREATE TABLE pipeline (
  id text PRIMARY KEY, domain_id text, spec jsonb, target_env text,
  engine text, external_ref text, source_sha text, updated_at timestamptz
);
CREATE TABLE pipeline_run (
  id uuid PRIMARY KEY, pipeline_id text REFERENCES pipeline(id),
  status text, started_at timestamptz, finished_at timestamptz,
  rows_in bigint, rows_out bigint, metrics jsonb, external_run_id text
);

-- Audit (append-only, hash-chained) — see 03 & 06 ---------------------------
CREATE TABLE audit_event (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  actor        text NOT NULL,
  actor_roles  text[] ,
  action       text NOT NULL,               -- model.propose, change.approve, pipeline.deploy...
  subject      text NOT NULL,               -- urn of affected object
  payload      jsonb,                        -- before/after refs, shas, decision
  prev_hash    text,                         -- hash of previous row
  hash         text NOT NULL                 -- sha256(prev_hash || canonical(row))
);
```

Plus **Row-Level Security** on `model`, `model_field`, and read views so the API
enforces domain + classification scoping at the database layer as defense in depth
(see [06](06-security-compliance.md)).

## 4. The model envelope (YAML)

Example BDM with the platform envelope (superset of today's engine fields):

```yaml
# domains/trading/bdm/trade.yaml
kind: bdm
id: trade
domain: trading
version: 2.0.0
status: active
owner: trading-data
upstream: Order Management System
description: One row per executed trade.
tags: [transaction, front-office]
links:
  glossary: [trade, notional, counterparty]
label: Trade
group: transaction
grain: one row per executed trade
source: trades_feed
fields:
  - { name: trade_id, type: string, classification: internal, pk: true }
  - { name: price, type: decimal(18,6), classification: confidential, mnpi: true }
  - { name: trader_id, type: string, classification: restricted, pii: true }
  # ...
metrics:
  - { name: notional_sum, agg: sum, field: notional }
dimensions: [trade_date, instrument_id, counterparty_id, side]
```

The engine already understands `fields/metrics/dimensions/classification/pii/mnpi`;
the platform adds `kind/id/domain/version/status/owner/tags/links` (the envelope).

## 5. Versioning (semantic, per model)

Each model is versioned independently (already implemented in the engine):

- **Control surface** = the structural fingerprint that matters for compatibility
  (fields, types, classification, PII/MNPI, keys, FKs for BDM; physical binding for
  PDM; dimensions/measures/sources for semantic).
- **Severity classification:** breaking → **major**, additive → **minor**, cosmetic
  → **patch**.
- **Lock baseline:** `registry.lock.json` records the registered version + surface
  per model. Governance compares the proposed surface to the lock and **requires an
  adequate bump** (build/PR fails otherwise). See [03](03-governance-workflows.md).
- **Deprecation lifecycle:** `active → deprecated (with sunset date) → retired`.
  Retiring a model that still has consumers is blocked (impact analysis).

## 6. Data products (composition)

A **data product** pins specific model versions and presents a consumable bundle:

```yaml
kind: product
id: trading_activity
domain: trading
version: 1.0.0
status: active
owner: trading-data
description: Governed trading activity & exposure for analytics consumers.
exposes:
  semantic: trading_activity@^0.2.0
  entities:
    - trade@^2.0.0
    - position@^1.0.0
sla:
  freshness: "by 07:00 ET daily"
  availability: 99.5
access: { default_role: analyst }     # references policy/access.yaml
endpoints:
  rest: /api/v1/products/trading_activity
  semantic: cube:trading_activity
```

Products are the unit consumers subscribe to; subscriptions drive impact analysis
(changing a pinned model warns subscribers) and consumption metrics.

## 7. Identity of records (URNs)

Every object has a stable URN for lineage, audit, and cross-references:

```
dct:model:bdm:trading.trade@2.0.0
dct:field:trading.trade.price
dct:product:trading.trading_activity@1.0.0
dct:lineage:gold.GOLD_TRADE.notional
dct:run:pipeline:trade@2026-06-20T07:00Z
```

URNs are environment-qualified where relevant (`...:prod:...`) so the same logical
model is traceable across dev/staging/prod.
