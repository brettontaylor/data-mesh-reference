# Architecture overview

This reference demonstrates a **metadata-driven data mesh**: a single governed
contract drives the pipelines, the semantic layer, the warehouse, and the catalog,
with data classification enforced end to end.

## 1. The contract is the source of truth

Everything starts in `contracts/`:

- `spec.yaml` — version and the ordered classification tiers.
- `entities/*.yaml` — each entity's fields (every field classified), plus metrics
  and dimensions for the semantic layer.
- `sources/*.yaml` — source registrations: cadence, which entities they produce,
  and (illustrative) local input files.

The contract sits **on top of** the controlled BDM/PDM — it references the
governed models, it does not replace them. A change here regenerates every
downstream surface. A change that stops at the contract is incomplete.

## 2. Generators turn the contract into the stack

`npm run generate` writes `generated/`:

| Generator | Output | Notes |
|-----------|--------|-------|
| `databricks` | `*_pipeline.py` + `_workflow.json` | DLT-style bronze→silver→gold per entity; schedule from source cadence. |
| `snowflake` | `serving.sql` | Gold DDL with classification comments, masking policies for confidential columns, progressive-access roles. |
| `cube` | `*.yml` | Cube semantic models; dimensions/measures from the contract; classification in `meta`. |
| `catalog` | `*.json` + `index.json` | Machine-readable data-product descriptors with schema, lineage, classification summary. |

## 3. The medallion, locally

`npm run run` executes the same logic the generated Databricks pipelines express,
in-process on the synthetic CSVs:

- **Bronze** — raw rows + ingest metadata (`_source`).
- **Silver** — drop rows missing the primary key, dedup on PK.
- **Gold** — project to the contract's non-restricted fields.

Outputs land in `generated/medallion/<entity>_{bronze,silver,gold}.json` so each
layer is inspectable. The synthetic `trade.csv` intentionally contains one
duplicate and one missing-PK row, so the silver step visibly drops them.

## 4. Governance is the propagation chain

`npm run check` runs the gates that keep the surfaces from drifting:

- **Classification coverage** — every field has a known tier; no permissive default.
- **Primary key** — exactly one per entity.
- **Registry consistency** — `entity.source` and `source.produces` agree both ways.
- **Foreign-key integrity** — every FK resolves to a real entity + field.
- **Sensitivity leakage** — a `restricted` field may not be a semantic dimension.
- **Propagation completeness** — after generation, every entity reached every
  surface (Databricks, Cube, catalog) and the Snowflake DDL exists.

## How classification flows

A field marked `confidential` (e.g. `trade.price`) appears as:

- a `quality`/`classification` table property and a gold-mart exclusion rule (for
  `restricted`) in the Databricks pipeline,
- a masking policy binding in the Snowflake DDL (`MASK_CONFIDENTIAL`),
- `meta.classification` on the Cube measure/dimension,
- a `classification` entry in the catalog schema and summary.

One edit in the contract; the tier is honored everywhere.

## Adapting this

Swap the synthetic entities in `contracts/` for your own model, point the source
`inputs` at real landing locations, and wire the generated artifacts into your
Databricks workspace, Cube deployment, and Snowflake account. The framework and
governance gates are domain-agnostic.
