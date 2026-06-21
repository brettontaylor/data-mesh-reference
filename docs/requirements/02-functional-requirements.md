# 2. Functional Requirements

Normative keywords per RFC 2119. Priority: **M**ust / **S**hould / **C**ould / **W**on't-yet.

## 2.1 Model Management (FR-MM)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-MM-001 | M | The system SHALL support authoring of **BDM, PDM, and semantic** models as structured definitions (YAML), each carrying a model envelope: id, kind, version, status, owner, domain, description, tags. | A model of each kind can be created; the envelope fields persist and are retrievable. |
| FR-MM-002 | M | Each model SHALL be **independently semantically versioned** (`MAJOR.MINOR.PATCH`). | Two models can hold different versions; version is shown in registry/API. |
| FR-MM-003 | M | The system SHALL **validate** a model against the contract schema, reporting field-level errors (missing classification, invalid type, unknown reference). | Invalid model returns specific, line/field-level errors; valid model passes. |
| FR-MM-004 | M | The system SHALL enforce **referential integrity**: FKs resolve to an existing entity+field; PDM→BDM and semantic dimension/measure/source references resolve. | A dangling reference fails validation with a clear message. |
| FR-MM-005 | M | The system SHALL require a **classification** on every field; no permissive default is allowed. | A field with no classification fails validation. |
| FR-MM-006 | M | The system SHALL compute a model's **control surface** and classify a proposed change as none/patch/minor/major (breaking). | Changing a field type is reported as major; adding a field as minor; a description-only edit as patch. |
| FR-MM-007 | M | The system SHALL **simulate** a proposed change, returning the required version bump, downstream impact, and a preview of generated artifacts, without committing. | Simulate returns impact + required bump for a sample edit; no state change occurs. |
| FR-MM-008 | S | The system SHALL support a **business glossary** of terms linkable to model fields. | A term can be created and linked; the link is visible on the field. |
| FR-MM-009 | S | The system SHALL support **data-quality (DQ) contracts** on a model (nullability, ranges, referential, freshness, volume). | A DQ contract validates and is associated with its model. |
| FR-MM-010 | M | The system SHALL support model **lifecycle states**: draft → active → deprecated (with sunset date) → retired. | State transitions are enforced; an invalid transition is rejected. |
| FR-MM-011 | S | The system SHALL block **retiring** a model that still has active consumers/dependents. | Retire is rejected with the list of dependents until they migrate. |
| FR-MM-012 | M | The system SHALL maintain a queryable **version history** per model. | Prior versions and their change kind are retrievable. |
| FR-MM-013 | S | The system SHALL support **data products** that compose pinned model versions and expose SLA, access default, and endpoints. | A data product references models at version ranges and is published. |

## 2.2 Governance & Workflow (FR-GV)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-GV-001 | M | All model changes SHALL flow through a **ChangeSet** (proposal) that records author, edits, diff, impact, gate results, and approvals. | A ChangeSet is created on propose and exposes all listed fields. |
| FR-GV-002 | M | The system SHALL run **automated gates** on every ChangeSet: schema validity, referential integrity, classification coverage, semver governance, propagation completeness. | Each gate returns pass/fail with detail; approval is blocked while any required gate fails. |
| FR-GV-003 | M | The system SHALL enforce **semantic-versioning governance**: a content change must be matched by an adequate version bump; a version decrease is rejected. | A breaking change with an insufficient bump fails with the required next version. |
| FR-GV-004 | M | The system SHALL enforce **maker/checker**: the author of a ChangeSet SHALL NOT approve or merge it (segregation of duties). | Self-approval and self-merge are rejected (HTTP 403). |
| FR-GV-005 | M | The system SHALL enforce **risk-based quorum**: a breaking (major) change requires ≥2 approvals including the domain owner; minor/patch require ≥1 steward approval. | Quorum thresholds are enforced before a ChangeSet becomes approved. |
| FR-GV-006 | M | Any change that **adds/removes PII or MNPI**, loosens classification, or modifies the access policy SHALL require an additional **governance** approval. | Such a change is not approvable without a governance-role approval. |
| FR-GV-007 | M | The system SHALL provide a **maker/checker review** surface showing a side-by-side diff, classification deltas, impact tree, and gate status. | The review surface renders all listed elements for a ChangeSet. |
| FR-GV-008 | M | On merge, the system SHALL **re-register** the version baseline (lock), regenerate artifacts, and reconcile the projection. | After merge, the registry reflects the new version and generated artifacts update. |
| FR-GV-009 | M | The system SHALL maintain an **append-only, hash-chained audit log** of every state-changing action (propose, gate, approve/reject, merge, register, deploy, policy/role change, break-glass). | Each action emits an audit event; the chain verifies; tampering is detectable. |
| FR-GV-010 | S | The system SHALL support **break-glass** emergency change requiring dual administrator authorization, a written reason, and a time-box, raising a high-severity audit event and alert. | A break-glass action is recorded distinctly and alerts; single-admin attempts fail. |
| FR-GV-011 | M | Governance SHALL hold for changes made **directly in Git** (not only via the UI). | A direct merge request runs the same gates (CI) and is gated. |
| FR-GV-012 | S | The system SHALL compute **impact analysis** (downstream models, products, subscribers, pipelines) and require acknowledgement for breaking changes with active subscribers. | Impact is shown; a breaking change requires explicit acknowledgement to proceed. |

## 2.3 Pipeline Orchestration (FR-OR)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-OR-001 | M | The system SHALL **generate** medallion pipeline assets (bronze→silver→gold) from the models. | Editing a model regenerates the corresponding pipeline assets. |
| FR-OR-002 | M | Orchestration SHALL be **engine-pluggable** via an adapter; a Databricks (Workflows + DLT) implementation and a local in-process implementation SHALL be provided. | The same pipeline runs via the local adapter; the Databricks adapter targets a workspace. |
| FR-OR-003 | M | The system SHALL **deploy** generated pipelines to an environment (dev/staging/prod) idempotently. | Re-deploying an unchanged pipeline is a no-op; changes are applied in place. |
| FR-OR-004 | M | The system SHALL **trigger** a pipeline run (on-demand, scheduled by source cadence, or on-merge). | A triggered run executes and produces a tracked run record. |
| FR-OR-005 | M | The system SHALL **track runs** with status and metrics (rows in/out per layer, duration, DQ pass/fail, freshness). | A completed run exposes status + metrics via API and UI. |
| FR-OR-006 | S | The system SHALL generate **DQ expectations** from DQ contracts and surface results on runs. | A DQ contract produces expectations; pass/fail counts appear on the run. |
| FR-OR-007 | M | Production deploys SHALL require **four-eyes** (a distinct approver from the deployer). | A prod deploy without a distinct approver is rejected. |
| FR-OR-008 | S | The system SHALL support **environment promotion** (dev→staging→prod) applying the same generated assets per target. | Promotion deploys identical assets to the next target with environment-specific config. |
| FR-OR-009 | S | The system SHALL apply **retry, circuit-breaking, and alerting** to failing runs/deploys. | Repeated failures are circuit-broken and alerted, not retried forever. |
| FR-OR-010 | C | The system MAY support additional engines (Airflow, dbt) via the adapter. | A second engine adapter implements the interface without core changes. |

## 2.4 Lineage (FR-LN)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-LN-001 | M | The system SHALL build **column-level lineage** (source → bronze → silver → gold.column → semantic → consumer) from the models. | Lineage for a field resolves the full medallion chain. |
| FR-LN-002 | M | The system SHALL ingest **OpenLineage** run events and reconcile them with the static graph (observed vs declared). | After a run, the relevant edges are marked observed. |
| FR-LN-003 | M | The system SHALL support **upstream/downstream traversal** with depth control. | Traversal returns the correct node set for a given URN and direction. |
| FR-LN-004 | M | The system SHALL provide **impact analysis** for a model/field (everything derived from it). | Impact returns downstream models, products, and consumers. |
| FR-LN-005 | S | The system SHALL expose lineage in an **interactive explorer** and as machine-readable OpenLineage. | The UI renders the graph; the API returns OpenLineage-formatted lineage. |

## 2.5 Catalog & Publication (FR-CP)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-CP-001 | M | The system SHALL provide a **searchable catalog** of models and data products with faceting (domain, kind, status, classification, PII/MNPI, owner, tag). | Search returns matching items filtered by the listed facets. |
| FR-CP-002 | M | The system SHALL render a **model/product detail** view (schema, classification, versions, lineage, owner, contracts). | Detail view shows all listed elements for any model. |
| FR-CP-003 | M | The system SHALL publish **machine-readable contracts** per model/product: JSON Schema, OpenAPI, JSON-LD, OpenLineage. | Each artifact is retrievable and valid against its standard. |
| FR-CP-004 | M | The system SHALL publish a **capability descriptor** at `/.well-known/dct.json` (version, counts, capabilities, endpoints). | The descriptor is retrievable and accurate. |
| FR-CP-005 | S | The system SHALL show **data-product health** (freshness vs SLA, DQ status) on product pages. | Health reflects the latest run; SLA breaches are visible. |

## 2.6 Access Control & Classification (FR-AX)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-AX-001 | M | The system SHALL support a sensitivity tier set (**public/internal/confidential/restricted**) and orthogonal **PII** and **MNPI** tags on fields. | A field can hold a tier plus any combination of PII/MNPI. |
| FR-AX-002 | M | The system SHALL enforce **attribute-level access**: a field is visible to a principal only if its tier ≤ the principal's clearance, and (PII⇒role has PII) and (MNPI⇒role has MNPI). | Masking matches the decision rule across roles in tests. |
| FR-AX-003 | M | Attribute-level enforcement SHALL apply **consistently** in the API, semantic-layer queries, and catalog previews. | The same field is masked identically across all read surfaces for a given role. |
| FR-AX-004 | M | The system SHALL implement **RBAC** with roles (viewer, modeler, steward, domain_owner, platform_engineer, governance, **chief_data_architect**, **architecture_review_board**, admin) mapped from IdP groups. | Each role grants only its capabilities; group→role mapping is configurable; the CDA role holds enterprise sign-off authority (see FR-FG). |
| FR-AX-005 | M | Roles SHALL be **domain-scoped** where applicable (e.g., steward of a specific domain). | A domain-scoped steward cannot approve changes outside their domain. |
| FR-AX-006 | M | A masked measure SHALL NOT be computable by a role lacking clearance (no aggregate leakage). | A semantic query over an MNPI measure is blocked for an unauthorized role. |
| FR-AX-007 | S | Access decisions on sensitive data SHALL be **auditable** (which rule applied). | The audit/log records the governing reason for a mask/allow. |

## 2.7 Integration (FR-IN)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-IN-001 | M | Git provider integration SHALL be abstracted; a **GitLab** implementation and a **local** implementation SHALL be provided (branch, commit, MR, merge, webhook). | Reconcile reads the tree; the write path opens/merges an MR via the provider. |
| FR-IN-002 | M | The system SHALL **reconcile** Git → projection idempotently and support full rebuild from Git. | A rebuild reproduces the projection exactly from a given commit. |
| FR-IN-003 | M | The system SHALL **detect drift** between Git, the projection, models, and Unity Catalog, and alert. | An out-of-band change raises a drift alert. |
| FR-IN-004 | M | The system SHALL **push** models to Unity Catalog (schemas, classification/PII/MNPI tags, column masks, ownership). | A push plan is generated; applied tags/masks match the model. |
| FR-IN-005 | S | The system SHALL **pull/import** an existing Unity Catalog estate as candidate models. | Import produces candidate BDM/PDM skeletons for existing tables. |
| FR-IN-006 | M | Identity SHALL integrate via **OIDC/SAML**; API keys / service principals SHALL be supported for machines. | SSO login works; keys are scoped, hashed, and revocable. |
| FR-IN-007 | M | Secrets SHALL be sourced from a **secrets manager** via an adapter; no secret in code or Git. | The app reads secrets from the configured provider; a secret scan passes. |
| FR-IN-008 | M | The system SHALL emit **domain events** and deliver **webhooks** (HMAC-signed, retried, dead-lettered, replayable); breaking-change notifications SHALL be delivered to subscribers. | A subscriber receives a signed event; failures dead-letter and can be replayed. |
| FR-IN-009 | C | The system MAY publish events to **Kafka** in addition to webhooks. | A Kafka topic receives the event envelope (CloudEvents). |

## 2.8 Consumption Surfaces (FR-CN)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-CN-001 | M | The system SHALL expose a **versioned REST API** (`/api/v1`) for discovery, contracts, registry, lineage, access, and governance. | Documented endpoints respond per the OpenAPI spec. |
| FR-CN-002 | M | API responses SHALL be **access-governed** (attribute-level masking by the caller's clearance). | A keyed call returns masked fields per role. |
| FR-CN-003 | M | A **TypeScript SDK** and a **Python SDK** SHALL be provided for consumers. | Both SDKs round-trip read endpoints and respect masking. |
| FR-CN-004 | M | A **CLI** SHALL support validate, diff, propose, models/registry, simulate, generate, pipeline, lineage, login. | Each CLI command performs its documented function. |
| FR-CN-005 | S | The API SHALL provide cursor **pagination**, filtering, and field selection; errors SHALL follow RFC 9457 (problem+json). | Large result sets paginate; errors return structured problem documents. |
| FR-CN-006 | S | Mutating endpoints SHALL accept an **Idempotency-Key**. | A repeated mutating call with the same key is not double-applied. |

## 2.9 User Interface (FR-UI)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-UI-001 | M | The UI SHALL provide a **catalog/search**, **model detail**, **registry**, **lineage explorer**, **pipeline console**, **ChangeSet review**, **governance dashboards**, and **admin** surfaces. | Each surface is reachable and renders live data. |
| FR-UI-002 | M | The UI SHALL provide a **model editor** (form + YAML) with live validation, semver pre-check, and simulate. | Editing shows inline errors and the required version bump before proposing. |
| FR-UI-003 | M | The UI SHALL render an **interactive ERD** with expandable entities, FK connectors, and classification/PII/MNPI badges. | Entities expand to show attributes; FKs draw between entities. |
| FR-UI-004 | S | The UI SHALL be **WCAG 2.2 AA** accessible and keyboard-navigable; colour SHALL never be the only signal. | Accessibility checks pass; badges carry text labels. |
| FR-UI-005 | S | The UI SHALL surface **read-only data** to viewers and gate write actions by capability. | A viewer cannot see write controls; actions enforce capabilities. |

## 2.10 Administration (FR-AD)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-AD-001 | M | Administrators SHALL configure **IdP, group→role mapping, domains, environments, connectors** (Git, Databricks, secrets, notifications). | Config changes take effect without code changes. |
| FR-AD-002 | M | The system SHALL provide a **first-run bootstrap** (migrations, connectivity checks, optional seed, reconcile) and a guided setup wizard. | A fresh install reaches a working, explorable state with minimal steps. |
| FR-AD-003 | S | Administrators SHALL manage **retention** settings and export **audit/evidence** bundles. | Retention is configurable; an evidence bundle exports for a change. |
| FR-AD-004 | S | The system SHALL expose **health/readiness/version** endpoints and operational metrics. | Probes report status; metrics are scrapable. |
