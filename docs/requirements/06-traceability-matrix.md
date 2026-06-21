# 6. Traceability Matrix

Maps requirement groups → build phase (see the [project plan](../project-plan/PROJECT-PLAN.md))
→ Jira epic (see the [delivery backlog](../delivery/jira-stories.md)). This lets the
team prove coverage: every requirement is realized by a phase and tracked by a story.

## 6.1 Build phases

| Phase | Name |
|-------|------|
| P0 | Monorepo foundation |
| P1 | GitOps spine (reconciler, projection, read API) |
| P2 | Catalog, publication, UI, SDK/CLI |
| P3 | Identity & access (RBAC/ABAC) |
| P4 | Governance & workflow (maker/checker, audit) |
| P5 | Orchestration |
| P6 | Lineage & Unity Catalog sync |
| P7 | Events, webhooks, subscriptions |
| P8 | Hardening, packaging, operations |
| P9 | Compliance packs (GDPR / BCBS 239 / retention) — post-GA |

## 6.2 Epics

| Epic | Title |
|------|-------|
| DCT-EP01 | Platform foundation & monorepo |
| DCT-EP02 | GitOps spine & projection |
| DCT-EP03 | Catalog, publication & consumption (UI/SDK/CLI) |
| DCT-EP04 | Identity, RBAC & ABAC |
| DCT-EP05 | Governance, approvals & immutable audit |
| DCT-EP06 | Pipeline orchestration |
| DCT-EP07 | Lineage & Unity Catalog integration |
| DCT-EP08 | Events, webhooks & subscriptions |
| DCT-EP09 | Packaging, security hardening & operations |
| DCT-EP10 | Compliance packs (privacy, BCBS 239, retention) |
| DCT-EP11 | Federated operating model & enterprise (CDA) sign-off |

## 6.3 Requirement → phase → epic

| Requirement group | Phase | Epic |
|-------------------|-------|------|
| FR-MM Model management | P1–P2, P4 | DCT-EP02, DCT-EP03, DCT-EP05 |
| FR-GV Governance & workflow | P4 | DCT-EP05 |
| FR-OR Orchestration | P5 | DCT-EP06 |
| FR-LN Lineage | P6 | DCT-EP07 |
| FR-CP Catalog & publication | P2 | DCT-EP03 |
| FR-AX Access & classification | P3 | DCT-EP04 |
| FR-IN Integration | P1, P3, P6, P7 | DCT-EP02, DCT-EP04, DCT-EP07, DCT-EP08 |
| FR-CN Consumption (API/SDK/CLI) | P2 | DCT-EP03 |
| FR-UI User interface | P2, P4, P5, P6 | DCT-EP03, DCT-EP05, DCT-EP06, DCT-EP07 |
| FR-AD Administration | P3, P8 | DCT-EP04, DCT-EP09 |
| DR Data & classification | P1, P3 | DCT-EP02, DCT-EP04 |
| NFR Non-functional | P0, P8 (cross-cutting) | DCT-EP01, DCT-EP09 |
| CR Change control / audit | P4 | DCT-EP05 |
| CR Lineage/DQ, privacy, retention | P6, P9 | DCT-EP07, DCT-EP10 |
| FR-FG Federated governance (domain ownership, CDA sign-off, routing) | P3–P4 | DCT-EP11 (with DCT-EP04, DCT-EP05) |

## 6.4 Coverage check

Every FR/NFR/DR/CR in this set maps to at least one phase and one epic above.
During delivery, link each Jira story to its requirement IDs so the matrix can be
regenerated and gaps surfaced automatically.
