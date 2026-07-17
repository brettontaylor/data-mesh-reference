# Delta / Unity Catalog → Lakebase Postgres, contract-first

How to migrate a Delta table on Unity Catalog to Lakebase Postgres (Databricks'
managed OLTP Postgres) **without the schema ever being defined twice**: the
contract entity in `packages/engine/contracts/` stays the single source of truth,
and the `postgres` generator emits the Lakebase DDL exactly as the `databricks` and
`snowflake` generators emit theirs.

Audience: a team whose Streamlit/app workload does read-modify-write on Delta
tables (reference-data editors, workflow queues, app state) — the pattern that
motivates this move. Companion guide:
[streamlit-to-appkit.md](./streamlit-to-appkit.md).

All examples are synthetic capital-markets illustrations.

---

## 1. Decision framework: what moves, what stays

Delta and Postgres solve different problems. Migrate a table only if it is
transactional in nature; analytic tables stay on Delta/UC and are read through the
warehouse (analytics plugin) or the generated serving layer.

| Signal | Move to Lakebase (OLTP) | Stay on Delta/UC (analytics) |
|---|---|---|
| Access pattern | Point reads/writes by key, row-level updates, upserts | Large scans, aggregations, window functions |
| Who writes | The application (entry/edit screens, workflow transitions) | Pipelines (medallion bronze→silver→gold) |
| Volume | Thousands–low millions of rows | Millions–billions of rows, partitioned |
| Latency need | Milliseconds, per interaction | Seconds acceptable, per query |
| Consistency need | Transactions, constraints, `UNIQUE` business keys enforced at write time | Eventual/batch; DQ gates enforce quality |
| Concurrency | Many small concurrent writers | Few large batch writers |
| Examples in this repo's domain | App-owned state (`changeset`, `changeset_edit`, `pipeline_run` in `apps/appkit/server/schema.sql`); editable reference data (counterparty attributes pending approval) | `GOLD.TRADE`, `GOLD.POSITION` facts (`packages/engine/contracts/pdm/trade_physical.yaml` — partitioned, incremental load) |

Hybrid is normal and expected: the *editable working copy* of a reference entity
lives in Lakebase; the *published, governed* version continues to flow through the
medallion into Delta gold for analytics. Do not fork the schema to achieve this —
one contract entity, two generated surfaces.

Anti-patterns (do not migrate these):

- A fact table because "the app displays it" — read it via the warehouse instead.
- A table someone wants to `JOIN` against gold facts at scale — Postgres will not
  enjoy that; keep analytics joins on the warehouse.
- Anything solely to avoid warehouse startup latency — use serverless warehouses.

---

## 2. The contract-first flow

Never hand-write Lakebase DDL for a governed entity. The flow is the same
single-source-of-truth pattern as every other surface in this repo:

```
contracts (YAML)  →  pnpm generate  →  generated/postgres/*.sql  →  apply to Lakebase
       │                                        │
       └── pnpm check (propagation gate: generated output must match contracts)
```

Step by step:

1. **Model (or reuse) the contract entity.** The entity's business definition lives
   in `packages/engine/contracts/bdm/<entity>.yaml` — fields with `type`,
   `classification` (public/internal/confidential/restricted), `pii`/`mnpi` flags,
   `pk`, `bk` (business key), `fk`. The physical binding lives in
   `packages/engine/contracts/pdm/<entity>_physical.yaml`. If the Delta table you
   are migrating is not yet under contract, contracting it is the first PR —
   register it in its source's `produces` list
   (`packages/engine/contracts/sources/<source>.yaml`); the registry-consistency
   gate enforces both sides.
2. **Generate.** `pnpm generate` writes `packages/engine/generated/postgres/`
   (produced by `packages/engine/src/generators/postgres.ts`, built by a parallel
   workstream following the snowflake/databricks generator patterns):
   - `schema.sql` — full Lakebase-ready DDL, idempotent
     (`CREATE SCHEMA IF NOT EXISTS`, guarded `CREATE TABLE`), organized per layer/
     contract structure like the other generators.
   - `tables/<entity>.sql` — per-entity DDL, for applying one table at a time.
   - `manifest.json` — machine-readable
     `{entity, table, layer, columns: [{name, pgType, classification, nullable}]}`
     for tooling (validation scripts, masked-view generation, catalog sync).

   The generator — not you — handles type mapping (section 3), turns `bk` fields
   into `UNIQUE` constraints, and emits `COMMENT ON COLUMN` carrying each field's
   classification with masked-view guidance.
3. **Gate.** `pnpm check` includes the propagation gate
   (`packages/engine/src/governance/checks.ts`): stale or hand-edited
   `generated/postgres/` output fails CI. Commit contracts + regenerated output in
   the same PR.
4. **Apply to Lakebase.** With the environment configured (section 7):

   ```bash
   psql "$PGHOST" -d "$PGDATABASE" -f packages/engine/generated/postgres/schema.sql
   # or per entity:
   psql "$PGHOST" -d "$PGDATABASE" -f packages/engine/generated/postgres/tables/counterparty.sql
   ```

   In the deployed app the same DDL can be applied on startup, guarded by a
   table-exists check (the service principal owns the schema — deploy before
   developing locally against it).
5. **Backfill, validate, cut over** — sections 4–6.

Schema evolution after cutover follows the identical loop: change the contract →
regenerate → apply the diff via a migration PR. A change that stops at the contract
is incomplete.

---

## 3. Delta/Spark → Postgres type-mapping reference

What the generator implements (documented in the header of
`packages/engine/generated/postgres/schema.sql`). Use this table when reviewing
generated DDL or contracting a legacy table:

| Delta / Spark type | Postgres type | Notes |
|---|---|---|
| `STRING` | `text` | No length guessing; add `CHECK` constraints via contract rules if needed |
| `BOOLEAN` | `boolean` | |
| `TINYINT` / `SMALLINT` | `smallint` | |
| `INT` | `integer` | |
| `BIGINT` | `bigint` | |
| `FLOAT` | `real` | |
| `DOUBLE` | `double precision` | |
| `DECIMAL(p,s)` | `numeric(p,s)` | Precision preserved exactly (e.g. contract `decimal(18,6)` → `numeric(18,6)`); unqualified `decimal` defaults to `numeric(38,9)` |
| `DATE` | `date` | |
| `TIMESTAMP` | `timestamptz` | Delta `TIMESTAMP` is UTC-normalized; `timestamptz` preserves that semantic |
| `TIMESTAMP_NTZ` | `timestamp` (without time zone) | Only if the source truly stores wall-clock time |
| `BINARY` | `bytea` | |
| `ARRAY<T>` | `jsonb` | Postgres native arrays are possible for scalar `T`, but `jsonb` survives nested evolution; document the element type in the column comment |
| `MAP<K,V>` | `jsonb` | |
| `STRUCT<...>` | `jsonb` | Consider promoting hot struct fields to real columns in the contract instead |
| `INTERVAL` | `interval` | Rare in practice |
| Identity / `GENERATED ALWAYS AS IDENTITY` | `bigint GENERATED ALWAYS AS IDENTITY` | Do **not** carry Delta-generated surrogate values through backfill and then let identity restart — after backfill, `SELECT setval(...)`/`ALTER ... RESTART WITH max+1` |
| Partition columns (`partitionBy`) | Plain column + index | Postgres needs no partitioning at OLTP volumes; add a b-tree index where the partition column was the scan predicate |

Constraint mapping from the contract:

| Contract concept | Postgres DDL |
|---|---|
| `pk: true` | `PRIMARY KEY` |
| `bk: true` (business key, possibly composite) | `UNIQUE` constraint — this is where Postgres starts enforcing what Delta only documented |
| `fk: {entity, field}` | `REFERENCES` (deferred until both tables are migrated; until then, comment-only) |
| Field `description` + `classification` + `pii`/`mnpi` | `COMMENT ON COLUMN` carrying description and classification tag |

---

## 4. Backfill patterns

Pick per table size and freshness requirement. All patterns write to a **staging
schema** first (`stg_migration.<table>`), then swap/insert into the target —
never backfill directly into live tables.

### 4.1 Spark JDBC write (simplest; small–medium tables)

```python
(spark.table("main.gold.counterparty")
  .repartition(8)
  .write.format("jdbc")
  .option("url", f"jdbc:postgresql://{pg_host}:5432/{pg_db}?sslmode=require")
  .option("dbtable", "stg_migration.counterparty")
  .option("user", pg_user)          # from secret scope — never inline
  .option("batchsize", 10_000)
  .mode("append")
  .save())
```

Good to ~10M rows. Watch decimal/timestamp fidelity (section 5 catches drift).

### 4.2 Staged export + `COPY` (fastest bulk path)

Export Delta to CSV in a UC Volume, then `COPY`:

```sql
-- On Databricks: export snapshot at a pinned version
CREATE OR REPLACE TABLE tmp_export.counterparty_v42 AS
  SELECT * FROM main.gold.counterparty VERSION AS OF 42;
```

```bash
# Export to a Volume as CSV, then load:
psql "$PGHOST" -d "$PGDATABASE" -c \
  "\copy stg_migration.counterparty FROM 'counterparty_v42.csv' WITH (FORMAT csv, HEADER true, NULL '')"
```

Pin the Delta **version** (`VERSION AS OF`) so validation compares against an
immutable snapshot. Record the version number in the migration ticket.

### 4.3 Incremental sync via Change Data Feed (the dual-run window)

Between the bulk backfill and cutover, the Delta table keeps changing. Use CDF to
replay changes into Postgres:

```sql
ALTER TABLE main.gold.counterparty
  SET TBLPROPERTIES (delta.enableChangeDataFeed = true);
```

```python
changes = spark.read.format("delta") \
    .option("readChangeFeed", "true") \
    .option("startingVersion", 43) \
    .table("main.gold.counterparty") \
    .filter("_change_type IN ('insert', 'update_postimage', 'delete')")
```

Apply each batch to Postgres as an **idempotent upsert keyed on the business key**
(the `UNIQUE` constraint the generator emitted from `bk` fields):

```sql
INSERT INTO gold.counterparty (counterparty_id, legal_name, country_code, credit_rating)
VALUES ($1, $2, $3, $4)
ON CONFLICT (counterparty_id) DO UPDATE
  SET legal_name = EXCLUDED.legal_name,
      country_code = EXCLUDED.country_code,
      credit_rating = EXCLUDED.credit_rating;
-- deletes: DELETE ... WHERE counterparty_id = $1 (no-op if already gone)
```

Idempotency rules: track the last applied `_commit_version` in a
`stg_migration.sync_watermark` table inside the same Postgres transaction as the
batch; on restart, resume from the watermark. Replaying a batch must be a no-op.

---

## 5. Validation: prove equivalence before anyone trusts it

Run all three levels; store results in the migration ticket.

**Level 1 — row counts** (per table, and per partition/date bucket for skew):

```sql
-- Databricks:
SELECT count(*), count(DISTINCT counterparty_id) FROM main.gold.counterparty VERSION AS OF 42;
-- Postgres:
SELECT count(*), count(DISTINCT counterparty_id) FROM gold.counterparty;
```

**Level 2 — per-column aggregates/checksums.** For each numeric column: `SUM`,
`MIN`, `MAX` (beware float columns — compare with tolerance). For each text/date
column: `count(DISTINCT)`, `MIN`, `MAX`, and a stable hash aggregate, e.g.

```sql
-- Both sides, normalized: sum of per-row hashes is order-independent
SELECT sum(hash(counterparty_id, legal_name, country_code, credit_rating)) FROM ...;  -- Spark
SELECT sum(hashtext(counterparty_id || '|' || legal_name || '|' || country_code || '|' || credit_rating)) FROM ...;  -- PG
```

Hash functions differ across engines — when exactness matters, export both sides'
per-row `md5` of a canonicalized string (fixed column order, ISO timestamps, fixed
decimal formatting, explicit NULL token) and diff the two hash sets. Drive the
column list from `generated/postgres/manifest.json` so the script never drifts
from the contract.

**Level 3 — sampled row diff.** Random-sample 1,000 business keys, fetch full rows
from both sides, field-by-field compare with type-aware normalization. Any diff is
a defect in the type mapping or the backfill — fix and re-run, never patch rows by
hand.

**Shadow reads (dual-run).** For one to two cycles, the application reads Postgres
while a scheduled comparison job re-runs Levels 1–2 against Delta (kept in sync via
CDF). Alert on any divergence. Only after N clean days do you proceed to cutover.

---

## 6. Cutover and rollback

Cutover checklist:

1. Freeze writes to the Delta table (pause the writing job / revoke the write path).
2. Drain the final CDF batch into Postgres; verify watermark = latest commit.
3. Run Levels 1–2 validation one last time; record results.
4. Flip the application to Postgres-primary (config/env change, not a code change).
5. Keep the CDF sync **reversed or paused, not deleted**, for the rollback window.
6. Downgrade the old Delta write path to read-only; schedule its removal.

Rollback plan (pre-agreed, time-boxed, e.g. 5 business days):

- The Delta table is retained untouched at the cutover version — rollback is a
  config flip back to Delta plus replay of any Postgres-side writes made since
  cutover. To make that replay possible, keep an outbox: every app write during the
  window also appends to a `stg_migration.cutover_writes` journal (entity, business
  key, payload, timestamp).
- After the window closes cleanly: drop the journal, decommission the sync,
  archive (do not `DROP` without explicit approval — see guardrails) the staging
  schema.

---

## 7. PII and classification across the move

Classification is contract metadata, so it travels with the entity automatically:

- Every classified field (e.g. `trader_id` — `classification: restricted`,
  `pii: true` in `packages/engine/contracts/bdm/trade.yaml`; `legal_name` —
  `confidential` + `pii` on counterparty) gets a `COMMENT ON COLUMN` in the
  generated DDL carrying its classification, and appears with its
  `classification` in `generated/postgres/manifest.json`.
- Mirror the masked-serving pattern the snowflake generator establishes
  (`packages/engine/generated/snowflake/serving.sql`: per-attribute masking by
  role/clearance): in Postgres, expose **masked views** (or column grants) per
  role and point non-privileged read paths at the views, never base tables.
  The manifest gives tooling everything needed to generate those views.
- For per-user enforcement in the app, combine Lakebase on-behalf-of connections
  (`asUser(req)` — Postgres `current_user` is the human) with Row-Level Security
  policies. Note: `databricks_superuser` bypasses RLS — do not grant it to OBO
  users; use fine-grained grants.
- Backfill paths are part of the control surface: staged CSV exports in Volumes
  contain unmasked data — restrict the Volume, delete exports after load, and
  never route them through laptops.
- The DQ/masking expectations enforced at medallion layer transitions (see
  `.claude/knowledge/medallion-architecture.md`: PII handling at Silver, no
  unmasked PII in Gold) apply unchanged to the Postgres copy.

---

## 8. Lakebase operational specifics

From the AppKit plugin manifest (`appkit.plugins.json`, `lakebase` entry) — what
the platform provides vs what you configure:

**Resource fields** (declared when binding the `postgres` resource to the app;
discover values with the Databricks CLI):

| Field | How to obtain |
|---|---|
| `project` | `databricks postgres list-projects` → `.name` (`projects/{project-id}`) |
| `branch` | `databricks postgres list-branches {project-name}` → `.name` |
| `database` | `databricks postgres list-databases {branch-name}` → `.name` |
| `endpointPath` | `databricks postgres list-endpoints {branch-name}` → `.name`; at runtime injected via `app.yaml`: `env: [{name: LAKEBASE_ENDPOINT, valueFrom: postgres}]` |

**Environment contract:**

| Variable | Deployed (Databricks Apps) | Local dev |
|---|---|---|
| `PGHOST` | Auto-injected by the platform | Set manually (from `list-endpoints`) |
| `PGDATABASE` | Auto-injected | Set manually |
| `PGPORT` | Auto-injected (`5432`) | `5432` |
| `PGSSLMODE` | Auto-injected (`require`) | `require` |
| `PGUSER` / `PGAPPNAME` | Auto-injected | Your Databricks identity via OAuth |
| `LAKEBASE_ENDPOINT` | `valueFrom: postgres` in `app.yaml` | Set manually |

**Permissions:** the app's service principal gets `CAN_CONNECT_AND_CREATE` on the
`postgres` resource — it can connect and create new objects but cannot access
pre-existing schemas it does not own. Deploy first so the SP creates and owns the
schema; grant developers DML for local work afterwards.

**Connectivity check** (first thing to run when anything fails):

```bash
psql "$PGHOST" -c "select 1"
```

**In `apps/appkit`:** `server/db.ts` selects the backend — lakebase plugin pool when
deployed, `DATABASE_URL` `pg` pool or MemoryDb in local mode — so routes are
backend-agnostic. Queries go through `appkit.lakebase.query(text, params)`
(standard `pg.Pool` underneath, OAuth tokens auto-refreshed).

---

## 9. Corporate constraints (non-negotiable)

Per `.claude/knowledge/corporate-guardrails.md`:

- **PR-based delivery only** — contracts, regenerated `generated/postgres/`, and
  migration scripts land together in a reviewed PR. Never push to `main`.
- **No secrets in code.** JDBC credentials come from secret scopes; local settings
  live in `.env` (gitignored). `.env.example` only is committed.
- **PII masking preserved** end-to-end: classifications ride the manifest, masked
  views front the base tables, backfill artifacts are cleaned up.
- **No destructive DDL without approval** — `DROP`/`TRUNCATE` on the old Delta
  table or staging schemas requires explicit sign-off; prefer archival.
- **Contract is the source of truth.** Hand-edited DDL in Lakebase that isn't in
  the contract will be flagged by drift checks and overwritten at next apply.
