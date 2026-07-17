# 8. AppKit Increment — new & refined functional requirements

This document is an **increment layered on the baseline SRS** (docs 01–07). It does
**not** restate or renumber those requirements — it captures the capabilities the
**Mapping and Metadata Platform (MMP) AppKit** build added or refined beyond the
baseline, so reviewers can see exactly what changed and baseline the delta.

Every row is marked **NEW** (a capability the baseline did not state) or
**REFINES `<FR-id>`** (a capability the baseline stated more generally, now tightened
by the build). Conventions are unchanged from the baseline: RFC-2119 keywords
(**SHALL/SHOULD/MAY**), MoSCoW priority (**M**ust / **S**hould / **C**ould /
**W**on't-yet), and testable acceptance criteria. IDs here are stable and unique
within the SRS collection; the requested increment groups are:

| Prefix | Area | Relationship to baseline |
|--------|------|--------------------------|
| `FR-DM` | Domains as a first-class governed kind | Refines `FR-FG` federated model |
| `FR-DP` | Data products — independent versioning | Refines `FR-MM-013` |
| `FR-VER` | Automatic semantic versioning + live enforcer | Refines `FR-MM-006` / `FR-MM-007` |
| `FR-TT` | Two-tier change routing | Refines `FR-GV-005` / `FR-FG` |
| `FR-DQ` | Data-quality rules library | Refines `FR-MM-009` |
| `FR-MAP` | Governed mapping documents | New (was implicit) |
| `FR-PG` | Contract→Lakebase Postgres generation & migration | New / refines propagation |
| `FR-UI` | AppKit UI & information architecture | Extends baseline §2.9 (`FR-UI-006`+) |
| `FR-PAR` | Streamlit parallel child | New |

> **Note on `FR-DQ`.** This group denotes the DQ *rules library* introduced by the
> build; it refines the baseline's DQ contracts (`FR-MM-009`). It is scoped to this
> increment and is distinct from any DQ numbering in the consolidated master
> requirements document.

---

## 8.1 Domains as a first-class governed kind (FR-DM)

The build promotes **domains** to a governed asset kind — the top-level grouping that
owns data products, which in turn own assets — with their own version line and
governance gates. This refines the federated operating model (`FR-FG`), where domains
were configuration/ownership metadata rather than versioned, gated assets.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-DM-001 | REFINES FR-FG-001 | M | The system SHALL represent **domains** as a first-class *governed asset kind* (`domain`, `contracts/domains/*.yaml`) — the top-level grouping that owns data products (which own assets) — carrying id, owner group, description, and version. | A `domain` asset can be authored; `GET /api/domains` returns each domain with its product and asset counts. |
| FR-DM-002 | NEW | M | Each `domain` SHALL be **independently semantically versioned** and a full change-lifecycle citizen (propose/approve/merge/withdraw, auto-semver, write-back to `domains/`). | A domain edit flows through a ChangeSet, is auto-versioned, and (with write-back on) persists to `contracts/domains/`. |
| FR-DM-003 | NEW | M | Every **data product SHALL resolve to exactly one defined domain**; a product referencing an undefined domain SHALL fail governance. | A product whose `domain` has no `contracts/domains/*.yaml` fails with `PRODUCT_DOMAIN_UNRESOLVED`. |
| FR-DM-004 | NEW | M | The system SHALL enforce **domain integrity gates**: a duplicate domain id and an invalid domain semver are rejected. | Two domains with the same id fail `DOMAIN_DUPLICATE`; a non-semver version fails `DOMAIN_VERSION_INVALID`. |
| FR-DM-005 | REFINES FR-FG-002 | M | The domain SHALL be the **access boundary and ownership anchor**: change routing and access scoping resolve to the owning domain of each asset (`domainOf()`), and a domain-scoped approver acts only within their domain. | A tier-1 change routes to its owning domain's stewards; an approver outside that domain is rejected (403). |

## 8.2 Data products — independent versioning (FR-DP)

Refines `FR-MM-013` (data products compose pinned model versions): products become an
independently versioned, domain-owned unit whose version line is **decoupled** from its
members and advances automatically as members change.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-DP-001 | REFINES FR-MM-013 | M | The system SHALL support **data products** that bundle governed assets under one **independently versioned, domain-owned** unit (`contracts/products/*.yaml`: product, domain, owner, version, status, includes[]). | A product references its members and is published with its own version via `GET /api/products`. |
| FR-DP-002 | NEW | M | A product's version SHALL **not track member versions**: the product carries its own semver line, decoupled from the versions of its members. | A member version change does not itself equal the product version; the product advances on its own line. |
| FR-DP-003 | NEW | M | On **merge of any member change**, every containing product SHALL **auto-increment** — **minor** for a tier-1 change, **major** for a tier-2/breaking change. | Merging a tier-1 member edit bumps each containing product by a minor; a tier-2 member edit bumps a major (`productIncrements[]` in the merge response). |
| FR-DP-004 | NEW | S | The bumped product YAML SHALL be **written back to the models repo** alongside the merged asset, on the same atomic write-back path. | With write-back on, the commit contains both the asset YAML and the bumped product YAML. |
| FR-DP-005 | NEW | S | A product increment SHALL **auto-trigger a full product pipeline re-run**, tagged with the product versions it executed for. | The merge produces a run with `trigger: product-increment` carrying the incremented product versions. |
| FR-DP-006 | NEW | M | The system SHALL enforce **product integrity gates**: duplicate id, invalid semver, empty membership, and unresolved member reference. | The four codes fire: `PRODUCT_DUPLICATE`, `PRODUCT_VERSION_INVALID`, `PRODUCT_EMPTY`, `PRODUCT_MEMBER_UNRESOLVED`. |

## 8.3 Automatic semantic versioning & the live enforcer (FR-VER)

Refines `FR-MM-006` (compute the change class) and `FR-MM-007` (simulate a change): the
server now **owns** the version — computing and stamping it from the structural diff so
the proposer cannot hand-pick it — and exposes the simulation as a live, no-persist
enforcement endpoint.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-VER-001 | REFINES FR-MM-006 | M | The system SHALL **compute the version bump server-side** from the structural diff of each edit against the current contract, classifying it patch/minor/major. | Cosmetic-only edit → patch; additive/behavioural → minor; structural/breaking → major; new asset → 1.0.0; identical spec → no bump. |
| FR-VER-002 | REFINES FR-MM-007 | M | The proposer SHALL NOT hand-pick the version of an existing asset; the server SHALL **stamp** the computed version and record a per-edit `versionNotes` rationale on the ChangeSet. | A proposer-supplied version on an existing asset is overridden; the stamped version and note persist on the changeset. |
| FR-VER-003 | REFINES FR-MM-007 | M | The system SHALL expose a **live, no-persist validation endpoint** running the exact proposal-time gates (schema → tier → version plan → contract check) and returning the verdict without changing state. | `POST /api/validate` returns `{valid, issues, tier, tierReasons, domains, versionPlan}`; no changeset or contract mutation occurs. |
| FR-VER-004 | NEW | S | An editor UI SHALL be able to surface the **version-bump + tier verdict and governance errors as the user types**, using the live endpoint. | The structured editor shows the required bump, tier, and any blocking issue before a proposal is made. |

## 8.4 Two-tier change routing (FR-TT)

Refines `FR-GV-005` (risk-based quorum) and the federated routing (`FR-FG-021`): change
is classified **automatically** into two tiers, tier-1 approved within the owning
domain and tier-2 escalated to chief-data-architect / ARB sign-off.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-TT-001 | REFINES FR-GV-005 | M | The system SHALL route every ChangeSet into one of **two tiers**, classified **automatically** at proposal time from the diff (conservative: escalate when in doubt). | Each proposal carries a `tier` (1 or 2) and `tierReasons`; the tier is derived, not proposer-chosen. |
| FR-TT-002 | REFINES FR-GV-005 | M | **Tier-1 (minor)** changes SHALL be approvable **within the owning domain** — the decider needs `change:approve` and membership of every owning domain in the changeset. | A domain steward approves a tier-1 change in their domain; a steward outside it is rejected (403). |
| FR-TT-003 | REFINES FR-FG-021 | M | **Tier-2 (impactful/breaking)** changes SHALL require **chief-data-architect / ARB sign-off** (`change:signoff`), domain-independent, and SHALL NOT be satisfied by domain approval alone. | A tier-2 change approved only by a domain steward is rejected; a CDA/ARB sign-off is required. |
| FR-TT-004 | NEW | M | Automatic tier-2 classification SHALL cover at least: deletion, a new BDM/PDM, a major bump, published-extract modification, lifecycle regression (→deprecated/retired), and BDM structural diffs (field removal, type change, pk/bk change, classification downgrade, PII/MNPI flag change). | Each listed condition yields tier 2 with a named reason; additive-nullable and description-only edits stay tier 1. |
| FR-TT-005 | REFINES FR-GV-004 | M | Segregation of duties SHALL hold at **both tiers**; the author SHALL NOT approve, sign off, or merge their own ChangeSet, and only the author MAY **withdraw** a still-proposed ChangeSet. | Self-decision at either tier is rejected (403); withdraw by a non-author is rejected; the author can withdraw. |

## 8.5 Data-quality rules library (FR-DQ)

Refines `FR-MM-009` (DQ contracts on a model): DQ rules become a **generic,
parameterized library** — defined once, applied by rule sets via bindings, and
**executed on every medallion run** rather than only declared.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-DQ-001 | REFINES FR-MM-009 | M | The system SHALL provide a **library of generic, parameterized DQ rules** (kind `dqrule`) each declaring a `scope` (column/table), a `check` primitive, typed `params`, a default `severity`, and an illustrative expression — defined once, reused everywhere. | A `dqrule` validates and is independently semver'd and maker/checker'd like any asset. |
| FR-DQ-002 | NEW | M | The check primitive set SHALL include at least `not_null`, `unique`, `referential`, `range`, `regex`, `accepted_values`, `row_count_min`, and `freshness`. | Each primitive is authorable and recognised by the gate; an unknown check fails `DQRULE_CHECK_UNKNOWN`. |
| FR-DQ-003 | REFINES FR-MM-009 | M | Rule sets SHALL **apply** library rules via a `use: <rule-id>` binding — bound to a column (`field:`) for column scope or the table for table scope — with per-application param/severity overrides; legacy inline rules remain supported. | A `use:`-bound application resolves against the library; scope/field mismatches fail (`DQ_BINDING_SCOPE`, `DQ_BINDING_FIELD_UNKNOWN`). |
| FR-DQ-004 | REFINES FR-OR-006 | M | Every resolved DQ application SHALL be **executed on every medallion run**, with per-entity pass/fail/skipped and violation counts surfaced on the run. | A run reports `LayerStats.dq` per entity; warehouse-only checks (freshness) report skipped locally. |
| FR-DQ-005 | NEW | M | Editing a library rule that is **applied anywhere** SHALL cascade to **tier 2**, and deleting a still-referenced rule SHALL fail the proposal gate. | An in-use rule edit classifies tier 2 with a usage-count reason; deleting a referenced rule fails `DQ_LIBRARY_RULE_UNRESOLVED`. |

## 8.6 Governed mapping documents (FR-MAP) — NEW group

The platform's namesake surface, previously implicit, is made explicit: bronze→silver
source mappings and silver→gold transformations as governed, reference-checked assets
with coverage reporting.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-MAP-001 | NEW | M | The system SHALL manage **bronze→silver source mappings** (kind `mapping`) as governed assets: field-level rules `{target, sources[], logic, description}` from a source to a target BDM. | A `mapping` validates and is a full changeset citizen (auto-semver, tiering, write-back to `mappings/`). |
| FR-MAP-002 | NEW | M | The system SHALL manage **silver→gold transformations** (kind `transformation`) capturing joins, unions, key resolution, refmap lookups, and per-field logic with **bronze lineage tails** and complexity grading. | A `transformation` validates and contributes its from→to edges to lineage. |
| FR-MAP-003 | NEW | M | Mapping/transformation **reference integrity** SHALL be enforced: source and target entities/fields, rule targets on the target BDM, and refmap references must all resolve. | The `MAPPING_*` / `TRANSFORMATION_*` codes fire on a dangling source, target, target-field, or refmap reference; `npm run check` blocks a phantom target. |
| FR-MAP-004 | NEW | S | The system SHALL compute and surface **mapping coverage** vs the target BDM (mapped/target fields + the unmapped-field list) as the completeness signal. | `GET /api/mappings` returns coverage per bronze→silver doc; the editor shows a live coverage hint. |
| FR-MAP-005 | NEW | S | The system SHALL provide a **structured mapping editor** with a target-field select fed by the chosen BDM and live enforcement of unknown targets. | Selecting an off-schema target surfaces `MAPPING_TARGET_FIELD_UNKNOWN` as the user types. |

## 8.7 Contract→Lakebase Postgres generation & migration (FR-PG)

Extends orchestration/generation (`FR-OR-001`) and access enforcement (`FR-AX-002`) to a
new serving surface: the contract now generates Lakebase/Postgres serving DDL, carrying
classification, and a Delta→Lakebase migration toolchain reads its manifest.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-PG-001 | REFINES FR-OR-001 | M | The system SHALL **generate Lakebase/Postgres serving DDL** from the contract (per-entity DDL, a full idempotent `schema.sql`, and a machine-readable `manifest.json`) into `generated/postgres/`. | Editing the contract regenerates the postgres surface; re-applying `schema.sql` is idempotent. |
| FR-PG-002 | REFINES FR-AX-002 | M | The generator SHALL **carry classification into the serving copy**: `restricted` columns are excluded, and PII/MNPI columns get masked-view guidance whose allowed roles are computed by the same access engine as the warehouse masking. | Generated DDL omits restricted columns and comments PII/MNPI masking roles consistent with the access contract. |
| FR-PG-003 | NEW | M | The **propagation gate SHALL cover the postgres surface**: a contract change that skips regeneration fails CI. | `npm run check` fails when `generated/postgres/` is stale relative to the contract. |
| FR-PG-004 | NEW | S | The system SHALL provide a **Delta→Lakebase migration status surface** diffing the generated manifest, with a documented backfill/validation/cutover path. | `GET /api/migration` reports status from `generated/postgres/manifest.json`; the migration guide documents backfill and cutover. |

## 8.8 AppKit UI & information architecture (FR-UI, extends §2.9)

Extends the baseline UI group (`FR-UI-001`–`FR-UI-005`, §2.9) with the AppKit-specific
information architecture, model explorer, org filters, and theming. New rows continue
the baseline numbering from `FR-UI-006`.

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-UI-006 | NEW | S | The AppKit UI SHALL present a **7-nav information architecture**: Dashboard (catalog: domains→products + medallion flow), Registry (+ Changesets), Mappings, Data Model (ERD), DQ Library, Pipelines (+ Migration), Access. | Each of the seven top-level surfaces is reachable and renders live data. |
| FR-UI-007 | REFINES FR-UI-003 | M | The **Data Model explorer (ERD)** SHALL render expandable entities with PK/FK/classification/PII pills, FK traversal, kind filters, and compliance role views, driven off the live contract. | Entities expand to show attributes; FKs draw between entities; kind and role filters change the view. |
| FR-UI-008 | NEW | S | The catalog/registry surfaces SHALL support **domain and product filters** and a server-computed **flat registry join** (kind/id/version/status/domain/product/dependsOn). | `GET /api/registry` returns the joined rows; the UI filters by domain and by product. |
| FR-UI-009 | REFINES FR-UI-004 | S | The UI SHALL ship a single **design-token system with light (default) + dark** themes, a persisted theme toggle applied before first paint, and shared `PageHeader`/`Breadcrumbs` primitives on every page. | Toggling the theme persists per user and applies pre-paint; every page renders the shared header + breadcrumbs. |

## 8.9 Streamlit parallel child (FR-PAR) — NEW group

A planned parallel front-end: a Streamlit UI hosted in-repo over the **same API** as the
AppKit UI, with a config switch to flip UIs and a page-by-page (strangler) migration
kept structurally aligned to the AppKit IA. See
[`../handover/STREAMLIT-PARALLEL-PLAN.md`](../handover/STREAMLIT-PARALLEL-PLAN.md).

| ID | Type | Pri | Requirement | Acceptance criteria |
|----|------|-----|-------------|---------------------|
| FR-PAR-001 | NEW | C | The repo MAY host a **parallel Streamlit UI** as a child app over the **same REST API** as the AppKit UI, with no duplication of the engine or governance logic. | The Streamlit child renders governed data by calling the same `/api/*` surface; no business logic is reimplemented. |
| FR-PAR-002 | NEW | C | A **configuration switch** SHALL select which UI is served, so the two front-ends can be flipped without code changes. | Flipping the config serves the Streamlit UI or the AppKit UI over the identical API. |
| FR-PAR-003 | NEW | C | Migration SHALL proceed **page-by-page in parallel** (strangler pattern) with **structural alignment** to the AppKit IA, so each Streamlit page maps 1:1 to its AppKit counterpart. | Each migrated page has a matching AppKit counterpart; the per-page acceptance checklist in the parallel plan is met. |

---

## 8.10 Traceability (increment → build phase → handover)

Each increment group maps to a baseline build phase (see
[06-traceability-matrix.md](06-traceability-matrix.md)) and to the section of the AppKit
handover (`../handover/MMP-APPKIT-HANDOVER.md`) that delivered it.

| Group | Relationship | Handover § | Phase | Epic |
|-------|--------------|-----------|-------|------|
| FR-DM Domains | REFINES FR-FG | §1.13 | P3–P4 | DCT-EP11 |
| FR-DP Data products | REFINES FR-MM-013 | §1.7 | P2, P4 | DCT-EP03, DCT-EP05 |
| FR-VER Auto-versioning + live enforcer | REFINES FR-MM-006/007 | §1.8 | P4 | DCT-EP05 |
| FR-TT Two-tier routing | REFINES FR-GV-005 / FR-FG | §1.2 | P4 | DCT-EP05, DCT-EP11 |
| FR-DQ DQ rules library | REFINES FR-MM-009 | §1.10 | P5 | DCT-EP06 |
| FR-MAP Mapping documents | NEW | §1.11 | P2, P6 | DCT-EP03, DCT-EP07 |
| FR-PG Lakebase generation & migration | REFINES FR-OR-001 / FR-AX-002 | §1.4 | P5–P6 | DCT-EP06, DCT-EP07 |
| FR-UI AppKit UI & IA | Extends §2.9 | §1.12, §1.13 | P2 | DCT-EP03 |
| FR-PAR Streamlit parallel child | NEW | STREAMLIT-PARALLEL-PLAN.md | P2 (post-GA) | DCT-EP03 |

> Acceptance for the increment is the same discipline as the baseline: each requirement
> is "done" only when its criteria are demonstrably met, and a change that stops at the
> contract is incomplete until it propagates to the generated surfaces and the governance
> gates (`npm run check`) pass.
