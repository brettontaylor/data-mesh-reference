# 10 — Edge Cases & Architecture Decision Records

A deliberately exhaustive catalog of enterprise edge cases with the platform's
answer, followed by the ADRs that lock the major decisions.

## Part A — Edge-case catalog

### A1. Modeling & versioning
| Case | Handling |
|------|----------|
| Two modelers edit the same model concurrently | Branch-per-change; PR merge conflict surfaced in UI; second author rebases; projection only updates post-merge |
| Breaking change proposed without version bump | Semver gate fails with the required version; PR blocked |
| Version decreased | Hard fail (`VERSION_DECREASE`) |
| Renaming a field (vs add+remove) | Treated as breaking (major); UI offers a "rename" affordance that records intent for lineage continuity |
| Circular FK / dependency | Detected at validation; allowed only if non-structural; cycles in derivation graph blocked |
| Same id across domains | IDs namespaced by domain; cross-domain references explicit |
| Deleting a model with downstream consumers | Blocked; must deprecate → sunset → retire after consumers migrate |
| Reviving a retired model | New version on the retired lineage; audit links the revival |
| Huge model (1000s of fields) | Field table flattening + pagination; editor virtualization |
| Non-semver version string | `BAD_SEMVER` error; cannot register |
| Lockfile and Git out of sync | Reconcile detects; `register` re-baselines; audited |

### A2. Classification, privacy & access
| Case | Handling |
|------|----------|
| New field defaults to no classification | Rejected (classification coverage gate) |
| PII/MNPI added to a field | Forces +1 governance approval; consumers re-evaluated; masks update everywhere |
| Loosening classification (confidential→public) | Treated as sensitive; requires governance approval + extra scrutiny |
| Restricted field used as a semantic dimension | Blocked (`RESTRICTED_DIMENSION`) |
| Consumer's clearance changes mid-session | Decisions are per-request; next call reflects new clearance |
| Conflicting role grants | Most-restrictive-wins on data; broadest capability for actions, but deny-by-default base |
| Masked value still inferable via aggregate | Semantic measures over masked source fields are blocked for that role (not just row masking) |
| RTBF request (GDPR add-on) | Lineage map → downstream delete tasks; platform records, warehouse executes |
| Cross-border data (residency) | Domain/product region tag → deploy only to matching target; sharded projection |

### A3. GitOps & source of truth
| Case | Handling |
|------|----------|
| Out-of-band commit to models repo | Reconciler + CI gates catch it; gates run on direct commits too; drift alert if projection lags |
| Force-push / history rewrite on models repo | Blocked by branch protection; detected by reconciler (SHA mismatch) and alerted |
| Git provider outage | Reads served from projection; proposals queue or fail gracefully; resume on recovery |
| Merge without required checks (misconfig) | Server-side merge gate re-verifies; refuses to register non-compliant state |
| Multiple models repos (per region/BU) | Supported via config; each maps to projection namespaces + domains |
| Very large repo / monorepo of models | Sparse checkout + chunked reconcile; partial reload by path |
| Signed-commit requirement | Bot + humans sign; unsigned commits flagged |

### A4. Projection / database
| Case | Handling |
|------|----------|
| Projection corrupted or behind | `reconcile --rebuild` from Git (SoR) restores it |
| Postgres failover mid-write | Idempotent jobs retry; outbox ensures events not lost; reconcile converges |
| Schema migration fails | Boot fails fast; previous version stays running (rolling upgrade) |
| Audit chain break detected | Alarm; investigation; backups include chain; no silent repair |
| Hot tables grow unbounded | Time-partition `audit_event`/`pipeline_run`; archival to object store |

### A5. Orchestration & pipelines
| Case | Handling |
|------|----------|
| Databricks workspace down | Orchestration degrades only; queued deploys/runs resume |
| Partial deploy failure | Bundle rollback; model state intact |
| Pipeline run flaps | Retry policy then circuit-break + alert; last good output served |
| Schedule overlap (run still running) | Skip-or-queue policy per pipeline; no concurrent same-pipeline runs |
| Upstream schema drift | Suggested ChangeSet; incompatible → quarantine batch + alert |
| Backfill vs incremental | Explicit backfill mode; idempotent; bounded windows |
| Cost runaway | Per-domain budget alerts; concurrency caps; DBU surfaced |
| Cross-pipeline dependency failure | Downstream waits/fails fast per DAG policy; clear root-cause in console |

### A6. Identity & access (operational)
| Case | Handling |
|------|----------|
| IdP outage | Existing sessions valid to expiry; new logins blocked; bootstrap admin (sealed) for emergency only |
| User removed from IdP group | Loses role on next token refresh; in-flight changes reassigned |
| Service principal key leaked | Revoke instantly; keys hashed; rotate; audit shows usage |
| Role escalation attempt | Roles only via IdP groups; admin changes dual-controlled + audited |
| Orphaned ownership (owner left) | Ownerless-model report; domain owner reassigns; governance can force |

### A7. Consumption & compatibility
| Case | Handling |
|------|----------|
| Consumer pins a version that gets deprecated | Notified with sunset date; can stay until retire; impact tracked |
| Breaking change to a subscribed product | Subscribers notified pre-merge (impact ack); events on merge |
| API consumer exceeds rate limit | 429 + `Retry-After`; per-principal quotas |
| Webhook endpoint down | At-least-once retries w/ backoff; dead-letter; replay tool |
| Two consumers need different masking | Per-request role; same endpoint, different governed view |
| Stale cached schema in a client | Events + `ETag`/version headers prompt refresh |

### A8. Scale & multi-tenancy
| Case | Handling |
|------|----------|
| 10k+ models, 100k+ fields | Projection indexing, pagination, search backend; chunked reconcile |
| Many domains, federated teams | Domain scoping + RLS; per-domain dashboards + quotas |
| Spiky review load | Worker autoscale; async gate execution; non-blocking UI |
| Global org, multi-region | Per-region shards; residency-aware orchestration; one logical catalog |

### A9. Disaster & corruption
| Case | Handling |
|------|----------|
| Total platform loss | Redeploy + reconcile from Git (definitions) + restore Postgres (workflow/audit) |
| Object store loss | Re-generate artifacts from models; archives versioned/replicated |
| Bad bulk migration | Reviewable ChangeSet; revert via Git; projection rebuild |
| Compromise suspected | Rotate all secrets; verify audit chain; replay events; forensic export |

### A10. Human/process
| Case | Handling |
|------|----------|
| Self-approval attempt | Blocked (SoD) at app + Git |
| Emergency change at 2am | Break-glass: dual admin, reason, time-box, loud audit + alert |
| Reviewer bottleneck | Quorum config + backup reviewers per domain; SLA on review cycle |
| Disagreement on a change | Request-changes loop; escalation to domain owner/governance |
| Knowledge loss / onboarding | Self-documenting models + glossary + lineage; runbooks; seed demo |

## Part B — Architecture Decision Records

> Format: Context → Decision → Consequences. These lock the choices made with the
> operator (D1–D8) plus key derived decisions.

### ADR-001 — GitOps as system of record (D1)
**Context:** Need auditable, diffable, reviewable, recoverable model history.
**Decision:** Git holds definitions; approvals are PRs; Postgres is a projection.
**Consequences:** + Trustworthy audit/DR, familiar review; − must build reconcile +
keep two stores convergent; rich queries come from the projection, not Git.

### ADR-002 — Postgres projection + Unity Catalog two-way sync (D2)
**Context:** Git can't serve fast queries/graphs; UC is the Databricks governance plane.
**Decision:** Materialize Git → Postgres for queries/workflow/audit; sync models ↔ UC.
**Consequences:** + Speed + Databricks-native governance; − reconciliation/drift
machinery; UC remains authoritative for storage/compute grants, we layer above.

### ADR-003 — Portable Node container + Databricks SDK (D3)
**Context:** Must stand up inside a corporate environment with minimal friction; also
work as a Databricks App.
**Decision:** Standalone Node/Docker is primary; Databricks App is a packaging.
**Consequences:** + Runs anywhere, easy local/CI; − we own auth/networking/hosting
that a pure Databricks App would inherit.

### ADR-004 — Corporate IdP (OIDC/SAML) + RBAC/ABAC (D4)
**Context:** Org-wide identity; classification-driven access already modeled.
**Decision:** SSO via IdP; roles from IdP groups; ABAC reuses the PII/MNPI engine.
**Consequences:** + No shadow accounts, central onboarding; − IdP dependency
(mitigated by session validity + sealed bootstrap admin).

### ADR-005 — Databricks Workflows/DLT behind an adapter (D5)
**Context:** Databricks is the target; avoid lock-in and enable CI/demo.
**Decision:** `Orchestrator` interface; Databricks impl now; `local` + future
Airflow/dbt impls.
**Consequences:** + Swap/extend engines; runnable without cloud; − adapter
abstraction overhead.

### ADR-006 — Net-new, open-standards integration (D6)
**Context:** No mandated incumbent catalog; want federation.
**Decision:** Emit/consume OpenLineage, JSON Schema, OpenAPI, JSON-LD, SCIM.
**Consequences:** + Federates with Collibra/Alation/Atlan/Purview later; − must
maintain standard conformance.

### ADR-007 — Compliance bar: immutable audit + SoD; others extensible (D7)
**Context:** Banking change-control is the must-have; privacy/retention are
important but phased.
**Decision:** Build append-only hash-chained audit + maker/checker now; design
GDPR/BCBS239/retention as drop-in extensions (tags, lineage map, WORM hook).
**Consequences:** + Focus + faster v1; − some compliance features are roadmap, not v1.

### ADR-008 — Evolve `data-mesh-reference` into a monorepo (D8)
**Context:** The engine already exists and is proven.
**Decision:** Monorepo; engine becomes `packages/engine`; add services/UI/adapters.
**Consequences:** + Reuse, single release train; − monorepo tooling + boundary
discipline required.

### ADR-009 — Modular monolith first (derived)
**Context:** Minimal-intervention stand-up vs microservice ops tax.
**Decision:** One deployable with strict internal module boundaries.
**Consequences:** + Simple ops, easy local; − must keep boundaries clean to allow
later extraction (enforced by lint/CI).

### ADR-010 — TypeScript everywhere + Python consumer SDK (derived)
**Context:** Node runtime (D3); engine is TS; data scientists use Python.
**Decision:** TS for engine/API/UI/CLI/TS-SDK; a thin Python SDK for consumers.
**Consequences:** + One core language, shared types; − maintain a second SDK surface.

### ADR-011 — Provider abstractions at every boundary (derived)
**Context:** Corporate variance in Git/IdP/secrets/warehouse.
**Decision:** Adapter interfaces for Git, IdP, secrets, orchestration, catalog,
notifications.
**Consequences:** + Portable, testable, swappable; − more interfaces to design/test.
