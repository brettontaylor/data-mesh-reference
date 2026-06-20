# DEAL Control Tower — Enterprise Metadata Management Platform

> **Product name:** **DEAL Control Tower** — the control plane over **DEAL** (the
> team's Data Enrichment & Abstraction Layer, the Databricks medallion data lake).
> It orchestrates the DEAL pipelines, governs the models that drive them, and gives
> org-wide oversight of everything flowing through the lake. Technical slugs: `dct`
> (CLI), `@dct/*` (packages), `dct.yaml` (config), `dct:` (URNs).
>
> **Repo strategy:** evolve `data-mesh-reference` into a monorepo. The current
> engine (contracts, generators, registry, access, governance) becomes
> `packages/engine`; the platform adds services, UI, adapters, and a metastore.
>
> **Boundary:** generic, open-source, **zero-IP**. Ships on GitHub; the bank
> clones it and stands it up internally with minimal intervention. No employer or
> client names, data, or proprietary schemas anywhere in the codebase.

This is the complete technical design, playbook, and implementation guide for a
metadata management and data-governance **control plane** that:

1. **Houses every model** — BDMs, PDMs, and semantic models — plus glossary,
   access policy, data-quality contracts, and lineage.
2. **Orchestrates the metadata-driven pipeline** — generates and drives Databricks
   medallion pipelines from the governed models.
3. **Enables model development** — authoring, validation, simulation, and review.
4. **Runs version governance** — maker/checker approval workflows with segregation
   of duties and an immutable audit trail.
5. **Publishes documentation and contracts** — so people and applications can
   *produce to* and *consume from* the end-to-end stack via API, SDK, and CLI.

## Locked architectural decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Source of truth | **GitOps** — Git holds model definitions; approvals are PRs |
| D2 | Metastore | **Postgres** materialized index/projection + **Unity Catalog** two-way sync |
| D3 | Runtime | **Portable Node.js container** (Docker) + Databricks SDK; also Databricks-App-packageable |
| D4 | Identity | **Corporate IdP (OIDC/SAML)** + app **RBAC/ABAC**, reusing the PII/MNPI access model |
| D5 | Orchestration | **Databricks Workflows + DLT** behind a **pluggable adapter** |
| D6 | Catalog posture | **Net-new**, integrating via **open standards** (OpenLineage, JSON Schema, OpenAPI, JSON-LD) |
| D7 | Compliance bar (v1) | **Immutable audit + segregation of duties**; GDPR / BCBS 239 / retention architected as extensible add-ons |
| D8 | Codebase | **Evolve `data-mesh-reference`** into a monorepo |

## Document index

| Doc | Covers |
|-----|--------|
| [00-overview.md](00-overview.md) | Vision, personas, capabilities, principles, glossary |
| [01-architecture.md](01-architecture.md) | System architecture, GitOps+Postgres+UC model, monorepo, tech stack, topology |
| [02-domain-model.md](02-domain-model.md) | Metadata domain model, Git layout (SoR), Postgres schema (projection), versioning |
| [03-governance-workflows.md](03-governance-workflows.md) | Lifecycle state machine, maker/checker, SoD, RBAC/ABAC, immutable audit |
| [04-pipeline-orchestration.md](04-pipeline-orchestration.md) | Orchestration adapter, Databricks Workflows/DLT, run tracking, lineage capture |
| [05-apis-sdks-cli.md](05-apis-sdks-cli.md) | API/GraphQL/SDK/CLI, publication & consumption, events/webhooks, open standards |
| [06-security-compliance.md](06-security-compliance.md) | AuthN/Z, secrets, network, audit, SoD, threat model, hardening, compliance mapping |
| [07-ui-ux.md](07-ui-ux.md) | Web app IA, key screens, lineage graph, design system, accessibility |
| [08-databricks-integration.md](08-databricks-integration.md) | Unity Catalog sync, upstream ingestion, connectors, reconciliation, edge cases |
| [09-deployment-operations.md](09-deployment-operations.md) | Packaging, IaC/Helm, config, CI/CD, observability, backup/DR, scaling, runbooks |
| [10-edge-cases-and-adrs.md](10-edge-cases-and-adrs.md) | Exhaustive edge-case catalog and architecture decision records |
| [11-implementation-roadmap.md](11-implementation-roadmap.md) | Phased delivery, work breakdown, testing strategy, acceptance criteria |

## How to read this

- **Executives / leads:** [00](00-overview.md) → [01](01-architecture.md) → [11](11-implementation-roadmap.md).
- **Architects:** [01](01-architecture.md) → [02](02-domain-model.md) → [03](03-governance-workflows.md) → [10](10-edge-cases-and-adrs.md).
- **Implementers:** [02](02-domain-model.md)–[09](09-deployment-operations.md) in order, then [11](11-implementation-roadmap.md).
