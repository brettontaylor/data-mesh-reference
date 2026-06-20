# 04 — Pipeline Orchestration

Goal: turn governed models into running, monitored medallion pipelines on
Databricks (D5: Workflows + DLT, behind a pluggable adapter), with run tracking and
column-level lineage captured back into the platform.

## 1. The orchestration adapter

A single interface isolates the engine choice. Databricks is the v1 implementation;
Airflow/dbt are future impls; a `local` impl runs the in-process medallion (already
built) for demos and CI.

```ts
export interface Orchestrator {
  readonly id: string;                          // 'databricks' | 'local' | ...
  // Translate a generated pipeline spec into engine-native assets (no side effects).
  plan(spec: PipelineSpec, env: EnvTarget): Promise<DeploymentPlan>;
  // Create/update the pipeline + schedule in the target (idempotent).
  deploy(plan: DeploymentPlan): Promise<DeploymentRef>;
  // Trigger a run now (or validate a scheduled trigger).
  trigger(ref: DeploymentRef, opts?: TriggerOpts): Promise<RunHandle>;
  // Poll/stream status; normalize to a common RunStatus.
  status(run: RunHandle): Promise<RunStatus>;
  // Pull run metrics + lineage events (OpenLineage) after completion.
  collect(run: RunHandle): Promise<{ metrics: RunMetrics; lineage: OpenLineageEvent[] }>;
  // Tear down (for retired pipelines / environment teardown).
  destroy(ref: DeploymentRef): Promise<void>;
}
```

`PipelineSpec` is produced by the **engine** from the models (the registry already
emits Databricks DLT modules + a workflow manifest). The adapter only deals in
generated specs — it never reads YAML directly.

## 2. Databricks implementation (Workflows + DLT)

### 2.1 What gets generated (already in the engine, extended)
- One **DLT pipeline** per domain (or per data product), with bronze→silver→gold
  tables generated from the PDMs/BDMs (the engine's `databricks` generator).
- A **Workflow (job)** that runs the DLT pipeline + any pre/post tasks (e.g., DQ
  expectations, UC tag sync), with the **schedule** derived from source
  `cadenceDays`.
- **DLT expectations** generated from the data-quality contracts (`dq/*.yaml`):
  `@dlt.expect_or_drop`, `expect_or_fail`, ranges, nullability, referential checks.

### 2.2 How it deploys
- The adapter renders assets into a **Databricks Asset Bundle** (DAB) and applies it
  via the Databricks SDK/CLI to the target workspace + environment (dev/staging/
  prod map to bundle targets + UC catalogs).
- **Idempotent:** deploy diffs desired vs existing (by name + content hash) and
  updates in place; unchanged pipelines are skipped.
- **Cluster policy / compute** is config (per environment): job clusters, photon,
  autoscaling bounds, instance pools — all from `dct.yaml`, not hardcoded.

### 2.3 Trigger modes
- **Scheduled** (from cadence) — the Workflow's own cron in Databricks.
- **On-merge** — post-merge job optionally triggers a `staging` run for changed
  models (continuous delivery of data).
- **On-demand** — UI/CLI/API `trigger`.
- **Event/file-arrival** — Databricks file-arrival or external event → trigger.
- **Dependency** — product B's pipeline runs after product A (cross-pipeline DAG via
  the workflow manifest).

## 3. Run tracking

- Every trigger creates a `pipeline_run` row; the worker polls `status()` with
  backoff until terminal, then `collect()`s metrics + lineage.
- Normalized `RunStatus`: `queued | running | success | failed | cancelled |
  timed_out`, with sub-task detail.
- Metrics captured: rows in/out per layer, DQ expectation pass/fail counts,
  duration, cost estimate (DBU), and freshness (max event time vs SLA).
- **Run console** in the UI: timeline, per-task logs (deep-link to Databricks),
  DQ results, and the exact `source_sha`/model versions the run executed.

## 4. Lineage capture (column-level)

Two complementary sources, merged into `lineage_node`/`lineage_edge`:

1. **Static (design-time)** — derived by the engine from the models: bronze←source,
   silver←bronze (with casts/dedup), gold←silver (projection), semantic←gold
   (measures/dimensions). Gives column-level lineage before a single run.
2. **Runtime (observed)** — **OpenLineage** events emitted by Databricks/DLT runs,
   ingested via the catalog-adapter, reconciled against the static graph to confirm
   and enrich (actual columns touched, row counts, run id).

Lineage powers: impact analysis (governance), "what feeds this field" (consumers),
and BCBS-239-style traceability (the future add-on slots straight in here).

## 5. Data-quality contracts

`dq/<model>.dq.yaml` declares expectations; the engine generates DLT expectations
and a DQ report:

```yaml
kind: dq
id: trade
domain: trading
version: 1.0.0
applies_to: trade@^3.0.0
expectations:
  - { name: pk_not_null, rule: "trade_id IS NOT NULL", on_fail: drop }
  - { name: price_positive, rule: "price > 0", on_fail: warn }
  - { name: fk_instrument, rule: "instrument_id IN (SELECT instrument_id FROM gold_instrument)", on_fail: warn }
freshness: { column: trade_date, max_lag: 1d }
volume: { min_rows_per_day: 1 }
```

Results flow back as run metrics; SLA/freshness breaches raise alerts and show on
the data-product page (consumers see health).

## 6. Environments & promotion

| Logical env | Git | UC catalog | Databricks target | Who can deploy |
|-------------|-----|-----------|-------------------|----------------|
| dev | feature branches | `dev_*` | dev workspace/target | modeler |
| staging | `main` (post-merge) | `staging_*` | staging target | platform_eng (auto on merge) |
| prod | release tag / promotion | `prod_*` | prod target | platform_eng + four-eyes |

Promotion = merge/tag + an approved deploy ChangeSet; the same generated assets are
applied to the next target (no per-env hand edits — config differs, code doesn't).

## 7. Failure handling & resilience

- **Deploy failures** are transactional at the bundle level; partial failures roll
  back and surface a clear diagnostic; the model state is unaffected (Git is intact).
- **Run failures** retry per policy (config), then alert; the last good run's outputs
  remain served.
- **Databricks unavailable** degrades only orchestration — modeling, review, catalog,
  and consumption keep working; queued deploys resume when it returns.
- **Poison runs** (repeated failures) are circuit-broken and flagged for owner
  attention rather than retried forever.
- **Idempotent everything**: re-running deploy/trigger/collect is safe.

## 8. Multi-engine future (adapter proven by design)

Because all orchestration goes through `Orchestrator`, adding **Airflow** (render a
DAG, deploy via REST) or **dbt** (generate models + run via dbt Cloud/Core) is a new
package implementing the interface — no changes to governance, catalog, or UI. The
`local` adapter (in-process medallion) guarantees the whole platform is runnable in
CI and demos without any cloud account.
