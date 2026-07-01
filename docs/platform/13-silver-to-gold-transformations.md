# Silver→Gold Transformations & RefMaps as Governed Assets

**Status:** blueprint + initial implementation.

## 1. Problem

Bronze→silver is trivial (rename + light cast) — covered by the light `mapping` asset.
**Silver→gold is where the real logic lives** (simple / medium / complex): multi-source
joins, UNION matrices, subqueries, polymorphic key resolution, SCD-2, and reference-map
lookups. Today these live as Confluence pages. We need to **capture and publish** them as
first-class, version-controlled, governed assets — with column-level lineage.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Source of truth | **Git/DCT authoritative** — author YAML, generate the spec page from it |
| Fidelity | **Capture + lineage + govern** — bespoke SQL held as governed text (no codegen for now) |
| RefMaps / key-resolution maps | **Standalone reusable `refmap` assets**, referenced by transformations |
| Asset shape | **Separate kinds** — bronze→silver = `mapping`; silver→gold = new `transformation` |

## 3. Anatomy of a spec → schema

The Confluence specs are highly consistent; each section maps to a schema block. A
`transformation` is **graded** (`simple`/`medium`/`complex`) with progressive disclosure —
advanced blocks appear only when needed.

```yaml
transformation: dim_position          # id
layer: silver_to_gold
complexity: complex
target: { kind: pdm, id: position_physical }   # GOLD
version: 1.0.0
owner: trading-data-eng
sources:                              # Data Sourcing (aliases + join clauses)
  - { alias: A, entity: position }
  - { alias: B, entity: instrument, join: "LEFT OUTER on A.instrument_id = B.instrument_id" }
assembly:                             # complex-only: bespoke SQL as governed text
  union:
    - { branch: position, filter: "No Filter", columns: { status: "ACTIVE" } }
  subqueries:
    - { alias: latest_fx, sql: "SELECT ccy, MAX(as_of_date) … FROM fx GROUP BY ccy" }
keyResolution:                        # polymorphic Entity/PK → DimID
  - { when: "asset_class = BOND", dim: instrument, dimId: InstrumentDimID }
uses: [ instrument_key, currency_iso ]   # referenced refmap ids
fields:                               # the Transformation Mapping table
  - { target: PositionDimID, logic: AUTO_SURROGATE }
  - { target: dtStart, logic: SCD2_START }
  - { target: InstrumentDimID, from: "position.instrument_id", logic: KEY_RESOLUTION }
  - { target: CurrencyDimID, from: "position.currency_code", logic: REFMAP_LOOKUP,
      refmap: currency_iso, lookupDim: currency, join: "sCurrencyCodeISO",
      bronze: "positions_raw.ccy" }
```

**Field `logic` enum (the recurring patterns):** `DIRECT · LITERAL · AUTO_SURROGATE ·
SCD2_START · SCD2_END · DIM_LOOKUP · REFMAP_LOOKUP · KEY_RESOLUTION` — plus a free
expression string for anything bespoke.

**RefMap (standalone, reusable):**
```yaml
refmap: currency_iso
version: 1.0.0
owner: reference-data
keyType: "ISO currency code → CurrencyDimID"
entries:
  - { from: USD, to: "1" }
  - { from: EUR, to: "2" }
```
(Enumerated entries optional — a refmap may just declare its key contract + source.)

## 4. Design principles

1. **Structured where it's a pattern; governed text where it's bespoke.** Per-field logic
   is a small enum (drives doc + lineage + future codegen); UNION matrices / subqueries
   live in `assembly` as governed SQL text.
2. **Every field row carries full column lineage** — `bronze.table.column → silver
   entity.attribute → gold DimID`, with the transform on the edge. The transformation asset
   *is* the lineage + impact-analysis source.
3. **RefMaps and key-resolution are DRY assets** — governed once, referenced by many.
4. **The spec page is generated from the asset** — the governed YAML is the single source of
   truth; the human-readable page (Data Sourcing / UNION Matrix / Subquery / Transformation
   Mapping) is a rendered view of it.

## 5. Subsystem wiring

Same spine as the other asset kinds: `engine` (types/load/surface/`buildModels`+semver) →
`projection` ModelKind → `api/mapping.ts` → `sdk` → `governance` (ChangeSet — a silver→gold
change is high-impact → CDA sign-off) → catalog + **a dedicated transformation spec
renderer** (the "publish" surface) + lineage `dependsOn` (target + sources + refmaps).

## 6. Built now vs. phased

**Built now:** `transformation` + `refmap` kinds end-to-end (contracts → engine → semver →
projection → API/SDK → governance → catalog + a rendered spec page); synthetic simple/
medium/complex seed examples; column lineage via `dependsOn` + per-field `bronze`.

**Phased next:** export the rendered spec back to Confluence; SQL/DLT scaffolding for the
pattern-based fields; UNION-matrix editor UI; refmap entry management UI; transformation
edges surfaced in the lineage graph / ERD.

## 7. Zero-IP

Public seed uses synthetic capital-markets examples only. In the corporate fork, author
your real transformations/refmaps as YAML; the engine/API wiring is identical.
