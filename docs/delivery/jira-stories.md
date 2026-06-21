# DEAL Control Tower — Delivery Backlog (Jira)

Import `jira-stories.csv` into Jira (map **Epic Link** to Epic Name; **Story Points**, **Priority**, **Labels**, **Components** map directly). Below is the readable backlog. Priority shown as MoSCoW → Jira priority.

**10 epics · 57 stories · 302 story points**

## DCT-EP01 — Platform foundation & monorepo

_Monorepo, engine, shared libs, CI/CD scaffolding._  (4 stories · 18 pts)

### Set up monorepo workspace & task runner
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** foundation, P0
- **Description:** Establish pnpm workspaces + Turborepo + Changesets; shared tsconfig and lint with module-boundary rules.
- **Acceptance criteria:**
  - Workspace builds all packages
  - Boundary lint fails on illegal cross-imports
  - Changesets versioning configured
- **Requirements:** NFR-MAINT-001

### Establish engine package (contracts, generators, registry)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** foundation, P0
- **Description:** House the pure engine: contract types, generators, governance checks, semver, registry.
- **Acceptance criteria:**
  - Engine is dependency-light and unit-tested
  - No engine dependency on HTTP/DB
- **Requirements:** FR-MM-006, NFR-MAINT-001

### Shared config & structured logging
- **Priority:** M (High)  ·  **Points:** 3  ·  **Component:** Platform  ·  **Labels:** foundation, P0
- **Description:** Typed config loader (env + file), structured JSON logger with secret/PII redaction.
- **Acceptance criteria:**
  - Invalid config fails fast with a clear message
  - Logs contain no secret/PII values
- **Requirements:** NFR-OPS-001

### CI pipeline (build, test, scan, SBOM)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform Ops  ·  **Labels:** foundation, P0, security
- **Description:** PR pipeline: typecheck, unit, lint/boundary, SCA + secret scan, SBOM, signed image.
- **Acceptance criteria:**
  - CI runs on PR and blocks on failure
  - SBOM + signed image produced on main
- **Requirements:** NFR-SEC-004, NFR-MAINT-002

## DCT-EP02 — GitOps spine & projection

_Git as system of record; Postgres projection; reconciler; read API._  (6 stories · 32 pts)

### Git provider adapter (local + GitLab)
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Data Integration  ·  **Labels:** gitops, P1, integration
- **Description:** GitProvider interface with a local filesystem impl and a GitLab REST impl (read path; write path in EP05).
- **Acceptance criteria:**
  - readTree returns the model tree + a content sha
  - GitLab read path works against a test project
- **Requirements:** FR-IN-001

### Postgres projection schema & migrations
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** gitops, P1
- **Description:** Forward-only migrations for domain/model/field/version/edge + meta; each record carries source_sha.
- **Acceptance criteria:**
  - Migrations apply cleanly
  - Records carry source_sha
- **Requirements:** DR-011, NFR-MAINT-003

### Reconciler (Git → projection, idempotent)
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Platform  ·  **Labels:** gitops, P1
- **Description:** Materialize the Git tree into the projection; idempotent; full rebuild from a commit.
- **Acceptance criteria:**
  - Re-running reconcile yields identical projection
  - Rebuild reproduces projection exactly from a sha
- **Requirements:** FR-IN-002, NFR-DR-001

### Read API (domains, models, registry, search)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** gitops, P1, api
- **Description:** Fastify read endpoints over the projection with FTS.
- **Acceptance criteria:**
  - Documented read endpoints respond
  - Search filters by facets
- **Requirements:** FR-CP-001, FR-CN-001

### Seed loader & demo dataset
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Platform  ·  **Labels:** gitops, P1
- **Description:** Seed the models repo with a synthetic capital-markets domain for out-of-box exploration.
- **Acceptance criteria:**
  - Fresh install is explorable with seeded models
- **Requirements:** FR-AD-002

### Drift detection & alerting
- **Priority:** M (High)  ·  **Points:** 3  ·  **Component:** Platform  ·  **Labels:** gitops, P1, ops
- **Description:** Detect divergence between Git head and the projection; alert when stale.
- **Acceptance criteria:**
  - Out-of-band commit raises a drift alert
- **Requirements:** FR-IN-003

## DCT-EP03 — Catalog, publication & consumption

_Catalog/UI, contracts, SDKs, CLI._  (6 stories · 30 pts)

### Catalog & faceted search UI
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, ui
- **Description:** Browse/search models & products with facets (domain, kind, status, classification, PII/MNPI, owner).
- **Acceptance criteria:**
  - Search returns filtered results
  - Facets work as specified
- **Requirements:** FR-CP-001, FR-UI-001

### Model/product detail view
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, ui
- **Description:** Schema (with classification + PII/MNPI), versions, lineage refs, owner, contracts.
- **Acceptance criteria:**
  - Detail view renders all elements
  - Contracts are downloadable
- **Requirements:** FR-CP-002, FR-CP-003

### Interactive ERD
- **Priority:** S (Medium)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, ui
- **Description:** Expandable entities, FK connectors, classification badges, role-aware masking.
- **Acceptance criteria:**
  - Entities expand to attributes
  - FK connectors render between entities
- **Requirements:** FR-UI-003

### Machine-readable contracts & .well-known
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, api
- **Description:** Generate JSON Schema/OpenAPI/JSON-LD per model + capability descriptor.
- **Acceptance criteria:**
  - Each artifact is retrievable and valid
  - /.well-known/dct.json is accurate
- **Requirements:** FR-CP-003, FR-CP-004

### TypeScript & Python SDKs
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, sdk
- **Description:** Typed clients for read endpoints honoring masking.
- **Acceptance criteria:**
  - Both SDKs round-trip reads
  - Masking respected in SDK responses
- **Requirements:** FR-CN-003

### CLI (validate, diff, propose, simulate, generate, pipeline, lineage)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** experience, P2, cli
- **Description:** Operator/CI CLI wrapping engine + API.
- **Acceptance criteria:**
  - Each command performs its function
  - CLI usable in CI
- **Requirements:** FR-CN-004

## DCT-EP04 — Identity, RBAC & ABAC

_OIDC/SAML, roles, attribute-level access._  (6 stories · 34 pts)

### OIDC/SAML login & sessions
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** security, P3, auth
- **Description:** Authenticate via corporate IdP; short-lived sessions; logout.
- **Acceptance criteria:**
  - SSO login works
  - Sessions expire and refresh
- **Requirements:** FR-IN-006, CR-040

### API keys / service principals
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** security, P3, auth
- **Description:** Issue scoped, hashed, revocable machine credentials.
- **Acceptance criteria:**
  - Keys are scoped + revocable
  - Keys hashed at rest, shown once
- **Requirements:** FR-IN-006, NFR-SEC-006

### RBAC capabilities & group→role mapping
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** security, P3, auth
- **Description:** Roles from IdP groups; capability checks on endpoints; domain scoping.
- **Acceptance criteria:**
  - Each role grants only its capabilities
  - Domain-scoped roles enforced
- **Requirements:** FR-AX-004, FR-AX-005

### ABAC attribute-level masking engine
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** security, P3
- **Description:** Enforce tier + PII + MNPI per attribute across API, semantic, catalog.
- **Acceptance criteria:**
  - Masking matches the decision rule across roles
  - Masked measures are not computable
- **Requirements:** FR-AX-002, FR-AX-003, FR-AX-006, DR-022

### Row-Level Security (defence in depth)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** security, P3
- **Description:** Postgres RLS enforcing domain + clearance on read models.
- **Acceptance criteria:**
  - Direct SQL cannot bypass scoping
- **Requirements:** NFR-SEC-003, CR-041

### Admin: IdP config, role mapping, domains
- **Priority:** M (High)  ·  **Points:** 3  ·  **Component:** Governance & Security  ·  **Labels:** security, P3, admin
- **Description:** Admin surfaces for identity/role/domain configuration.
- **Acceptance criteria:**
  - Config changes take effect without code changes
- **Requirements:** FR-AD-001

## DCT-EP05 — Governance, approvals & immutable audit

_ChangeSets, gates, maker/checker, audit._  (9 stories · 58 pts)

### ChangeSet model & lifecycle state machine
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4
- **Description:** Proposal wrapping edits with diff/impact/gates/approvals; draft→in_review→approved→merged/rejected.
- **Acceptance criteria:**
  - A ChangeSet exposes diff, impact, gates, approvals
  - Invalid transitions rejected
- **Requirements:** FR-GV-001, FR-MM-010

### Automated gates pipeline
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4
- **Description:** Run schema, referential, classification, semver, propagation gates on each ChangeSet.
- **Acceptance criteria:**
  - Each gate returns pass/fail with detail
  - Approval blocked while a required gate fails
- **Requirements:** FR-GV-002, FR-GV-003

### Maker/checker + SoD + quorum
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4
- **Description:** No self-approval; risk-based quorum; PII/MNPI/policy governance escalation.
- **Acceptance criteria:**
  - Self-approval/merge rejected
  - Quorum + escalation enforced
- **Requirements:** FR-GV-004, FR-GV-005, FR-GV-006, CR-001, CR-002

### Immutable hash-chained audit log
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4, security
- **Description:** Append-only audit with chain verifier and SIEM stream.
- **Acceptance criteria:**
  - Chain verifies; tampering detectable
  - Events stream to SIEM
- **Requirements:** FR-GV-009, NFR-AUD-001, NFR-AUD-002

### Git write path (branch/commit/MR/merge)
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4, integration
- **Description:** Implement the GitLab write path; merge gate re-verified server-side.
- **Acceptance criteria:**
  - Propose opens an MR; approved MR merges
  - Server-side gate re-verifies at merge
- **Requirements:** FR-IN-001, FR-GV-008

### ChangeSet review UI
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** governance, P4, ui
- **Description:** Side-by-side diff, classification deltas, impact tree, gate status, approvals.
- **Acceptance criteria:**
  - Review surface renders all elements
  - Approve/reject with SoD enforced
- **Requirements:** FR-GV-007, FR-UI-001

### Models-repo CI & branch protection
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4
- **Description:** Reusable CI that runs gates on direct MRs; branch-protection templates.
- **Acceptance criteria:**
  - Direct MRs are gated
  - No-self-approve enforced in Git
- **Requirements:** FR-GV-011

### Impact analysis & breaking-change acknowledgement
- **Priority:** S (Medium)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4
- **Description:** Compute downstream impact; require ack for breaking changes with subscribers.
- **Acceptance criteria:**
  - Impact shown; ack required to proceed
- **Requirements:** FR-GV-012, FR-LN-004

### Break-glass emergency change
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Governance & Security  ·  **Labels:** governance, P4, security
- **Description:** Dual-admin override with reason + time-box + high-severity audit.
- **Acceptance criteria:**
  - Break-glass recorded distinctly + alerts
  - Single-admin attempts fail
- **Requirements:** FR-GV-010, CR-004

## DCT-EP06 — Pipeline orchestration

_Generate/deploy/run medallion pipelines._  (6 stories · 34 pts)

### Orchestration adapter (local + Databricks)
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Data Integration  ·  **Labels:** orchestration, P5, integration
- **Description:** Orchestrator interface; local in-process medallion; Databricks Workflows/DLT via Asset Bundles.
- **Acceptance criteria:**
  - Local adapter runs the medallion in CI
  - Databricks adapter targets a workspace
- **Requirements:** FR-OR-001, FR-OR-002

### Deploy / trigger / monitor pipelines
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Data Integration  ·  **Labels:** orchestration, P5
- **Description:** Idempotent deploy; on-demand/scheduled/on-merge triggers; run tracking + metrics.
- **Acceptance criteria:**
  - Re-deploy is a no-op for unchanged
  - Runs tracked with metrics
- **Requirements:** FR-OR-003, FR-OR-004, FR-OR-005

### DQ expectations from contracts
- **Priority:** S (Medium)  ·  **Points:** 5  ·  **Component:** Data Integration  ·  **Labels:** orchestration, P5
- **Description:** Generate DLT expectations from DQ contracts; surface results on runs.
- **Acceptance criteria:**
  - DQ pass/fail appears on runs
- **Requirements:** FR-OR-006, FR-MM-009

### Environments & four-eyes prod deploy
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Data Integration  ·  **Labels:** orchestration, P5, security
- **Description:** dev/staging/prod targets + promotion; distinct approver required for prod.
- **Acceptance criteria:**
  - Promotion deploys identical assets per target
  - Prod deploy without distinct approver rejected
- **Requirements:** FR-OR-007, FR-OR-008

### Pipeline console UI
- **Priority:** S (Medium)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** orchestration, P5, ui
- **Description:** List pipelines, schedules, run history + run detail.
- **Acceptance criteria:**
  - Console shows pipelines and runs with metrics
- **Requirements:** FR-UI-001, FR-OR-005

### Resilience: retry, circuit-break, alert
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Data Integration  ·  **Labels:** orchestration, P5, ops
- **Description:** Bounded retries, circuit-breaking on poison runs, alerting.
- **Acceptance criteria:**
  - Repeated failures circuit-break + alert
- **Requirements:** FR-OR-009, NFR-AVAIL-002

## DCT-EP07 — Lineage & Unity Catalog integration

_Column lineage + two-way UC sync._  (5 stories · 28 pts)

### Column-level static lineage
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Data Integration  ·  **Labels:** lineage, P6
- **Description:** Build lineage from the models (source→bronze→silver→gold.col→semantic).
- **Acceptance criteria:**
  - Lineage resolves the full chain for a field
- **Requirements:** FR-LN-001

### OpenLineage ingestion & reconciliation
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Data Integration  ·  **Labels:** lineage, P6, integration
- **Description:** Ingest run events; mark observed edges; reconcile vs static.
- **Acceptance criteria:**
  - Edges marked observed after a run
- **Requirements:** FR-LN-002

### Lineage traversal, impact & explorer UI
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Experience  ·  **Labels:** lineage, P6, ui
- **Description:** Upstream/downstream traversal, impact analysis, interactive explorer.
- **Acceptance criteria:**
  - Traversal + impact correct
  - Explorer renders the graph
- **Requirements:** FR-LN-003, FR-LN-004, FR-LN-005

### Unity Catalog push (schemas/tags/masks)
- **Priority:** M (High)  ·  **Points:** 8  ·  **Component:** Data Integration  ·  **Labels:** uc, P6, integration
- **Description:** Project models into UC: schemas, classification/PII/MNPI tags, column masks, ownership.
- **Acceptance criteria:**
  - Applied tags/masks match the model
  - Plan is generatable without a workspace
- **Requirements:** FR-IN-004

### Unity Catalog pull/import & reconcile
- **Priority:** S (Medium)  ·  **Points:** 5  ·  **Component:** Data Integration  ·  **Labels:** uc, P6, integration
- **Description:** Import existing UC estate as candidate models; detect & remediate drift.
- **Acceptance criteria:**
  - Import produces candidate models
  - Drift detected + remediable
- **Requirements:** FR-IN-005, FR-IN-003

## DCT-EP08 — Events, webhooks & subscriptions

_Event bus, webhooks, notifications._  (4 stories · 16 pts)

### Event bus & transactional outbox
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** events, P7
- **Description:** Domain events with an outbox; in-process subscribers.
- **Acceptance criteria:**
  - State-changing actions emit events
  - Outbox guarantees delivery
- **Requirements:** FR-IN-008

### Webhook delivery (HMAC, retry, DLQ, replay)
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform  ·  **Labels:** events, P7, integration
- **Description:** Signed delivery with retries, dead-letter, and replay.
- **Acceptance criteria:**
  - Subscriber receives a signed event
  - Failures DLQ and can be replayed
- **Requirements:** FR-IN-008, CR-045

### Subscriptions & breaking-change notifications
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Platform  ·  **Labels:** events, P7
- **Description:** Subscribe to products/event types; notify subscribers before a breaking merge.
- **Acceptance criteria:**
  - Subscriber notified of a breaking change
- **Requirements:** FR-GV-012, FR-IN-008

### Notification channels (email/Slack/Teams/in-app)
- **Priority:** C (Low)  ·  **Points:** 3  ·  **Component:** Platform  ·  **Labels:** events, P7
- **Description:** Adapter-based notifications for reviews, decisions, SLA breaches.
- **Acceptance criteria:**
  - Notifications delivered via configured channel
- **Requirements:** FR-IN-008

## DCT-EP09 — Packaging, hardening & operations

_Docker/Helm/IaC, security, observability, DR._  (8 stories · 34 pts)

### Container image & docker-compose
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8
- **Description:** Multi-role image (api/web/worker/all) + one-command compose stack.
- **Acceptance criteria:**
  - docker compose up brings up a working stack
- **Requirements:** NFR-PORT-001, NFR-PORT-002

### Helm chart & k8s deploy
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8
- **Description:** HA deployments, services, ingress, probes, secret refs, HPA.
- **Acceptance criteria:**
  - helm install deploys api/web/worker with probes
- **Requirements:** NFR-PORT-001, NFR-SCALE-001

### Databricks App bundle
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8
- **Description:** Package the image as a Databricks App for in-perimeter deploy.
- **Acceptance criteria:**
  - App deploys inside a workspace
- **Requirements:** NFR-PORT-001

### Terraform (UC namespaces + service principal)
- **Priority:** S (Medium)  ·  **Points:** 3  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8, iac
- **Description:** IaC for the data-plane side the platform governs.
- **Acceptance criteria:**
  - terraform apply provisions catalogs + SP
- **Requirements:** FR-AD-001

### Observability dashboards & alerts
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8
- **Description:** OTel traces/metrics/logs; golden-signal + domain dashboards; alert rules.
- **Acceptance criteria:**
  - Dashboards display the listed metrics
  - Alerts fire on threshold breach
- **Requirements:** NFR-OPS-002, NFR-OPS-003

### Backup, restore & DR drill
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8, security
- **Description:** PITR backups incl. audit chain; tested restore; chaos drills.
- **Acceptance criteria:**
  - Restore drill passes; audit chain verified
  - Dependency-outage drill degrades gracefully
- **Requirements:** NFR-DR-002, NFR-AVAIL-002

### Security hardening & threat-model review
- **Priority:** M (High)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** ops, P8, security
- **Description:** Pen-test fixes, STRIDE review, egress allow-listing, image signing.
- **Acceptance criteria:**
  - Threat model reviewed; mitigations tracked
  - Security checklist green
- **Requirements:** CR-044, NFR-SEC-004

### First-run wizard & runbooks
- **Priority:** M (High)  ·  **Points:** 3  ·  **Component:** Platform Ops  ·  **Labels:** ops, P8, docs
- **Description:** Guided setup; operational runbooks (drift, rotation, break-glass, restore, onboarding).
- **Acceptance criteria:**
  - Clean-room install < 1 hr
  - Runbooks followed in a drill
- **Requirements:** FR-AD-002, NFR-OPS-004

## DCT-EP10 — Compliance packs

_GDPR, BCBS 239, retention/legal hold (post-GA)._  (3 stories · 18 pts)

### Privacy pack (purpose tags, RTBF, residency)
- **Priority:** C (Low)  ·  **Points:** 8  ·  **Component:** Governance & Security  ·  **Labels:** compliance, P9, privacy
- **Description:** Purpose/lawful-basis tags; RTBF lineage propagation; residency-constrained deploys.
- **Acceptance criteria:**
  - RTBF produces a target list via lineage
  - Region-tagged products deploy only to matching regions
- **Requirements:** CR-021, CR-022, DR-025, DR-026

### BCBS 239 evidence pack
- **Priority:** C (Low)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** compliance, P9
- **Description:** Lineage-completeness scoring; DQ evidence bundles; ownership coverage.
- **Acceptance criteria:**
  - Coverage metric per domain
  - Evidence bundle exports
- **Requirements:** CR-010, CR-011, CR-013

### Retention & legal hold
- **Priority:** C (Low)  ·  **Points:** 5  ·  **Component:** Governance & Security  ·  **Labels:** compliance, P9
- **Description:** Configurable retention; WORM/legal-hold immutability; e-discovery export.
- **Acceptance criteria:**
  - Retention applied; held records immutable
  - Signed e-discovery export
- **Requirements:** CR-030, CR-031

