# DEAL Control Tower — Master Requirements & Architecture

**Document type:** Foundational Business & Functional Requirements (BRD/FSD basis)
**Product:** DEAL Control Tower (DCT)
**Status:** Draft for team review · living document
**Classification:** Generic / illustrative (no employer- or client-specific IP; a synthetic
capital-markets domain is used throughout for examples)

---

## 0. How to read this document

This is a single, deliberately verbose consolidation of the *what* and *why* of the DEAL
Control Tower. It is intended to be the foundation from which a formal Business
Requirements Document (BRD) and Functional Specification Document (FSD) are elaborated.

- **Sections 1–8** establish objective, background, scope, personas, terminology, and the
  guiding principles / locked architectural decisions.
- **Sections 9–10** describe the solution and its architecture (logical, component, data,
  flow, deployment, integration).
- **Sections 11–12** enumerate detailed functional and non-functional requirements with
  stable identifiers (`FR-<AREA>-NNN`, `NFR-<AREA>-NNN`) for traceability.
- **Sections 13–22** cover security/compliance, interfaces, roles, assumptions,
  constraints, risks, phasing, acceptance, and traceability.
- **Appendices** hold the asset schemas and a pointer map to the detailed design docs.

Requirement priority is expressed as **MUST / SHOULD / MAY** (RFC-2119 sense).

---

## 1. Executive summary

Financial institutions already own the hard part of a modern data estate — robust
**business data models (BDMs)** and **physical data models (PDMs)**. What they typically
lack is a **control plane** that turns those models into governed, running, observable data
products with a defensible audit trail. Today that connective tissue lives in spreadsheets,
Confluence pages, hand-built pipelines, and tribal knowledge; it drifts, duplicates, and
cannot answer basic questions ("who approved this schema change?", "what feeds this
field?", "who is allowed to see it?", "what breaks if I change it?").

The **DEAL Control Tower (DCT)** is a metadata-management and governance control plane over
the organization's **DEAL** lakehouse (Data Enrichment & Abstraction Layer — the team's
Databricks medallion architecture). A single **governed model specification** is the source
of truth; from it, DCT drives the medallion pipelines, the semantic layer, warehouse
serving and masking, access policy, documentation, machine-readable contracts, and
column-level lineage — with every change reviewed, versioned, and auditable.

DCT is designed to be **stood up inside a corporate environment with minimal intervention**:
a portable Node container, adapters at every external boundary, open standards, and a
GitOps source of truth.

---

## 2. Background & problem statement

### 2.1 Current state (the problem)

1. **Drift & duplication.** Pipelines are hand-built per source; the same change is made in
   several places and the copies diverge.
2. **No authoritative answers.** Schema change history, ownership, lineage, and access are
   not reliably queryable.
3. **Classification bolted on.** Sensitivity (PII/MNPI/tiers) is applied after the fact,
   inconsistently, instead of flowing from the model.
4. **Slow, risky change.** Model and pipeline change is manual, ungoverned, and hard to
   audit — a control *and* delivery bottleneck.
5. **Transformation logic is undocumented as an asset.** Silver→gold transformations
   (joins, UNIONs, subqueries, SCD-2, key resolution, reference-map lookups) exist as prose
   pages, not versioned, governed artifacts.

### 2.2 Desired state (the opportunity)

A control plane where **the model is the control surface**: change the governed model and
everything downstream regenerates, while governance proves the change was reviewed,
classified, versioned, and propagated — and lineage/impact is always answerable.

### 2.3 Why build (vs. buy a catalog)

Incumbent catalogs (Collibra, Alation, Purview) **describe and observe** metadata alongside
the pipelines; they do not **drive** the pipelines or **enforce** the change. DCT is
net-new and **complementary**: it can sit above or beside an incumbent catalog via open
standards, and it owns the part incumbents do not — governed, generated pipelines and a
single spec that also enforces classification and access.

---

## 3. Goals, objectives & non-goals

### 3.1 Primary objective

Provide a single, governed, versioned source of truth for the organization's data models
and their downstream artifacts, and from it **drive and govern** the medallion data
platform end-to-end with column-level lineage and an immutable audit trail.

### 3.2 Measurable goals

- **G1** Every model and downstream artifact is a versioned, owned, governed asset.
- **G2** No model/pipeline change reaches production without maker/checker approval and an
  adequate semantic-version bump.
- **G3** Column-level lineage from upstream source to downstream consumer is always
  queryable, including transformation logic.
- **G4** Sensitivity classification (tier + PII + MNPI) is declared once on the model and
  enforced everywhere (pipeline, warehouse, API, semantic layer, extracts).
- **G5** The platform can be stood up in a new environment from a single deployable with
  minimal intervention.

### 3.3 Non-goals (initial releases)

- DCT is **not** a BI/visualization tool, an ETL execution engine of its own (it
  orchestrates the platform's engine), or a replacement for the organization's IdP,
  warehouse, or orchestrator.
- DCT does **not** aim to auto-generate arbitrarily complex transformation SQL executably
  in v1 (bespoke SQL is captured as governed text; see §11.10).

---

## 4. Scope

### 4.1 In scope

Governed asset management for: BDMs, PDMs, semantic models, sources, **mappings**, **data
quality rule sets**, **consumer extracts**, **silver→gold transformations**, and **reference
maps**; semantic versioning and a registry; change governance (maker/checker, SoD, quorum,
classification escalation, federated Chief-Data-Architect sign-off); attribute-level access
control; column-level lineage and impact analysis; pipeline orchestration via a pluggable
adapter; catalog + publication (API/SDK/CLI) + consumption; events/webhooks; immutable
audit; and the web experience (catalog, interactive ERD, registry, pipelines, lineage,
access, model/asset detail with an embedded ERD).

### 4.2 Out of scope (for now)

Master data management workflows, data-entry/curation UIs for source systems, real-time
streaming ingestion (batch/medallion assumed), and BI dashboards.

---

## 5. Stakeholders & personas

| Persona | Needs from DCT |
|---|---|
| **Domain data modeler** | Author/propose BDM/PDM/semantic/transformation changes; see impact before proposing |
| **Domain data steward / owner** | Approve in-domain change; own the domain's models |
| **Chief Data Architect (CDA)** | Sign off enterprise-significant change; set enterprise standards |
| **Architecture Review Board (ARB)** | Delegated enterprise sign-off by quorum |
| **Data governance / compliance** | Own DQ + classification; separate control approval for sensitive change; audit evidence |
| **Platform engineer** | Operate merge, generation, deployment; manage adapters/environments |
| **Data consumer (BI, apps, data science, reporting)** | Discover data products; consume via API/SDK/CLI/extracts with correct masking |
| **Auditor / regulator** | Tamper-evident change history; per-change evidence bundles; lineage traceability |

---

## 6. Glossary & terminology

- **DEAL** — Data Enrichment & Abstraction Layer; the team's Databricks medallion lakehouse.
- **DCT** — DEAL Control Tower; the control plane over DEAL.
- **BDM** — Business Data Model: a versioned business entity (semantic/logical, "silver").
- **PDM** — Physical Data Model: a physical binding for a BDM (physical/"gold" table).
- **Semantic model** — a consumption model (metrics/dimensions) composed over BDMs.
- **Source** — an upstream feed that produces BDM data.
- **Mapping** — a field-level source→target transformation (bronze→silver light mapping).
- **Transformation** — a graded silver→gold transformation spec (simple/medium/complex).
- **RefMap** — a reusable reference / key-resolution map (code→id, natural→surrogate).
- **DQ rule set** — data-quality rules attached to a model.
- **Consumer extract** — a published downstream extract/view contract for a consumer.
- **Control surface** — a model's structural fingerprint used to classify version severity.
- **ChangeSet** — a governed unit of change (proposal → gates → approvals → merge).
- **Classification** — sensitivity tier (`public/internal/confidential/restricted`) plus
  orthogonal **PII** and **MNPI** tags.
- **Business key (BK)** — a natural key, distinct from a surrogate primary key (PK).
- **SoD** — segregation of duties (author cannot approve/merge own change).
- **GitOps** — Git as the authoritative system of record; runtime state is a projection.

---

## 7. Guiding principles

- **P1 — The model is the control surface.** One governed spec drives generation,
  enforcement, and documentation; downstream artifacts are derived, not hand-maintained.
- **P2 — GitOps source of truth + rebuildable projection.** Definitions live in Git
  (diffable, reviewable, recoverable); a fast read-model (projection) is rebuilt from Git.
- **P3 — Adapters at every boundary.** Git provider, orchestrator, catalog, IdP, secrets,
  and warehouse are swappable behind interfaces.
- **P4 — Classify once, enforce everywhere.** Sensitivity declared on the field flows into
  pipeline, warehouse, API, semantic layer, lineage, and extracts.
- **P5 — Every change is governed and auditable.** Maker/checker, SoD, risk-based quorum,
  classification escalation, and a tamper-evident audit are default, not optional.
- **P6 — Federated by domain, coherent by architecture.** Domains own and propose; the CDA
  signs off enterprise-significant change (see §11.4).
- **P7 — Net-new + open standards.** Unity Catalog, DLT/Workflows, OpenLineage, JSON
  Schema, OpenAPI — federates, does not trap; complements incumbent catalogs.
- **P8 — Minimal-intervention install.** A portable single deployable stands the platform
  up in a corporate environment.
- **P9 — Zero-IP in shared/reference materials.** Public/reference artifacts contain no
  employer- or client-specific names, data, or schemas.

### 7.1 Locked architectural decisions

| # | Decision |
|---|---|
| D1 | **Source of truth = GitOps**; runtime state = a rebuildable projection (Postgres) |
| D2 | **Metastore sync = Unity Catalog** two-way (push tags/masks/schemas; pull/reconcile) |
| D3 | **Runtime = portable Node container**; Databricks SDK for platform ops |
| D4 | **Orchestration = Databricks Workflows/DLT behind a pluggable adapter** (local runner for dev) |
| D5 | **Identity = corporate IdP via OIDC/SAML**, mapped to **RBAC + ABAC** clearances |
| D6 | **Catalog posture = net-new + open standards**, complementary to incumbents |
| D7 | **Compliance bar (v1) = immutable hash-chained audit + segregation of duties**; GDPR/BCBS-239/retention designed as post-GA add-ons |
| D8 | **Codebase = monorepo** (pnpm workspaces + Turborepo); engine is a pure package |

---

## 8. Solution overview

DCT is a control plane composed of a **pure engine** (contracts → generators + governance +
versioning), a set of **adapters** (Git, orchestrator, catalog, auth, events), a **read-model
projection**, and thin **apps** (API, web, worker, CLI). Authors edit governed YAML
contracts in Git; a reconciler projects them into a fast read model; the API serves catalog,
lineage, access, registry, and governance; the web app provides the interactive experience;
and adapters push/pull to Unity Catalog and orchestrate Databricks pipelines.

---

## 9. Conceptual & information architecture

### 9.1 The governed asset model

Every asset is a versioned YAML contract travelling the same path (parse → control-surface
hash → semver + registry → projection → API/SDK/CLI → governance → catalog/lineage/events):

| Asset kind | Purpose |
|---|---|
| `bdm` | Business Data Model (silver, semantic) |
| `pdm` | Physical Data Model (gold, physical binding) |
| `semantic` | Consumption model (metrics/dimensions over BDMs) |
| `source` | Upstream feed producing BDM data |
| `mapping` | Bronze→silver field mapping (rename + light cast) |
| `transformation` | Silver→gold transformation (graded simple/medium/complex) |
| `refmap` | Reusable reference / key-resolution map |
| `dq` | Data-quality rule set attached to a model |
| `extract` | Published downstream consumer extract/view contract |

Each field carries a **classification** (`public/internal/confidential/restricted`) plus
orthogonal **PII** and **MNPI** tags, an `isPk` (surrogate primary key) flag, an optional
`bk` (business/natural key) flag, and an optional `fkRef` (foreign key → `entity.field`).

### 9.2 Medallion flow

`Upstream sources → Bronze (raw) → Silver (conformed, classified = BDM) → Gold (curated
marts = PDM) → Semantic (metrics/dimensions) → Consumers (BI, apps, data science,
extracts)`. Classification declared on the model is carried through every layer and becomes
Unity Catalog column tags + masking at gold.

---

## 10. Architecture

### 10.1 Logical architecture

```
Clients:  Web UI  ·  SDK (TS/Py)  ·  CLI  ·  CI / apps
                         │
                  ┌──────▼───────────────────────────────────────────┐
                  │  CONTROL PLANE (API)                              │
                  │  Model · Governance · Orchestration ·            │
                  │  Catalog & Publish · Lineage · Access · Events   │
                  │  Engine: contracts → generators                  │
                  │  (Databricks DLT · Cube · Snowflake · catalog ·  │
                  │   access policy · registry)                      │
                  └──────┬───────────────────────────────────────────┘
                         │
Backends:  Git (SoR)  ·  PostgreSQL (projection/index)  ·
           Databricks (Workflows/DLT)  ·  Unity Catalog (tags/masks/lineage)
```

### 10.2 Component / module architecture (monorepo)

- **`packages/engine`** — pure engine: contract types, parse/load, control-surface hashing,
  semantic-version governance, structural/classification/referential checks, and generators
  (Databricks DLT, semantic layer, warehouse DDL + masks, catalog, access policy, registry).
- **`packages/git-adapter`** — Git provider abstraction (local provider for dev; GitLab/
  other for prod) — read tree, write, commit.
- **`packages/projection`** — read-model store (`MemoryStore` default for dev; `PostgresStore`
  for prod) + migrations; the rebuildable index over the Git source of truth.
- **`packages/catalog-adapter`** — Unity Catalog connector: plan/apply/pull/reconcile of
  schemas, classification/PII/MNPI tags, column masks, ownership.
- **`packages/orchestration-adapter`** — `LocalOrchestrator` (runs the engine medallion) and
  `DatabricksOrchestrator` (Asset Bundle + SDK deploy) behind one interface.
- **`packages/auth`** — identity, RBAC capabilities, ABAC clearance; OIDC/SAML in prod,
  dev-auth impersonation headers for local/CI.
- **`packages/audit`** — append-only, hash-chained, tamper-evident audit log + verify.
- **`packages/events`** — event log + HMAC-signed webhook delivery + retries + DLQ + replay.
- **`packages/shared`** — config + logging.
- **`packages/sdk-ts`** — typed client for the read/publication API (self-contained).
- **`apps/api`** — Fastify control-plane API (reconciler + read/publication + governance +
  pipelines + lineage + events + audit + UC sync).
- **`apps/web`** — Next.js/React/Tailwind UI (catalog, interactive ERD, registry, pipelines,
  lineage, access, asset detail).
- **`apps/worker`** — background processing (webhook delivery, scheduled reconciliation).
- **`apps/cli`** — command-line surface for models/pipelines/registry operations.

### 10.3 Data-flow: governed change (write path)

`Author edits model → Validate (automated gates) → ChangeSet (diff + impact) →
Maker/Checker (SoD + risk quorum + classification escalation + CDA sign-off where required)
→ Merge to Git SoR → Reconcile (Git → projection) → Register (semver lock) →
Generate + Deploy (pipelines & contracts) → Audit (append to hash-chained log, stream to
SIEM) → Notify (events/webhooks incl. breaking-change notifications).`

### 10.4 Deployment architecture

A single portable container image runs one or more roles (API, web, worker) selectable by
configuration. Backends (Git provider, Postgres, Databricks workspace, Unity Catalog, IdP)
are provided by environment configuration and switched on via adapters. Packaging targets:
Docker/Compose (one-command dev), Helm (Kubernetes), Databricks App bundle, and Terraform
(catalogs + service principals). Identity via corporate OIDC/SAML.

### 10.5 Integration architecture

| External system | Adapter / standard |
|---|---|
| Git provider | `git-adapter` (local / GitLab / other) |
| Orchestrator | `orchestration-adapter` (Databricks Workflows/DLT; local runner) |
| Metastore | `catalog-adapter` (Unity Catalog; OpenLineage for observed lineage) |
| Identity | `auth` (OIDC/SAML; group→role mapping) |
| Consumers / integrations | Events/webhooks (HMAC), SDK, CLI, OpenAPI, JSON Schema |
| SIEM | Audit stream |

---

## 11. Functional requirements

> IDs are stable for traceability. Priority: MUST unless noted.

### 11.1 Model & asset management (`FR-MA`)

- **FR-MA-001** The system MUST represent every asset kind (§9.1) as a versioned YAML
  contract stored in Git under a per-kind directory.
- **FR-MA-002** The system MUST parse and validate each contract into typed objects and
  reject structurally invalid contracts with actionable errors.
- **FR-MA-003** Each field MUST support: name, logical type, classification tier, PII flag,
  MNPI flag, PK flag, BK flag, FK reference, and description.
- **FR-MA-004** The system MUST expose every asset via the catalog and API
  (`GET /models`, `/models/{kind}/{id}`, `/registry`) and via the SDK and CLI.
- **FR-MA-005** The system SHOULD support authoring net-new asset kinds by extending the
  engine types, contracts directory, projection, and governance mappings (the established
  thread-through pattern).
- **FR-MA-006** The system MUST record asset ownership and status
  (`draft/active/deprecated`) and SHOULD prefer deprecation over deletion.

### 11.2 Versioning & registry (`FR-VR`)

- **FR-VR-001** Each asset MUST be independently **semantically versioned**.
- **FR-VR-002** The system MUST compute a **control surface** (structural fingerprint
  excluding cosmetic fields) and classify a change as `none/patch/minor/major`.
- **FR-VR-003** A change whose severity exceeds its declared version bump MUST fail a
  **semver gate**; a version decrease MUST fail.
- **FR-VR-004** The registry (`registry.lock.json`) MUST record each asset's version,
  surface, and signature and MUST be regenerable from the contracts.
- **FR-VR-005** Severity rules per kind MUST reflect breaking semantics (e.g., removing a
  BDM field, dropping an extract column, removing/altering a mapping or DQ rule, or changing
  a refmap entry is **major**; additive changes are **minor**).

### 11.3 Governance & change control (`FR-GC`)

- **FR-GC-001** All asset change MUST occur through a **ChangeSet** (proposal containing
  edits, a computed diff, impact, gates, and required approvals).
- **FR-GC-002** ChangeSet gates MUST include: structural validity, referential integrity,
  classification coverage, semantic-version adequacy, and propagation completeness.
- **FR-GC-003** **Maker/checker + SoD**: the author of a ChangeSet MUST NOT approve or merge
  it (admins excepted only where explicitly configured).
- **FR-GC-004** **Risk-based quorum**: major/breaking changes MUST require ≥2 domain
  approvals (including the domain owner).
- **FR-GC-005** **Classification escalation**: a change that adds/raises PII, MNPI, or tier
  sensitivity MUST require a separate governance approval.
- **FR-GC-006** Approval MUST NOT be grantable while any gate is red.
- **FR-GC-007** Merge MUST write to the Git SoR, re-register the lock, reconcile the
  projection, and append audit entries; a merge MUST be atomic in effect.
- **FR-GC-008** All ChangeSet lifecycle events MUST be captured in the immutable audit.

### 11.4 Federated operating model (`FR-FG`)

- **FR-FG-001** The system MUST support **domains** that own and propose their own models.
- **FR-FG-002** The system MUST provide enterprise roles **Chief Data Architect (CDA)** and
  **Architecture Review Board (ARB)** with a `change:signoff` capability.
- **FR-FG-003** The system MUST compute `requiresEnterpriseSignoff` via a **scope-aware
  routing policy**: enterprise sign-off is required for any BDM change, breaking/major
  change, new entity, cross-domain reference, classification change, or shared/conformed
  model.
- **FR-FG-004** When enterprise sign-off is required, domain quorum alone MUST NOT approve
  the change; a CDA/ARB sign-off MUST be recorded.
- **FR-FG-005** Routine, in-domain change (PDM tuning, docs, minor additive) MUST be able to
  complete at the domain tier without enterprise sign-off.
- **FR-FG-006** The routing policy MUST be configuration (graduated autonomy: the CDA widens
  domain autonomy as domains mature).
- **FR-FG-007** Standards MUST be enforced as code (the automated gates in FR-GC-002).

### 11.5 Access control & classification (`FR-AC`)

- **FR-AC-001** The system MUST enforce **attribute-level access** by combining a role's
  sensitivity-tier clearance with orthogonal PII and MNPI permissions.
- **FR-AC-002** Access decisions MUST be enforced consistently across API, semantic layer,
  warehouse (masking), and consumer extracts — driven from the single classification
  declaration.
- **FR-AC-003** The system MUST support RBAC **capabilities** (e.g., `catalog:read`,
  `model:propose`, `change:approve`, `change:signoff`, `change:merge`, `pipeline:deploy`,
  `governance:admin`, `audit:read`, `admin`) mapped from IdP groups.
- **FR-AC-004** The system MUST provide a role × attribute matrix view and a "view as role"
  capability that masks fields a role may not see.
- **FR-AC-005** Classification MUST propagate to Unity Catalog as column tags and masking
  policies at gold.

### 11.6 Lineage & impact analysis (`FR-LI`)

- **FR-LI-001** The system MUST maintain **column-level lineage** from upstream source →
  bronze → silver → gold → semantic → consumer.
- **FR-LI-002** Lineage MUST combine **static** lineage (from the models/mappings/
  transformations) with **observed** lineage (OpenLineage events from real runs), marking
  which edges are observed.
- **FR-LI-003** The system MUST answer **impact analysis** ("what breaks if I change this
  field/asset?") across downstream models, extracts, pipelines, and consumers.
- **FR-LI-004** Transformations and mappings MUST contribute their `from→to` edges (with
  transformation logic) and DQ sets/extracts their dependency edges.

### 11.7 Orchestration & pipelines (`FR-OR`)

- **FR-OR-001** The system MUST generate medallion pipelines from the models and deploy them
  via a pluggable orchestrator (Databricks Workflows/DLT in prod; local runner in dev).
- **FR-OR-002** The system MUST support trigger, run history, run metrics (rows in/out), and
  per-run lineage capture.
- **FR-OR-003** Production deploy MUST enforce four-eyes (a `pipeline:deploy` capability and
  an approver distinct from the requester).

### 11.8 Catalog, publication & consumption (`FR-PC`)

- **FR-PC-001** The catalog MUST present all assets grouped by domain with classification
  indicators and version/status.
- **FR-PC-002** The system MUST publish machine-readable contracts: per-model
  `schema.json` (with classification/PII/MNPI annotations), an access policy document, and a
  `/.well-known/dct.json` descriptor.
- **FR-PC-003** Consumers MUST be able to produce/consume via API, SDK, CLI, and events.
- **FR-PC-004** **Consumer extracts** MUST be first-class assets: a versioned contract of
  columns, filters, grain, and delivery, whose classification is derived by propagation and
  whose **breaking change notifies the consumer** (events).

### 11.9 Data quality (`FR-DQ`)

- **FR-DQ-001** DQ rule sets MUST be first-class governed assets attached to a target model.
- **FR-DQ-002** DQ rules MUST support at least: `not_null`, `unique`, `referential`,
  `range`, `regex`, `accepted_values`, `freshness`, each with a severity (`error/warn`).
- **FR-DQ-003** (Phased) The system SHOULD generate executable checks (dbt tests / DLT
  expectations) from DQ sets and record run results as audit/quality evidence on lineage
  nodes.

### 11.10 Transformations & mappings (`FR-TR`)

- **FR-TR-001** **Bronze→silver** logic MUST be captured as light `mapping` assets
  (rename + cast; field-level `target ← sources : logic`).
- **FR-TR-002** **Silver→gold** logic MUST be captured as graded `transformation` assets
  (`simple/medium/complex`) mirroring the canonical spec structure: **sources** (aliases +
  join clauses), **assembly** (UNION matrix + subqueries as governed SQL text),
  **key resolution** (polymorphic Entity/PK → DimID), **refmap references**, and a
  **transformation-mapping** table (each gold field ← silver attribute, a `logic` pattern,
  lookup dimension, refmap/join, and the bronze lineage tail).
- **FR-TR-003** The per-field `logic` MUST support the recurring patterns
  (`DIRECT / LITERAL / AUTO_SURROGATE / SCD2_START / SCD2_END / DIM_LOOKUP / REFMAP_LOOKUP /
  KEY_RESOLUTION`) and free expressions; bespoke SQL MUST be captured as governed text.
- **FR-TR-004** **RefMaps** (reference / key-resolution maps) MUST be standalone, reusable
  governed assets referenced by transformations.
- **FR-TR-005** Git/DCT is the **authoritative source**; the human-readable spec page MUST
  be a **generated view** of the governed asset.
- **FR-TR-006** Transformation assets MUST carry column-level lineage
  (bronze → silver → gold) per field.
- **FR-TR-007** (Phased) Export of the rendered spec to the documentation system, and
  SQL/DLT scaffolding for pattern-based fields, SHOULD be supported.

### 11.11 Events & notifications (`FR-EV`)

- **FR-EV-001** The system MUST emit domain events (e.g., `change.proposed` (breaking),
  `change.merged`, `model.registered`, `pipeline.run.completed`).
- **FR-EV-002** Webhook delivery MUST be **HMAC-signed**, retried, dead-lettered on failure,
  and replayable.
- **FR-EV-003** A breaking change to an asset consumed downstream MUST notify affected
  consumers.

### 11.12 Audit & evidence (`FR-AU`)

- **FR-AU-001** The system MUST maintain an **append-only, hash-chained, tamper-evident**
  audit log of every governance and lifecycle action, with actor, roles, action, subject,
  timestamp, and payload.
- **FR-AU-002** The audit MUST be independently verifiable (chain integrity check) and
  streamable to a SIEM.
- **FR-AU-003** Audit read MUST be restricted to authorized roles (`audit:read`).
- **FR-AU-004** The system SHOULD produce **per-change evidence bundles** (diff, approvals,
  gates, lineage, audit excerpt).

### 11.13 UI / UX (`FR-UI`)

- **FR-UI-001** The web app MUST provide: Catalog, Registry, Data model (ERD), Pipelines,
  Lineage, Access, and per-asset Detail pages.
- **FR-UI-002** The catalog MUST link each BDM to the ERD focused on that entity.
- **FR-UI-003** Each asset detail page MUST render kind-appropriate detail (e.g., BDM schema
  table; transformation spec; refmap entries) and dependencies, and MUST embed a compact,
  entity-focused ERD for BDMs.
- **FR-UI-004** The UI MUST follow a neutral corporate visual system (white surfaces, blue
  accent, subtle borders) suitable for enterprise use.

### 11.14 Interactive ERD (`FR-ERD`)

- **FR-ERD-001** The ERD MUST be **data-driven** — rendering whatever models the API
  returns, with no separate spec to maintain.
- **FR-ERD-002** Entities MUST be expandable to show fields with **PK** and **business-key**
  shading and classification/PII/MNPI indicators, and PK/business-key fields MUST be grouped
  first per the canonical field ordering (PK → business key → process date → decimal →
  integer → string → date → boolean → flags).
- **FR-ERD-003** Relationships MUST render as **orthogonal (right-angle) connectors that
  route around entity boxes** (obstacle-avoiding layout), with cardinality (`1` — `0..*`).
- **FR-ERD-004** Foreign keys MUST be clickable to traverse to the referenced entity;
  expanding an entity MUST recenter on it while keeping surrounding context (no overlap).
- **FR-ERD-005** The ERD MUST support natural zoom/pan, a "fit model" control, fullscreen,
  a "view as role" masking control, and deep-linking to a focused entity.
- **FR-ERD-006** The ERD MUST be embeddable in a **compact** mode (diagram only, with an
  integrated open-full-ERD and fullscreen control).
- **FR-ERD-007** The ERD MUST be packaged so a host application requires no additional
  runtime dependencies to embed it.

---

## 12. Non-functional requirements

- **NFR-PERF-001** Read APIs (catalog, model detail, lineage, registry) SHOULD return within
  interactive latency for the expected model volume (hundreds–low-thousands of assets).
- **NFR-PERF-002** The projection MUST be rebuildable from Git within an operationally
  acceptable window.
- **NFR-SCALE-001** The architecture MUST support scale-out of read/serving while remaining
  a single deployable for minimal-intervention installs (modular monolith → split later).
- **NFR-SEC-001** All access MUST be authenticated (OIDC/SAML) and authorized (RBAC+ABAC);
  no anonymous write.
- **NFR-SEC-002** Secrets MUST be provided by environment/secret store, never committed.
- **NFR-SEC-003** The audit MUST be tamper-evident (hash chain) and append-only.
- **NFR-AVAIL-001** The control plane SHOULD degrade gracefully if a backend (orchestrator,
  catalog) is unavailable (read/catalog remains available).
- **NFR-PORT-001** The platform MUST run from a single portable container with adapters for
  all external systems; local dev MUST run without Docker/DB (in-memory store + dev-auth).
- **NFR-OBS-001** The system MUST provide health/readiness endpoints and structured logs;
  observed lineage and run metrics MUST be captured.
- **NFR-MAINT-001** The engine MUST be a pure, unit-testable package; new asset kinds MUST
  be addable via a documented thread-through.
- **NFR-USE-001** The UI MUST be usable by non-engineers (stewards, governance) for review
  and discovery.
- **NFR-COMPAT-001** Interfaces MUST use open standards (OpenAPI, JSON Schema, OpenLineage)
  to interoperate with incumbent catalogs and tooling.
- **NFR-IP-001** Shared/reference materials MUST contain zero employer/client IP.

---

## 13. Security & compliance

- **Change control (SOX-style):** maker/checker, no self-approval, complete history.
- **BCBS 239:** column lineage + DQ evidence + ownership + traceability.
- **GDPR / CCPA (phased):** PII tagging, right-to-be-forgotten lineage map, residency.
- **Audit / e-discovery:** hash-chained log, signed evidence bundles.
- **v1 compliance bar:** immutable audit + segregation of duties; GDPR/BCBS-239/retention
  are designed-for add-ons (D7).
- **Segregation of duties, risk-based quorum, and classification escalation** are enforced
  by the governance engine (§11.3).

---

## 14. Data classification & handling

Sensitivity is a **tier** (`public < internal < confidential < restricted`) plus orthogonal
**PII** and **MNPI** tags, declared on each field. A role's clearance is `maxTier + pii +
mnpi`. Decisions (`decide(role, field)`) are enforced everywhere (§11.5) and propagate to
Unity Catalog tags/masks. Business keys (BK) and primary keys (PK) are first-class field
attributes distinct from classification.

---

## 15. Interfaces & APIs (indicative)

Read/publication: `GET /api/v1/models[?kind&domain]`, `/models/{kind}/{id}`,
`/models/{kind}/{id}/schema.json`, `/registry`, `/domains`, `/search`, `/access`, `/lineage`,
`/lineage/node`, `/lineage/impact/{id}`, `/.well-known/dct.json`.
Governance: `POST /changesets`, `GET /changesets[/{id}]`, `POST /changesets/{id}/approve|reject|merge`.
Pipelines: `GET /pipelines`, `/pipelines/{id}/runs`, `POST /pipelines/{id}/deploy|trigger`.
Events: `POST/GET /webhooks`, `GET /events`, `GET /webhooks/dlq`, `POST /webhooks/dlq/{id}/replay`.
Catalog sync: `GET /uc/plan`, `POST /uc/apply`. Audit: `GET /audit`. Ops: `/health`,
`/ready`, `POST /admin/reconcile`. A typed SDK and a CLI wrap these.

---

## 16. Roles & permissions (indicative matrix)

| Role | Key capabilities | Clearance (maxTier / PII / MNPI) |
|---|---|---|
| viewer | catalog:read | internal / – / – |
| modeler | + model:propose | internal / – / – |
| steward | + change:approve | confidential / ✓ / ✓ |
| domain_owner | + change:merge | confidential / ✓ / ✓ |
| platform_engineer | catalog:read, pipeline:deploy | confidential / – / ✓ |
| governance | change:approve, governance:admin, audit:read | restricted / ✓ / ✓ |
| chief_data_architect | + change:signoff, governance:admin, audit:read | restricted / ✓ / ✓ |
| architecture_review_board | change:approve, change:signoff | confidential / ✓ / ✓ |
| admin | all | restricted / ✓ / ✓ |

(Consumer "view-as" personas — public/analyst/trader/risk/compliance — govern masking in the
consumption/ERD surfaces.)

---

## 17. Assumptions, constraints & dependencies

- **Assumptions:** the organization operates a Databricks medallion lakehouse and Unity
  Catalog; robust BDMs/PDMs exist; a corporate IdP supports OIDC/SAML; a Git provider is
  available.
- **Constraints:** corporate network/firewall (dependencies may need an internal registry);
  zero-IP for shared materials; minimal-intervention install.
- **Dependencies:** Git provider, Postgres, Databricks workspace, Unity Catalog, IdP, SIEM.

---

## 18. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Complex transformations resist full structuring | Capture structure + governed SQL text; codegen phased |
| Large model sets clutter the ERD | Focus/ego views, layered obstacle-avoiding layout, layer toggles |
| Backend outage (orchestrator/catalog) | Adapters + graceful degradation; read/catalog stays up |
| Corporate firewall blocks dependencies | Internal registry / CA trust; portable pre-bundled artifacts |
| Governance perceived as a bottleneck | Federated autonomy + graduated autonomy + fast in-domain path |
| Scope creep | Phased delivery; each increment independently valuable |

---

## 19. Phasing & delivery approach

Delivery is incremental; each step ships running and is independently valuable.

1. **Now — control plane prototype:** GitOps spine, projection, read API, auth,
   governance, orchestration (local), column lineage, Unity Catalog plan, events,
   packaging; plus the interactive ERD and the governed asset kinds (mapping/dq/extract/
   transformation/refmap) and the business-key attribute.
2. **Next — wire live:** GitLab write path, Postgres, Databricks deploy, Unity Catalog
   apply/pull — one pilot domain.
3. **Then — scale & comply:** DQ execution + evidence, GDPR/BCBS-239 packs, retention/legal
   hold, more engines, multi-domain rollout, transformation SQL/DLT scaffolding, spec export.

---

## 20. Acceptance criteria (definition of done, indicative)

- A model change cannot reach production without passing all gates and maker/checker (+ CDA
  sign-off where required); the attempt and outcome are in the immutable audit.
- Column-level lineage and impact analysis return correct results for a seeded domain.
- Classification declared once masks correctly across API, semantic, warehouse, and extract.
- Each asset kind is versioned, governed, cataloged, and rendered.
- The platform stands up from a single deployable in a clean environment.
- The audit chain verifies; a per-change evidence bundle can be produced.

---

## 21. Traceability

Every functional requirement carries a stable `FR-<AREA>-NNN` identifier; NFRs carry
`NFR-<AREA>-NNN`. The team's BRD/FSD SHOULD maintain a traceability matrix mapping each
requirement to design elements, code modules, tests, and acceptance criteria. This document
is the authoritative requirement source; detailed designs live in the platform design docs
(Appendix B).

---

## 22. Appendices

### Appendix A — Asset contract schemas (summary)

- **BDM:** entity, label, group, grain, owner, source, version, status, upstream, fields[]
  (name, type, classification, pii, mnpi, pk, bk, fk), metrics[], dimensions[].
- **PDM:** pdm, bdm, version, status, owner, source, physical{table, loadStrategy,
  partitionBy, uniqueKey}.
- **Semantic:** semanticModel, version, sources[], dimensions[], measures[].
- **Source:** source, kind, label, cadenceDays, classification, produces[].
- **Mapping:** mapping, from{kind,id}, to{kind,id}, version, rules[]{target, sources[],
  logic}.
- **Transformation:** transformation, layer, complexity, target{kind,id}, version,
  sources[]{alias, entity, join}, assembly{union[], subqueries[]}, keyResolution[]{when,
  dim, dimId}, uses[] (refmap ids), fields[]{target, from, logic, lookupDim, refmap, join,
  bronze}.
- **RefMap:** refmap, version, keyType, source, entries[]{from, to}.
- **DQ:** dqRuleSet, target{kind,id}, version, rules[]{field|entity, type, ref, params,
  severity}.
- **Extract:** extract, consumer, version, from[]{kind,id}, grain, columns[]{name, from,
  classification}, filters, delivery{format, cadence, destination}.

### Appendix B — Detailed design references

- Platform design set: `docs/platform/00`–`13` (architecture, governance workflows, UI/UX,
  deployment/ops, edge-cases/ADRs, implementation roadmap, governed asset types,
  silver→gold transformations).
- Requirements SRS collection: `docs/requirements/01`–`07` (incl. FR-FG federated model).
- Operating model: `docs/operating-model/` (federated model + RACI).
- Delivery: `docs/delivery/` (epics + stories) and `docs/project-plan/`.
- ERD integration: `docs/erd-integration/`.

### Appendix C — Zero-IP note

All examples herein use a synthetic capital-markets domain (trade, position, instrument,
counterparty, currency and derived gold dimensions). No employer- or client-specific names,
schemas, tables, or data appear in this document or the reference implementation.
