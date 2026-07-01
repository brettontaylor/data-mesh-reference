# Governed Asset Types: Mappings, Data-Quality Rules & Consumer Extracts

**Status:** blueprint + initial implementation (asset-tracking spine).
**Author:** DEAL Control Tower platform.

## 1. Purpose

Beyond BDMs, PDMs and semantic models, three artifacts must be **first-class,
version-controlled, governed assets** — not tribal knowledge in spreadsheets:

| Asset | What it is | Owned by |
|---|---|---|
| **Mapping** | Source→target field transformation (calc logic, SCD, derivations) | Data engineering / ETL |
| **DQ rule set** | Data-quality rules attached to a model (not-null, unique, referential, range, freshness…) | Data governance |
| **Consumer extract** | A published downstream extract/view contract (columns, filters, delivery) | Consuming team / platform |

## 2. Design principle

**Reuse the existing GitOps asset spine — don't invent a parallel system, and don't
embed them inside BDMs.** Each becomes a new *asset kind* travelling the same path every
model already travels:

```
YAML contract → engine (parse + surface hash) → semver + registry.lock →
projection → API / SDK / CLI → ChangeSet governance (maker/checker + CDA sign-off) →
catalog + lineage + events
```

Why standalone (vs. inline on the BDM): in a bank these are owned by **different teams**
on **different cadences** and need **independent ownership, versioning, approval, and
lineage**. Standalone assets give all of that for free; inline blocks do not.

## 3. Requirements

- **FR-AT-01** Each asset is a versioned YAML contract under `contracts/{mappings,dq,extracts}/`.
- **FR-AT-02** Each is semver-governed via a structural **control surface** (breaking vs additive), enforced against `registry.lock.json`.
- **FR-AT-03** Each is editable only through a **ChangeSet** (maker/checker, SoD, and — for enterprise-significant change — Chief Data Architect sign-off).
- **FR-AT-04** Each appears in the **catalog** and via `GET /api/v1/models?kind=…`, `/api/v1/registry`, and `/models/{kind}/{id}`.
- **FR-AT-05** Dependencies are declared so each contributes to **lineage/impact** (a mapping's from→to, a DQ set's target, an extract's upstreams).
- **FR-AT-06** A **breaking** change to an extract (dropped/renamed column) is enterprise-significant and notifies the consumer (events/webhooks).
- **FR-AT-07** An extract's **classification** is derived from the columns it selects, so consumer access is enforced by propagation.

## 4. Contract schemas

### 4.1 Mapping (`contracts/mappings/*.yaml`)
```yaml
mapping: trade_src_to_bdm
from: { kind: source, id: trades_feed }
to:   { kind: bdm, id: trade }
version: 1.0.0
owner: trading-data-eng
rules:
  - { target: trade_id, sources: [src_trade_id], logic: IDENTITY }
  - { target: notional, sources: [quantity, price], logic: "quantity * price" }
  - { target: currency_code, sources: [ccy], logic: LOOKUP }
```
Control surface = `{from, to, rules[]}`. Removing/altering a rule = **major**; adding = **minor**.

### 4.2 DQ rule set (`contracts/dq/*.yaml`)
```yaml
dqRuleSet: trade_dq
target: { kind: bdm, id: trade }
version: 1.0.0
owner: data-governance
rules:
  - { field: trade_id, type: unique, severity: error }
  - { field: currency_code, type: referential, ref: currency.currency_code, severity: error }
  - { field: notional, type: range, params: { min: 0 }, severity: warn }
  - { entity: trade, type: freshness, params: { maxAgeHours: 24 }, severity: warn }
```
Rule types: `not_null · unique · referential · range · regex · accepted_values · freshness`.
Control surface = `{target, rules[]}`.

### 4.3 Consumer extract (`contracts/extracts/*.yaml`)
```yaml
extract: reg_trade_extract
consumer: Regulatory Reporting
version: 2.1.0
owner: reg-reporting
from: [ { kind: bdm, id: trade }, { kind: bdm, id: instrument } ]
grain: one row per trade
columns:
  - { name: TradeId, from: trade.trade_id }
  - { name: ISIN, from: instrument.isin }
  - { name: Notional, from: trade.notional }
filters: "trade_date >= current_date - 30"
delivery: { format: parquet, cadence: daily, destination: reg-reporting }
```
Control surface = `{consumer, from[], columns[], grain}`. **Dropping a column = major** (breaks the consumer).

## 5. Subsystem wiring

| Subsystem | Change |
|---|---|
| `engine/framework/types.ts` | `Mapping`, `DqRuleSet`, `Extract` interfaces; added to `Contract`; `ModelKind` += `mapping\|dq\|extract` |
| `engine/framework/load.ts` | parse `mappings/ dq/ extracts/` in `loadContract` + `parseContract` |
| `engine/registry/surface.ts` | `mappingSurface / dqSurface / extractSurface` + `severity` branches |
| `engine/registry/registry.ts` | `buildModels` emits the new kinds (→ semver + `registry.lock`) |
| `projection/types.ts` | `ModelKind` += new kinds |
| `api/mapping.ts` | project new assets into `ModelRecord`s (domain, dependsOn, detail; extract columns → fields) |
| `sdk-ts` | `ModelKind` += new kinds |
| `api/governance.ts` | `ModelEditKind` + `DIRS`/`idField`/`applyEdits` so ChangeSets govern them |
| catalog / detail (web) | auto-surface (registry lists every kind) |

## 6. Built now vs. phased

**Built now (asset-tracking spine):** contracts, engine types/parse/surface/semver,
registry, projection, API/SDK exposure, catalog/detail surfacing, ChangeSet governance,
and lineage `dependsOn` edges.

**Phased next (specified here, wire on demand):**
- **DQ execution** — generate dbt tests / DLT expectations from `dq` sets; run results → audit evidence + quality status on lineage nodes (BCBS 239).
- **Mapping-driven generation** — emit DLT/SQL transforms from `mapping` rules; render mappings as enriched, transform-labelled lineage edges.
- **Extract consumer contracts** — on a breaking extract change, fire the existing webhook to the consumer; enforce extract access by classification propagation; render extracts as downstream nodes in lineage/ERD.

## 7. Bank-fork integration

These are additive, generic, zero-IP. In the corporate fork you author your own
`contracts/{mappings,dq,extracts}/*.yaml` for your domains; the engine/API changes are
the same small thread-through as the `bk` attribute and are covered in the cherry-pick
handover.
