# 3. Non-Functional Requirements

Priority: **M**ust / **S**hould / **C**ould. Targets are initial baselines to be
confirmed against the corporate environment.

## 3.1 Performance (NFR-PERF)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-PERF-001 | M | Catalog/registry/model read APIs SHALL respond in **< 300 ms p95** for an estate of 10k models (served from the projection). | Load test meets the p95 target. |
| NFR-PERF-002 | M | Lineage upstream/downstream traversal (depth ≤ 5) SHALL respond in **< 800 ms p95**. | Load test meets the p95 target. |
| NFR-PERF-003 | S | Reconcile of a single changed model SHALL complete in **< 5 s**; full rebuild SHALL be chunked and resumable. | Incremental reconcile and rebuild meet targets on the reference estate. |

## 3.2 Scalability (NFR-SCALE)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-SCALE-001 | M | The app tier SHALL be **stateless** and horizontally scalable; all durable state in Postgres/Git/object store/Databricks. | Replicas can be added/removed with no loss of function. |
| NFR-SCALE-002 | M | The system SHALL support **≥ 10,000 models**, **≥ 100,000 fields**, and **≥ 100 domains** without redesign. | Reference-scale dataset loads and queries within performance targets. |
| NFR-SCALE-003 | S | Worker throughput SHALL scale by **queue depth** (autoscale). | Backlog drains as workers scale. |

## 3.3 Availability & Resilience (NFR-AVAIL)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-AVAIL-001 | M | The control plane SHALL target **99.5%** monthly availability for read/governance surfaces. | Uptime monitoring meets the target. |
| NFR-AVAIL-002 | M | A dependency outage (Databricks, Git provider, IdP) SHALL **degrade only the affected capability**, not the whole platform. | With each dependency down, unaffected surfaces keep working; affected ones fail gracefully. |
| NFR-AVAIL-003 | M | All asynchronous operations (reconcile, deploy, sync, webhook) SHALL be **idempotent** and safely retryable. | Re-running any job produces no duplicate/incorrect state. |

## 3.4 Security (NFR-SEC)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-SEC-001 | M | Access SHALL be **deny-by-default**; authorization layered as domain scope → role capability → attribute mask. | No grant ⇒ no access; precedence verified. |
| NFR-SEC-002 | M | All traffic SHALL be **TLS**; data at rest SHALL be encrypted (DB, object store). | TLS enforced; encryption confirmed. |
| NFR-SEC-003 | M | Row-Level Security SHALL enforce domain + clearance at the **database layer** as defence in depth. | Direct SQL cannot bypass domain/clearance scoping. |
| NFR-SEC-004 | M | The build SHALL include **dependency scanning, secret scanning, SBOM, and signed images**. | CI produces an SBOM and signed image; scans pass. |
| NFR-SEC-005 | M | No business data SHALL be **persisted** in the control plane; data-product reads proxy governed warehouse reads. | No raw business data found at rest in DCT stores. |
| NFR-SEC-006 | M | API access SHALL be **rate-limited** per principal and **audited**. | Excess requests get 429; access is logged. |

## 3.5 Auditability & Compliance (NFR-AUD)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-AUD-001 | M | The audit log SHALL be **append-only and tamper-evident** (hash-chained); a verifier SHALL detect any break. | UPDATE/DELETE blocked; verifier flags tampering. |
| NFR-AUD-002 | M | Audit events SHALL be **exportable** to the corporate SIEM (CloudEvents) and optionally WORM storage. | Events stream to SIEM; export verified. |
| NFR-AUD-003 | M | Every governed action SHALL be attributable to an **IdP-bound identity** (non-repudiation). | Each event carries actor identity + roles. |

## 3.6 Usability & Accessibility (NFR-USE)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-USE-001 | M | The UI SHALL meet **WCAG 2.2 AA**. | Automated + manual a11y checks pass. |
| NFR-USE-002 | S | Common modeler/reviewer tasks SHALL be achievable in **≤ 5 actions** from the relevant surface. | Task walkthroughs meet the action budget. |
| NFR-USE-003 | C | The UI SHALL be **i18n-ready** (string catalogs; locale-aware dates/numbers). | Strings externalized; a second locale can be added without code changes. |

## 3.7 Operability & Observability (NFR-OPS)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-OPS-001 | M | The system SHALL emit **OpenTelemetry** traces/metrics/logs (OTLP), with secret/PII-value redaction in logs. | Telemetry exports; logs contain no secret/PII values. |
| NFR-OPS-002 | M | The system SHALL expose **golden-signal** + domain metrics (reconcile lag, drift, approval cycle time, gate pass rate, run success/SLA, queue depth, audit-chain integrity). | Dashboards display the listed metrics. |
| NFR-OPS-003 | M | The system SHALL ship **health/readiness/version** endpoints and alert rules. | Probes and alerts function. |
| NFR-OPS-004 | S | Operational **runbooks** SHALL be provided (drift, key rotation, break-glass, restore, onboarding). | Runbooks exist and are followed in a drill. |

## 3.8 Portability & Deployment (NFR-PORT)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-PORT-001 | M | The platform SHALL run as a **single container** (role-selectable) deployable via docker-compose and Helm, and packageable as a **Databricks App**. | All three deployment modes start the app. |
| NFR-PORT-002 | M | First-run SHALL require **minimal intervention** (config + one command; automated migrations + bootstrap). | A clean-room install reaches a working state in < 1 hour. |
| NFR-PORT-003 | M | All external integrations SHALL be behind **adapters** (Git, orchestrator, catalog, IdP, secrets, notifications). | A provider can be swapped by configuration/implementation without core changes. |

## 3.9 Data Management & DR (NFR-DR)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-DR-001 | M | Model definitions SHALL survive total platform loss (**Git is the system of record**); the projection SHALL be rebuildable from Git. | After wiping the DB, rebuild restores the projection. |
| NFR-DR-002 | M | Operational state (workflow, audit, runs, lineage) SHALL be **backed up** (PITR); restore SHALL be tested, and the audit chain verified on restore. | A restore drill passes with audit-chain integrity intact. |
| NFR-DR-003 | S | The system SHALL document **RTO/RPO** targets and support multi-region active-passive. | Targets documented; failover procedure validated. |

## 3.10 Maintainability (NFR-MAINT)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| NFR-MAINT-001 | M | The codebase SHALL be a **typed monorepo** with enforced module boundaries (engine is pure/dependency-light). | Boundary lint + typecheck pass in CI. |
| NFR-MAINT-002 | M | The system SHALL ship **automated tests** (unit, integration, contract, e2e) and pass them in CI. | CI runs and passes the test suites. |
| NFR-MAINT-003 | S | DB migrations SHALL be **forward-only** and rolling-upgrade safe for one minor version. | A rolling upgrade across one minor succeeds with no downtime. |
