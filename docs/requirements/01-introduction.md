# 1. Introduction

## 1.1 Purpose

This document specifies the requirements for **DEAL Control Tower (DCT)**, a
metadata management and data-governance control plane. It is the authoritative
basis for design, build, test, and acceptance. It is written so a delivery team
can implement DCT — as a framework deployed into the corporate environment — with
minimal ambiguity.

## 1.2 Product scope

DCT governs the lifecycle of data models and the metadata-driven pipelines that
realize them on the DEAL lakehouse (Databricks medallion). It:

- Houses all model classes — **BDM** (business), **PDM** (physical), and
  **semantic** models — plus glossary, data-quality contracts, and access policy.
- Orchestrates the **metadata-driven medallion pipeline** (bronze → silver → gold)
  generated from those models.
- Enforces **governed change** — versioning, maker/checker approval, segregation of
  duties, and an immutable audit trail.
- **Publishes** documentation and machine-readable contracts so people and
  applications can produce to and consume from the end-to-end stack.
- Enforces **classification** (sensitivity tier + PII + MNPI) at the attribute level
  across pipeline, warehouse, semantic layer, and API.
- Maintains **column-level lineage** and two-way **Unity Catalog** synchronization.

### Out of scope (v1)
- DCT is **not** a data-processing engine (it orchestrates Databricks; it does not
  move/transform data itself).
- DCT is **not** a BI/visualization tool (it publishes governed semantic models that
  BI consumes).
- DCT does **not** replace Unity Catalog's storage/compute governance (it is a
  control plane *above* UC and syncs with it).
- DCT is **not** an MDM / entity-resolution system.

## 1.3 Stakeholders & user classes

| Class | Description | Key needs |
|-------|-------------|-----------|
| Data Modeler / Engineer (maker) | Authors & evolves models | author, validate, simulate, propose |
| Data Steward (checker) | Reviews & approves changes; owns a domain | review, approve, manage classification |
| Domain Owner | Federated owner of a domain's models & products | ownership, SLAs, retire |
| Platform Engineer | Generates & operates pipelines, environments | deploy, monitor, connectors |
| Data Governance / Compliance | Audit, SoD, classification authority | audit, evidence, policy |
| Consumer (analyst / app dev / data scientist) | Discovers & binds to data products | discover, consume, understand sensitivity |
| Administrator | Tenancy, identity, configuration | roles, IdP, retention, config |

## 1.4 Definitions

| Term | Meaning |
|------|---------|
| BDM | Business Data Model — versioned business entity, sourced upstream |
| PDM | Physical Data Model — physical binding of a BDM (table, load, partitioning, key) |
| Semantic model | Governed consumption model (dimensions + measures over the curated layer) |
| Data product | Published, consumable bundle (schema + classification + lineage + access + docs) |
| Control surface | The structural fingerprint a model is versioned against |
| Medallion | Bronze (raw) → Silver (conformed) → Gold (curated) layering |
| Classification | Sensitivity tier (public/internal/confidential/restricted) + PII / MNPI tags |
| Maker/Checker | Segregation of duties — the author of a change cannot approve it |
| Projection | The query-optimized read-model materialized from the Git system of record |
| Domain | A federated ownership area (data-mesh sense) |
| UC | Databricks Unity Catalog |

## 1.5 References

- Platform technical design: [`../platform/`](../platform/README.md) (00–11)
- Build/project plan: [`../project-plan/PROJECT-PLAN.md`](../project-plan/PROJECT-PLAN.md)
- Delivery backlog: [`../delivery/jira-stories.md`](../delivery/jira-stories.md)

## 1.6 Assumptions

- A Git provider (GitLab) is available to host the **models repository** (the
  system of record), with branch protection and merge-request APIs.
- A Databricks workspace with Unity Catalog is available for orchestration and
  catalog sync (per environment: dev/staging/prod).
- A corporate IdP (OIDC/SAML) provides identity; group membership drives roles.
- A managed PostgreSQL instance is available for the projection/operational store.
- A secrets manager is available for credentials.

## 1.7 Constraints

- **Zero proprietary content** in the open framework: generic, illustrative model
  content only; no real schemas, data, or employer-specific names in the codebase.
- **Portability:** the platform runs as a standalone container (also packageable as
  a Databricks App); no hard dependency on a single cloud.
- **Minimal intervention:** clone → configure a small set of values → one command to
  run, with automated migrations and bootstrap.
- **Open standards:** OpenLineage, JSON Schema, OpenAPI, JSON-LD, OIDC/SAML/SCIM.

## 1.8 Acceptance & sign-off

Each requirement carries testable acceptance criteria. A requirement is accepted
when its criteria are demonstrated in a running environment (automated test, API
response, UI behaviour, or generated artifact). Phase-level acceptance is defined
in the project plan; release sign-off requires all **Must** requirements met and
no open Sev-1/Sev-2 defects.
