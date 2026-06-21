# DEAL Control Tower — Project & Build Plan

A delivery plan for building DCT as a framework and standing it up in the
corporate environment. Estimates are in **sprints** (2 weeks) and **story points**
(team-relative); convert to calendar dates against your team's capacity. Sequencing,
dependencies, and acceptance gates are the durable part.

## 1. Objectives & success criteria

1. A running control plane that houses BDM/PDM/semantic models with governed,
   semantically-versioned change.
2. Metadata-driven medallion pipelines generated and orchestrated on Databricks.
3. Attribute-level access (tier + PII + MNPI), column-level lineage, and two-way
   Unity Catalog sync.
4. Maker/checker + segregation of duties + immutable audit (the v1 compliance bar).
5. A **federated operating model** — domains own and propose BDM/PDM changes; the
   **Chief Data Architect** signs off on enterprise-significant change (a top
   priority; see §3a and [operating model](../operating-model/FEDERATED-OPERATING-MODEL.md)).
6. Minimal-intervention install; one pilot domain live end to end.

**Definition of success:** the pilot domain's models drive a deployed Databricks
pipeline; a breaking change is proposed, gated, approved (maker/checker), merged,
and audited; consumers discover and bind to the resulting data product with
attribute-level masking — all evidenced in a running environment.

## 2. Workstreams

| WS | Workstream | Focus |
|----|-----------|-------|
| WS-A | Platform & engine | Monorepo, engine, projection, reconciler, API |
| WS-B | Governance & security | Auth, RBAC/ABAC, change control, audit |
| WS-C | Data integration | Git provider, Databricks/DLT, Unity Catalog, ingestion |
| WS-D | Experience | UI, SDKs, CLI, catalog/publication |
| WS-E | Platform ops | Packaging, IaC, CI/CD, observability, DR, security hardening |

## 3. Build sections (phases) & milestones

Each phase ends **runnable** and independently demonstrable.

### Phase P0 — Foundation *(1 sprint)* · WS-A, WS-E
- Monorepo (workspace + task runner), engine package, shared config/logging, CI.
- **Deliverables:** building monorepo; CI green; engine unit tests pass.
- **Milestone M0:** "Engine builds & tests in CI."

### Phase P1 — GitOps spine *(1–2 sprints)* · WS-A, WS-C
- Git adapter (local + GitLab); Postgres projection + migrations; reconciler
  (Git→projection, idempotent, rebuildable); read API; seed loader.
- **Deliverables:** models in Git appear via API; rebuild reproduces projection.
- **Milestone M1:** "Edit a model in Git → reconcile → served by the API."

### Phase P2 — Catalog, publication & experience *(2 sprints)* · WS-D
- Catalog/search, model detail, registry, interactive ERD; machine-readable
  contracts (JSON Schema/OpenAPI/JSON-LD); `.well-known`; TS + Python SDKs; CLI.
- **Deliverables:** consumers discover & read products; SDK/CLI round-trip.
- **Milestone M2:** "Discover and consume a data product via UI + SDK."

### Phase P3 — Identity, access & federation roles *(1–2 sprints)* · WS-B
- OIDC/SAML + sessions; API keys/service principals; RBAC capabilities; ABAC
  clearance (tier + PII + MNPI); group→role mapping; Postgres RLS; admin config.
- **Federation:** domains as first-class (`domain.yaml`/`CODEOWNERS`/group mapping);
  domain-scoped steward/owner roles; **Chief Data Architect (CDA)** and ARB roles;
  model `scope` (domain/shared/enterprise).
- **Deliverables:** SSO login; masked reads by role; RLS enforced; domains + CDA role configured.
- **Milestone M3:** "Attribute-level access enforced; domains & CDA role in place."

### Phase P4 — Governance, workflow & federated sign-off *(2–3 sprints)* · WS-B *(core differentiator)*
- ChangeSets; gates (engine checks + semver); maker/checker + SoD + quorum +
  PII/MNPI escalation; merge→reconcile→re-register; immutable hash-chained audit;
  ChangeSet review UI; models-repo CI + branch protection.
- **Federated operating model (priority):** scope-aware **routing-policy engine**;
  **CDA / ARB enterprise sign-off** tier; **CDA review queue/dashboard**; conformed-
  model protection; standards-as-code gates; SLA + escalation; two-tier audit.
- **Deliverables:** the end-to-end governed-change scenario passes **including domain
  approval → CDA sign-off** for a BDM change.
- **Milestone M4:** "BDM change: domain-proposed, domain-approved, CDA-signed-off, merged, audited."

### Phase P5 — Orchestration *(2 sprints)* · WS-C
- Orchestration adapter (local + Databricks Workflows/DLT via Asset Bundles);
  deploy/trigger/monitor; run tracking + metrics; DQ expectations; environments;
  four-eyes prod deploy; pipeline console.
- **Deliverables:** a model change deploys + runs a pipeline; runs tracked.
- **Milestone M5:** "Model change generates & deploys a Databricks pipeline."

### Phase P6 — Lineage & Unity Catalog *(2 sprints)* · WS-C, WS-D
- Column-level lineage (static + OpenLineage); impact analysis; lineage explorer;
  UC push (schemas/tags/masks), pull/import, drift detection.
- **Deliverables:** column lineage source→consumer; UC tags/masks applied; drift alerts.
- **Milestone M6:** "Lineage + Unity Catalog two-way sync operating."

### Phase P7 — Events & webhooks *(1 sprint)* · WS-A, WS-D
- Event log/outbox; HMAC webhook delivery with retries/DLQ/replay; subscriptions;
  breaking-change notifications; notification channels.
- **Milestone M7:** "Subscribers notified of breaking changes; DLQ + replay work."

### Phase P8 — Hardening, packaging & operations *(1–2 sprints)* · WS-E
- Docker/compose, Helm, Terraform, Databricks-App bundle, first-run wizard;
  observability dashboards/alerts; backup/restore + chaos drills; SCA/SBOM/signing;
  threat-model review; runbooks; docs.
- **Milestone M8 (GA-ready):** "Clean-room install < 1 hr; HA on k8s; restore drill passes."

### Phase P9 — Compliance packs *(post-GA, phased)* · WS-B, WS-C
- GDPR (purpose/lawful-basis tags, RTBF lineage propagation, residency), BCBS 239
  evidence/coverage, retention + legal hold; additional engines/catalog federation;
  multi-domain rollout.

## 3a. Federated operating model (priority workstream)

A top-priority, cross-cutting concern delivered mainly in **P3 (roles/domains)** and
**P4 (routing + CDA sign-off)**, tracked under epic **DCT-EP11**. Full proposal:
[`../operating-model/FEDERATED-OPERATING-MODEL.md`](../operating-model/FEDERATED-OPERATING-MODEL.md).

- **Operating model:** domains own and propose BDM/PDM change (tier-1 maker/checker);
  the **Chief Data Architect** signs off on enterprise-significant change (tier-2),
  with optional ARB delegation and graduated autonomy.
- **Technical infrastructure:** domains as first-class; CDA/ARB roles; model `scope`
  (domain/shared/enterprise); a configurable **routing-policy engine**; a **CDA
  review queue**; standards-as-code gates; conformed-model protection; two-tier
  immutable audit.
- **Non-technical readiness (parallel track):** appoint the CDA; charter the ARB;
  define initial domains + owners; agree the routing matrix and enterprise standards.
- **Acceptance:** a BDM change is proposed by a domain, approved by the domain
  steward, escalated, and **signed off by the CDA** before merge — evidenced in audit.

## 4. Indicative schedule

| Phase | Sprints | Cumulative |
|-------|---------|------------|
| P0 | 1 | S1 |
| P1 | 1.5 | S2–S3 |
| P2 | 2 | S3–S5 |
| P3 | 1.5 | S5–S6 |
| P4 | 2.5 | S6–S9 |
| P5 | 2 | S9–S11 |
| P6 | 2 | S11–S13 |
| P7 | 1 | S13 |
| P8 | 1.5 | S13–S15 |
| **MVP/GA** | **~15 sprints (~7–8 months @ 1 squad)** | |
| P9 | ongoing | post-GA |

Phases P2 and P3 can partially parallelize once P1 lands; P5/P6 can overlap with a
second pair. With two squads, GA compresses toward ~5 months.

## 5. Dependencies (critical path)

```
P0 → P1 → P2
          ↘ P3 → P4 → P5 → P6 → P7 → P8
P1 → P3 (auth needs the API)
P4 depends on P3 (identities for maker/checker) + engine gates (P0)
P5 depends on engine generators (P0) + P4 (governed deploy)
P6 depends on P5 (runs emit lineage) + P1 (projection)
```

**External dependencies:** GitLab project + bot identity; Databricks workspace(s) +
Unity Catalog + service principal; corporate IdP app registration; managed
Postgres; secrets manager; egress allow-listing / private networking.

## 6. Team & RACI

| Role | Indicative count | Primary phases |
|------|------------------|----------------|
| Tech lead / architect | 1 | all |
| Backend engineers | 2–3 | P0–P7 |
| Frontend engineer | 1 | P2, P4–P6 |
| Data/platform engineer (Databricks) | 1 | P5, P6 |
| DevOps/SRE | 1 (shared) | P0, P8 |
| Product owner / BA | 1 | all (backlog, acceptance) |
| Data governance SME | 0.5 (advisory) | P3, P4, P9 |

| Activity | R | A | C | I |
|----------|---|---|---|---|
| Requirements & acceptance | PO/BA | Tech lead | Governance SME | Stakeholders |
| Architecture & build | Engineers | Tech lead | DevOps | PO |
| Security & compliance design | Governance SME | Tech lead | Security team | Mgmt |
| Deployment & operations | DevOps | Tech lead | Platform team | PO |

## 7. Quality gates (per phase)

- All **Must** requirements for the phase met with passing acceptance criteria.
- Unit/integration/contract/e2e tests green in CI; typecheck + lint + boundary rules pass.
- Security scans (SCA, secret, banned-term) clean; SBOM produced.
- Demo of the phase's milestone in a running environment.
- Docs + runbooks updated; backlog re-groomed.

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Scope creep ("solve everything") | M | H | Strict phase gates; compliance packs explicitly post-GA |
| Two-store complexity (Git + Postgres) | M | M | Reconcile is the single convergence path; rebuild-from-Git tested continuously |
| Databricks/UC coupling | M | M | Adapter + local impl; integration tests flagged, not blocking |
| Corporate variance (IdP/Git/secrets) | M | M | Adapter interfaces; per-provider conformance tests |
| Environment access delays (workspace/IdP) | H | M | Local/in-memory paths keep delivery moving; wire live in P3/P5 |
| Adoption | M | H | Pilot domain, strong catalog UX, SDK/CLI, minimal-intervention install |
| Federation decision-rights unclear / CDA bottleneck | M | H | Encode routing as policy; standards-as-code reduce CDA load to judgment calls; graduated autonomy; ARB delegation; SLAs + escalation |
| Domain ownership gaps (ownerless models) | M | M | Ownership-as-data (`domain.yaml`/CODEOWNERS); ownerless-model report blocks publication |
| Key-person dependency | M | M | Pairing, ADRs, docs-as-you-go |

## 9. Governance of the project

- Two-week sprints; backlog in Jira (epics DCT-EP01–EP10).
- Each requirement linked to its story; traceability matrix regenerated per release.
- Phase demos as go/no-go gates with the product owner and governance SME.
- ADRs recorded for material decisions (template in the platform docs).
