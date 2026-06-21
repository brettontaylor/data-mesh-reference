# Federated Operating Model for BDM / PDM Governance

A proposal for how Business and Physical Data Models are created, owned, and
changed across the organization — **domains own and propose; the Chief Data
Architect signs off** — and the technical infrastructure in DEAL Control Tower
(DCT) that makes the model run with control and at scale.

## 1. The problem this solves

Centralized modeling teams become a bottleneck; fully decentralized modeling
fragments the enterprise (duplicate entities, inconsistent classification, no
conformed dimensions). We need **autonomy with coherence**: domains move fast on
their own models, while an enterprise authority guarantees standards, reuse, and
sign-off on anything that affects the whole.

## 2. Operating principles (federated computational governance)

1. **Domain ownership.** Each domain owns, models, and proposes changes to its own
   BDMs and PDMs. The domain is accountable for its data products.
2. **Autonomy within guardrails.** Enterprise standards are encoded as **automated
   gates** (policy-as-code), so domains self-serve safely without waiting on a
   committee for routine change.
3. **Central architectural authority.** The **Chief Data Architect (CDA)** owns
   enterprise modeling standards, the conformed/shared model layer, and the
   classification policy — and provides **final sign-off** on enterprise-significant
   change. The CDA may delegate to an **Architecture Review Board (ARB)**.
4. **Human judgment where it matters.** Machines enforce the rules; people decide
   the judgment calls (new enterprise entities, breaking changes, classification,
   shared-model evolution).
5. **End-to-end accountability.** Every change records its domain proposer, domain
   approver, and (where required) the CDA sign-off — in an immutable audit trail.
6. **Graduated autonomy.** As domains mature, the CDA can delegate more change
   classes to the domain tier — the routing policy is configuration, not code.

## 3. Roles & decision rights

| Role | Owns | Decision right |
|------|------|----------------|
| **Data Modeler / Engineer** (domain) | drafting model changes | **Proposes** (maker) within their domain |
| **Domain Data Steward / Owner** | the domain's BDMs/PDMs, glossary, DQ, data products | **Approves** within-domain change (checker); accountable for the domain |
| **Platform Engineer** | physical deployment & environments | Approves/executes deploys; four-eyes on production |
| **Data Governance / Compliance** | classification policy, PII/MNPI controls | **Control approval** on sensitive-data change |
| **Chief Data Architect (CDA)** | enterprise standards, conformed/shared models, the model of record | **Enterprise sign-off** on significant change; standards authority |
| **Architecture Review Board (ARB)** | breadth of architectural review (chaired by CDA) | CDA-delegated sign-off by quorum |
| **Administrator** | platform configuration | Configures domains, roles, routing policy |

Maker/checker and **segregation of duties** apply at every tier: no one approves
their own change; the CDA cannot be the proposer of a change they sign off.

## 4. Ownership model

- The organization is divided into **domains** (e.g., Reference Data, Trading,
  Risk, Finance). Each domain is a first-class object with an owner group, SLAs,
  and a set of models.
- **Domain-scoped models** are owned and governed by the domain.
- **Conformed / shared / enterprise models** (e.g., shared dimensions, cross-domain
  reference entities) carry a `scope: shared|enterprise` flag and are **governed by
  the CDA**, with domains consuming them.
- Ownership is expressed as **data, not tribal knowledge**: `domain.yaml` +
  `CODEOWNERS` map Git paths and IdP groups to steward roles, which the platform
  uses to route reviews automatically.

## 5. Approval routing — the core of the model

Every change is a **ChangeSet**. The platform computes the required approvers from
the change's attributes. The default routing policy:

| Change attribute | Domain steward | CDA / ARB sign-off |
|------------------|:--------------:|:------------------:|
| PDM tuning / docs (patch, in-domain) | ✓ | — |
| Minor, in-domain (additive) | ✓ | — (notify) |
| **Any BDM change** | ✓ | **✓** |
| **Breaking / major change** | ✓ | **✓** |
| **Cross-domain reference** added/changed | ✓ (each affected domain) | **✓** |
| **New entity** introduced | ✓ | **✓** |
| **Classification change** (PII/MNPI, tier loosen) | ✓ | **✓ + Governance** |
| **Conformed / shared / enterprise** model | (consumer domains: consult) | **✓ (CDA owns)** |

Rationale: the **BDM is the enterprise's shared understanding of the business**, so
BDM change carries CDA sign-off by default; **PDM** (physical realization) is more
domain-autonomous. The matrix is **configurable** — the CDA tightens or relaxes it
as the program matures (graduated autonomy).

## 6. Change lifecycle (two-tier)

```
 Domain Modeler          Domain Steward            Chief Data Architect / ARB
 ─────────────           ──────────────            ───────────────────────────
   propose  ──►  automated gates ──►  domain review/approve ──►  [if routing requires]
                 (standards-as-code)   (tier 1, in-domain)        enterprise sign-off (tier 2)
                                                                        │
                                                                        ▼
                                                            merge → reconcile → publish
                                                            (every step in the audit trail)
```

- **Tier 1 (domain):** maker proposes; automated gates run; a domain steward
  (≠ author) approves. Routine change can complete here.
- **Tier 2 (enterprise):** when the routing policy requires it, the ChangeSet
  escalates to the **CDA review queue**; the CDA (or ARB quorum) signs off — or
  requests changes. Only then does it merge.
- **SLAs & escalation:** each tier has a review SLA; stale enterprise sign-offs
  escalate (reminder → ARB → CDA delegate). Break-glass (dual-admin, time-boxed,
  loudly audited) exists for emergencies.

## 7. Standards as code (what the CDA encodes once, enforced everywhere)

The CDA's standards are largely enforced **automatically**, so sign-off focuses on
judgment, not rule-checking:

- **Naming & structure** conventions (lint gates).
- **Classification coverage** — no unclassified field; tagged fields not in the
  open tier.
- **Reuse over duplication** — flag a new entity that overlaps a conformed model;
  encourage referencing the shared entity.
- **Semantic-versioning discipline** — breaking change requires a major bump.
- **Cross-domain integrity** — FK/reference resolution and impact surfaced before
  approval.
- **Conformed-model protection** — only the CDA can evolve `scope: shared/enterprise`.

## 8. Technical infrastructure in DCT (how it's supported)

| Capability | DCT mechanism |
|------------|---------------|
| Domains as first-class | `domain.yaml` + `CODEOWNERS`; IdP groups → domain steward roles |
| Enterprise authority | `chief_data_architect` + `architecture_review_board` roles with enterprise approval + standards-admin capability |
| Conformed/shared models | `scope: domain\|shared\|enterprise` on the model envelope; shared ⇒ CDA-governed |
| Approval routing | configurable **routing-policy engine** (scope + severity + classification + cross-domain → required approvers) |
| Enterprise sign-off | CDA **review queue / dashboard** of pending enterprise approvals across all domains, with SLA + escalation |
| Standards enforcement | enterprise standards as **automated gates** in the ChangeSet pipeline (and the models-repo CI) |
| Cross-domain awareness | lineage + impact analysis feed routing and CDA review |
| Accountability | immutable, hash-chained audit captures domain + enterprise tiers; per-change evidence bundle |
| Federation registry | catalog of domains, owners, conformed models, and pending sign-offs |

This is the same DCT governance engine (maker/checker + quorum + escalation +
audit) **extended with scope-aware routing and the CDA tier** — not a separate
system. The routing matrix in §5 is the configuration that encodes this proposal.

## 9. Adoption path

1. **Stand up the federation** — define initial domains + owners; appoint the CDA;
   seed enterprise standards as gates.
2. **Onboard a pilot domain** (e.g., Reference Data) — domain proposes, steward
   approves, CDA signs off on BDM/conformed changes.
3. **Tighten then graduate** — start with CDA sign-off on all BDM change; as domains
   demonstrate maturity, delegate lower-risk classes to the domain tier.
4. **Scale out** — onboard additional domains; the routing policy and standards stay
   central while execution stays federated.

## 10. Why this works

- Domains get **autonomy and speed** for routine change.
- The enterprise gets **coherence and control** — the CDA's standards are always on
  (as code), and the CDA holds the sign-off on anything that affects the whole.
- Governance is **provable** — every BDM/PDM change is traceable to its domain
  proposer, domain approver, and CDA sign-off, in a tamper-evident audit.

> See requirements [`FR-FG-*`](../requirements/07-federated-operating-model.md),
> governance design [`platform/03`](../platform/03-governance-workflows.md), and the
> delivery epic **DCT-EP11** in the [backlog](../delivery/jira-stories.md).
