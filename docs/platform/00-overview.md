# 00 — Overview, Vision & Principles

## 1. Problem statement

Large institutions run on data models they trust — Business Data Models (BDMs)
and Physical Data Models (PDMs) curated over years — but the layer that turns
those models into running pipelines, governed semantic layers, and published,
discoverable data products is **manual, fragmented, and drift-prone**:

- Models live in documents, wikis, and people's heads; versions are ambiguous.
- Pipelines are hand-built and re-built per source; the same change is made in
  three places and drifts.
- "Who approved this schema change?" and "what feeds this field?" have no
  authoritative answer.
- Consumers (BI, apps, data science, downstream domains) cannot reliably discover
  what exists, what it means, its sensitivity, or how to consume it.
- Classification (PII / MNPI), access control, and lineage are bolted on after the
  fact rather than flowing from the model.

**DEAL Control Tower** makes the model the control surface. A single governed model
definition — versioned, reviewed, classified — drives the pipeline, the semantic
layer, the warehouse serving, the access policy, the documentation, and the
machine-readable contracts. Change the model; everything downstream regenerates,
and governance proves the change was reviewed and propagated.

## 2. Vision

> One governed metadata control plane for the entire organization, where every
> data model is registered, versioned, reviewed, and published — and where
> pipelines, semantics, access, lineage, and documentation are *derived* from the
> model, not maintained beside it.

## 3. Goals (what success looks like)

1. **Single source of truth for models** — every BDM/PDM/semantic model is in the
   platform, semantically versioned, with a clear owner and lifecycle state.
2. **Metadata-driven pipelines** — medallion pipelines are generated and
   orchestrated from models; no hand-built, drifting ETL.
3. **Governed change** — every version change goes through maker/checker approval
   with segregation of duties and a tamper-evident audit trail.
4. **Self-service publish & consume** — domain teams publish models and data
   products; consumers discover and bind to them via catalog, API, SDK, CLI.
5. **Classification that flows** — PII/MNPI and sensitivity tiers are declared on
   the model and enforced everywhere (pipeline, warehouse masking, API, semantic).
6. **End-to-end lineage** — column-level lineage from upstream source through
   bronze→silver→gold to semantic models and consumers.
7. **Minimal-intervention install** — clone, configure a handful of env values,
   `docker compose up` (or `helm install`), and the platform is running.

## 4. Non-goals (explicitly out of scope, at least for v1)

- **Not a data-processing engine.** DEAL Control Tower orchestrates Databricks; it does
  not move or transform data itself.
- **Not a BI tool.** It publishes governed semantic models; visualization lives in
  the org's BI layer (which consumes from DEAL Control Tower).
- **Not a replacement for Unity Catalog's storage/compute governance.** It is a
  control plane *above* UC; it syncs with UC, it does not reimplement it.
- **Not a full DQ engine in v1.** It registers data-quality *contracts* and
  surfaces results; heavy DQ execution is delegated (Databricks/DLT expectations).
- **Not an MDM/golden-record system.** Entity resolution is out of scope (the
  generic reference deliberately omits it).

## 5. Personas

| Persona | Needs | Primary surfaces |
|---------|-------|------------------|
| **Data Modeler / Engineer** (maker) | Author & evolve BDM/PDM/semantic models; validate; simulate impact | Model editor, validation, diff, impact analysis |
| **Data Steward / Owner** (checker) | Review & approve version changes; own a domain; manage classification | Approval queue, review diff, policy admin |
| **Platform Engineer** | Generate & operate pipelines; manage environments & connectors | Pipeline console, environments, connectors |
| **Data Governance / Compliance** | Audit trail, SoD enforcement, classification coverage, lineage evidence | Audit log, governance dashboards, lineage |
| **Consumer (analyst / app dev / data scientist)** | Discover data products; understand meaning, sensitivity, freshness; bind via API/SDK | Catalog, data-product pages, API/SDK/CLI |
| **Domain Lead** | Federated ownership of a business domain's models & products | Domain workspace, ownership, metrics |
| **Administrator** | Tenancy, roles, IdP, retention, system config | Admin console |

## 6. Capability map

```
                          ┌─────────────────────────────────────────┐
                          │         DEAL CONTROL TOWER                │
                          │         (control plane)                   │
  ┌───────────┐  publish  │  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  consume  ┌───────────┐
  │ Modelers  │──────────▶│  │  Model   │  │ Workflow │  │ Catalog │ │──────────▶│ Analysts  │
  │ Stewards  │  (GitOps  │  │ Registry │  │ & Approv-│  │  & Docs │ │  (API/    │ Apps      │
  │ Domains   │   + UI)   │  │ +Versions│  │ als (SoD)│  │ +Lineage│ │   SDK/CLI)│ DS / BI   │
  └───────────┘           │  └────┬─────┘  └────┬─────┘  └────┬────┘ │           └───────────┘
                          │       │  generate   │             │      │
                          │  ┌────▼─────────────▼─────────────▼────┐ │
                          │  │  Engine: contracts → artifacts       │ │
                          │  │  (Databricks DLT, Cube, Snowflake,   │ │
                          │  │   catalog, access policy, registry)  │ │
                          │  └────┬─────────────────────────┬──────┘ │
                          └───────┼─────────────────────────┼────────┘
                                  │ orchestrate             │ sync
                          ┌───────▼─────────┐      ┌────────▼─────────┐
                          │ Databricks      │      │ Unity Catalog    │
                          │ Workflows / DLT │      │ (two-way)        │
                          └─────────────────┘      └──────────────────┘
```

Capabilities (each detailed in later docs):

- **Model management** — author/validate/version BDM, PDM, semantic models; glossary; data-quality contracts; access policy. → [02](02-domain-model.md)
- **Version governance** — lifecycle state machine, maker/checker, SoD, semver enforcement, immutable audit. → [03](03-governance-workflows.md)
- **Pipeline orchestration** — generate + deploy + trigger + monitor Databricks pipelines from models; run/lineage capture. → [04](04-pipeline-orchestration.md)
- **Publication & consumption** — catalog, docs, contracts, API/GraphQL/SDK/CLI, events/webhooks, open standards. → [05](05-apis-sdks-cli.md)
- **Security & compliance** — OIDC/SAML, RBAC/ABAC, secrets, audit, SoD, threat model. → [06](06-security-compliance.md)
- **Integration** — Unity Catalog two-way sync, upstream ingestion, connectors. → [08](08-databricks-integration.md)
- **Operations** — packaging, IaC, CI/CD, observability, DR, scaling. → [09](09-deployment-operations.md)

## 7. Design principles

1. **The model is the contract.** Everything downstream is generated; a change
   that stops at the model is incomplete (enforced by propagation checks).
2. **GitOps is the spine.** Definitions live in Git; the database is a fast,
   rebuildable projection. You can lose the database and rebuild it from Git.
3. **Classify once, enforce everywhere.** Sensitivity + PII/MNPI declared on the
   field flow into pipeline, masking, API, semantic, and lineage.
4. **Federated ownership, central governance.** Domains own their models; the
   platform enforces consistent process, policy, and audit.
5. **Adapters at every boundary.** Git provider, orchestration engine, catalog,
   IdP, secrets, and warehouse are all behind interfaces — swap without rework.
6. **Secure and auditable by default.** Deny-by-default access, maker/checker,
   tamper-evident audit, least privilege, no secrets in code.
7. **Minimal intervention.** Sensible defaults, one config file, automated
   migrations and bootstrap, health checks, and a "works out of the box" demo seed.
8. **Standards over lock-in.** OpenLineage, JSON Schema, OpenAPI, JSON-LD,
   SQL/DDL — so the platform federates rather than traps.
9. **Everything is observable and reversible.** Every action emits an event;
   every change can be traced, diffed, and rolled back via Git.

## 8. Relationship to the existing engine

The current `data-mesh-reference` already implements the **engine**: the contract
model, the generators (Databricks/Cube/Snowflake/catalog), the access policy, the
governance checks, the registry, and semantic versioning. DEAL Control Tower wraps that
engine in a **control plane** (services + UI + workflows + metastore + adapters).
The engine becomes `packages/engine`; nothing is thrown away. See
[01-architecture.md](01-architecture.md#monorepo-layout).

## 9. Glossary

| Term | Meaning |
|------|---------|
| **BDM** | Business Data Model — conceptual/logical model of a business entity, sourced from upstream |
| **PDM** | Physical Data Model — physical binding of a BDM (table, load strategy, partitioning, keys) |
| **Semantic model** | Governed consumption model — selected dimensions and measures over the curated layer |
| **Data product** | A published, consumable unit (schema + classification + lineage + access + docs) |
| **Contract** | The machine-readable definition of a model/product |
| **Control surface** | The structural fingerprint a model is versioned against |
| **Medallion** | Bronze (raw) → Silver (conformed) → Gold (curated) lakehouse layering |
| **Classification** | Sensitivity tier (public/internal/confidential/restricted) + PII/MNPI tags |
| **Maker/Checker** | Segregation of duties: the author of a change cannot approve it |
| **SoD** | Segregation of Duties |
| **Projection** | The Postgres read-model materialized from Git (the system of record) |
| **Domain** | A federated ownership area (data-mesh sense) |
| **Steward** | Accountable owner/approver for a domain's models |
| **Lineage** | The graph of how data flows from source through layers to consumers |
| **UC** | Databricks Unity Catalog |
