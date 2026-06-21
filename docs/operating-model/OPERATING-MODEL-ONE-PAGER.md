# Federated Data Operating Model — One Page

**DEAL Control Tower** · How BDM/PDM change is owned, proposed, and approved

---

## The principle

**Domains own and propose their data models. The Chief Data Architect signs off on enterprise-significant change.** Autonomy within guardrails — not a free-for-all, and not a central bottleneck.

## Two tiers of control

| | **Tier 1 — Domain autonomy** | **Tier 2 — Enterprise sign-off** |
|---|---|---|
| **Who** | Domain modeler (maker) → domain steward / owner (checker) | Chief Data Architect, or the Architecture Review Board (delegated quorum) |
| **Decides** | Routine, in-domain change | Enterprise-significant change |
| **Examples** | PDM tuning, docs, minor additive fields, in-domain semantic models | Any BDM change · breaking change · new entity · cross-domain reference · classification (PII/MNPI/tier) change · shared / conformed models |
| **Outcome** | Completes at the domain tier | Requires CDA sign-off on top of domain approval |

## Roles

- **Domain modeler** — authors and proposes model changes (maker).
- **Domain steward / owner** — approves in-domain change; accountable for the domain's models (checker; owner cannot self-approve).
- **Chief Data Architect (CDA)** — accountable for enterprise coherence; signs off Tier 2 change; sets standards.
- **Architecture Review Board (ARB)** — delegated enterprise sign-off by quorum when the CDA delegates.
- **Governance / Compliance** — separate control approval for PII/MNPI and classification change.
- **Platform engineering** — operates merge, generation, and deployment.

## The lifecycle

**Propose (maker)** → **Standards gates (policy-as-code)** → **Domain approval (Tier 1)** → **CDA / ARB sign-off (Tier 2, when triggered)** → **Merge → reconcile → publish**

Every step is captured in an append-only, hash-chained audit log.

## Baked into the platform — not just policy

The operating model is enforced in code, not left to convention:

- **Roles** `chief_data_architect` and `architecture_review_board` with a `change:signoff` capability (RBAC/ABAC).
- **Scope-aware routing** computes `requiresEnterpriseSignoff` automatically (BDM change, breaking/major, new entity, or classification change) and **withholds approval until a CDA/ARB sign-off is recorded** — domain quorum alone cannot merge a Tier-2 change.
- **Standards-as-code** gates (schema, referential integrity, classification coverage, semver, propagation) run on every proposal.
- **Graduated autonomy** — the routing policy is configuration; the CDA widens domain autonomy as domains mature.

> Verified end-to-end: a domain quorum on a BDM change sits in review until the Chief Data Architect signs off; a PII change additionally requires a Governance approval. (`scripts/gov-e2e.mjs`)
