# 07 — UI / UX Design

The web app (Next.js, the existing design system) serves all personas with one
coherent surface. It talks only to the API. Reuses the brand tokens, the
classification/PII/MNPI badges, the role selector, and the interactive ERD already
built — those graduate from "demo" to "product."

## 1. Information architecture

```
/                         Home / org data overview (health, recent changes, my work)
/catalog                  Browse & search all models + data products (faceted)
/catalog/{kind}/{id}      Model detail: schema, classification, versions, lineage, docs
/products/{id}            Data product: contract, SLA/health, how-to-consume, subscribe
/model                    Interactive ERD (expandable entities + FK connectors)
/domains/{id}             Domain workspace: models, owners, SLAs, metrics
/changes                  ChangeSets: my drafts, my reviews, all (filter by domain/status)
/changes/{id}             Review: diff, classification deltas, impact tree, gates, approve
/editor/{kind}/{id}       Model editor (form + YAML, validation, simulate)
/pipelines                Pipeline console: list, schedules, health
/pipelines/{id}/runs      Run history + run detail (timeline, DQ, logs, lineage)
/lineage                  Lineage explorer (column-level graph, impact)
/glossary                 Business glossary
/governance              Dashboards: coverage, audit, SLAs, integrity, evidence export
/admin                    Tenancy, roles/IdP mapping, environments, connectors, retention
/settings                 Personal: tokens, notifications, theme
```

## 2. Key screens (detail)

### 2.1 Home / overview
Role-aware landing: **my work** (drafts, review queue, assigned changes), **org
pulse** (models by status, recent registrations, SLA breaches, drift alerts),
**quick actions** (propose change, search). For consumers it foregrounds discovery.

### 2.2 Catalog & search
Faceted search across models + products: filter by domain, kind, status,
classification, PII/MNPI, owner, tag, freshness. Each result shows version,
sensitivity summary, owner, and a health dot. Full-text over names/descriptions/
glossary. This is the consumer's front door.

### 2.3 Model detail
The current `/developers/[product]` page, productized: schema table with
classification + PII/MNPI badges, **version timeline** (with diffs between versions),
upstream/downstream **lineage** preview, owner/domain, glossary links, generated
**contracts** (schema.json / openapi / jsonld) download, and "consume" snippets
(SDK/CLI/REST). Role-aware masking applied to any data preview.

### 2.4 Interactive ERD (`/model`)
The expandable ERD already built: entities expand to reveal attributes, PK/FK
markers, classification, PII/MNPI; FK connector lines between entities; role
selector masks live; hover isolates relationships. Extended with: domain coloring,
filter to a domain/product, and click-through to model detail.

### 2.5 Model editor
Dual-mode: a **form editor** (add/edit fields, set types/classification/PII/MNPI,
keys, FKs, metrics, dimensions) and a **YAML editor** (power users), kept in sync.
Live **validation** (engine, inline errors), live **semver pre-check** ("this is a
breaking change → next version 3.0.0"), and **simulate** (preview generated DLT /
DDL / Cube / catalog + impact tree) before proposing. Saving creates a draft on a
branch; "Propose" opens the ChangeSet/PR.

### 2.6 ChangeSet review (the governance centerpiece)
- **Header:** title, author, domain(s), status, required quorum, gate summary.
- **Diff:** per-model side-by-side (form-level and YAML), with **classification
  deltas highlighted** ("`trade.price` newly MNPI", "`x` removed → breaking").
- **Impact tree:** downstream models, products, subscribers, pipelines; required
  acknowledgements.
- **Gates panel:** each gate green/red with detail; approval disabled until green.
- **Approvals:** approve / request changes / reject with comment; SoD enforced (the
  author can't approve; the control-function approval shows when required).
- Comments thread to the Git PR (two-way).

### 2.7 Pipeline console & run detail
List of pipelines with schedule, last run, health, env. Run detail: task timeline,
rows in/out per layer, DQ expectation results, freshness vs SLA, deep links to
Databricks logs, and the exact model versions/SHA the run executed.

### 2.8 Lineage explorer
Column-level graph: pick a field/table → upstream/downstream traversal with
depth control; transform labels on edges; filter by layer/domain; "impact mode"
highlights everything a change would touch. Backed by `lineage_*` + OpenLineage.

### 2.9 Governance dashboards
Classification coverage, ownerless models, overdue/at-risk changes, SLA breaches,
audit-chain integrity status, and **evidence export** (per-change bundle for
auditors). Read-restricted to governance/admin.

### 2.10 Admin
IdP config + group→role mapping, domain management, environment/connector config
(Databricks workspaces, Git provider, secret manager, notification channels),
retention settings, feature flags, and a guided **first-run wizard** (see [09](09-deployment-operations.md)).

## 3. Design system

- Reuse the Semantic Quay tokens (`globals.css` `@theme`), Fraunces/Inter/JetBrains
  Mono, and the existing components (`ClassificationBadge`, `TagBadge`,
  `RoleSelector`, ERD).
- Add: `VersionBadge`, `StatusPill`, `DiffView`, `ImpactTree`, `LineageGraph`,
  `GatePanel`, `RunTimeline`, `FacetedSearch`, `ModelForm`, `YamlEditor`
  (CodeMirror), `DomainPicker`.
- Consistent density, keyboard-first interactions for power users (modelers/
  reviewers live here all day), command palette (`⌘K`) for navigation + actions.

## 4. Accessibility & i18n

- WCAG 2.2 AA: semantic HTML, focus management, ARIA on graph/diagram interactions,
  contrast-checked tokens, reduced-motion support.
- Color is never the only signal (badges carry text; classification shown as
  label + color).
- i18n-ready (string catalogs); dates/numbers locale-aware; English default.

## 5. Performance & UX quality

- RSC/streaming for catalog and detail; cursor pagination; optimistic UI for
  draft edits; skeleton loaders; empty states with clear CTAs.
- Lineage/ERD graphs virtualized for large models; lazy-expand.
- Visual verification via Chrome MCP before shipping styling changes (existing
  workflow); no screenshots to the user — local validation.
