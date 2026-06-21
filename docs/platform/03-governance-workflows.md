# 03 — Governance, Workflows & Access Control

Compliance bar (D7): **immutable audit + segregation of duties**, designed so
GDPR / BCBS 239 / retention slot in later without rework.

## 1. Model lifecycle state machine

```
        ┌──────────┐   propose    ┌───────────┐  submit   ┌────────────┐
        │  (none)  │─────────────▶│   draft   │──────────▶│ in_review  │
        └──────────┘              └───────────┘           └─────┬──────┘
                                       ▲  ▲                     │
                          request_changes │                    │ approve (maker≠checker, quorum met)
                                       │  │                     ▼
                                  ┌────┴──┴────┐  merge   ┌────────────┐
                                  │  rejected  │◀─────────│  approved  │
                                  └────────────┘          └─────┬──────┘
                                                                │ merge PR
                                                                ▼
   ┌──────────┐  deprecate (sunset)  ┌──────────┐  retire   ┌────────────┐
   │ retired  │◀─────────────────────│deprecated│◀──────────│   active   │
   └──────────┘   (no consumers)     └──────────┘  (active in projection after reconcile)
```

- **draft** — author iterating; lives on a feature branch; not yet a candidate.
- **in_review** — ChangeSet open (PR open); reviewers assigned; gates running.
- **approved** — required approvals met; awaiting merge.
- **active** — merged + reconciled; the live version.
- **deprecated** — superseded; has a sunset date; still served with warnings.
- **retired** — no longer served; retained for audit/lineage history.
- **rejected/withdrawn** — terminal for that ChangeSet.

State transitions are the only way to change a model; each emits an audit event.

## 2. ChangeSet (the unit of governed change)

A **ChangeSet** wraps one PR and may touch several models. It carries:

- The Git branch + PR ref.
- The **control-surface diff** per model and the **required vs declared semver bump**.
- **Impact analysis**: downstream models, data products, subscribers, and pipelines
  affected (computed from `model_edge` + product subscriptions + lineage).
- **Gate results** (see §4).
- **Approvals** (who, when, decision, comment).

The UI renders a ChangeSet as a rich review: side-by-side model diff, classification
deltas (e.g., "field `x` newly tagged PII"), impact tree, and gate status — far
more legible than a raw YAML PR.

## 3. Maker/Checker & Segregation of Duties (D7)

Hard rules, enforced server-side **and** mirrored as branch-protection on the Git
provider (defense in depth):

1. **No self-approval.** `approval.approver != change_set.author`. Enforced in the
   governance service and as a required Git status check.
2. **Quorum by risk.** Required approvals scale with change severity and
   sensitivity:
   - `patch` within a domain → 1 steward approval.
   - `minor` → 1 steward approval.
   - `major` (breaking) → 2 approvals incl. the domain owner.
   - Any change that **adds/removes PII or MNPI**, or **loosens classification**, or
     touches `policy/access.yaml` → **+1 governance approval** (a second control
     function), regardless of severity.
3. **Domain authority.** Reviewers must belong to the domain's steward group
   (from `CODEOWNERS` / `domain.yaml`); cross-domain changes require each affected
   domain's approval.
4. **Four-eyes on production deploys.** Deploying a pipeline to `prod` requires a
   platform-engineer approval distinct from the model author.
5. **Break-glass** is possible but loud: an emergency override requires two admins,
   a written reason, a time-box, and emits a high-severity audit + alert.

A configurable **policy matrix** (`dct.yaml`) expresses these rules as
data so each org can tune quorum without code changes.

## 4. Automated gates (must pass before approval is allowed)

Run on every ChangeSet (in CI and re-verified server-side at merge):

| Gate | Checks | Source |
|------|--------|--------|
| **Schema validity** | YAML parses; envelope complete; types valid | engine |
| **Referential integrity** | FKs, PDM→BDM, semantic dim/measure/source resolve | engine `checkContract` |
| **Classification coverage** | every field classified; no tagged field in most-open tier | engine |
| **Semver governance** | declared bump ≥ required bump vs lock; no version decrease | engine `checkVersions` |
| **Propagation completeness** | all downstream artifacts regenerate cleanly | engine generators |
| **Access-policy sanity** | restricted not exposed as dimension; policy still consistent | engine |
| **Impact acknowledgement** | breaking change with active subscribers requires explicit ack | platform |
| **Naming/lint** | naming conventions, reserved words, deprecations | platform lint |
| **No secrets / zero-IP** | secret-scan; banned-term scan (keeps repo clean) | platform CI |

Gate results are attached to the ChangeSet; approval is blocked until required
gates are green (overridable only via break-glass).

## 5. Semver enforcement (detail)

Already implemented in the engine and surfaced by governance:

```
required = severity(lockSurface, proposedSurface)   # none|patch|minor|major
declared = bumpKind(lockVersion, proposedVersion)   # none|patch|minor|major|decrease
FAIL if declared == decrease
FAIL if required != none AND rank(declared) < rank(required)
PASS otherwise
```

On merge, `register` updates `registry.lock.json` (the new baseline) as part of the
post-merge job, so the lock always reflects the live registered state. The lock
update is itself committed (by the platform's bot identity) and audited.

## 6. RBAC + ABAC (D4)

### 6.1 Roles (coarse-grained, RBAC)

| Role | Capabilities |
|------|--------------|
| **viewer** | Read catalog, docs, lineage; consume APIs per data classification |
| **modeler** | Propose changes (draft/PR) in domains they belong to |
| **steward** | Approve changes in their domain; manage glossary/DQ for the domain |
| **domain_owner** | Steward + manage domain membership, SLAs, retire models |
| **platform_engineer** | Manage pipelines, environments, connectors, deploys |
| **governance** | Org-wide policy, classification authority, the +1 control approval, audit access |
| **admin** | Tenancy, IdP, roles, retention, system config |

Roles are granted via **IdP group → role mappings** (config), so onboarding is
"add to the AD group." Roles can be **domain-scoped** (steward of `trading`).

### 6.2 Attribute-based control (ABAC) — reuses the PII/MNPI engine

Data-level authorization reuses the access model already built: a principal's
**clearance** (max sensitivity tier, PII, MNPI) is derived from their roles/groups;
the engine's `decide(role, field)` masks attributes in every read path (API,
catalog previews, semantic queries). This is the same code the demo uses, promoted
to production with clearances sourced from the IdP.

Decision precedence: **deny-by-default → domain scope → role capability → ABAC
classification mask**. Every allow/deny on sensitive data is auditable.

## 7. Immutable audit log (D7)

- **Append-only.** No `UPDATE`/`DELETE` on `audit_event` (enforced by table
  privileges + a `BEFORE UPDATE/DELETE` rule that raises).
- **Hash-chained.** Each row stores `hash = sha256(prev_hash || canonical(row))`,
  making tampering detectable (a verifier job recomputes the chain).
- **Comprehensive.** Every state-changing action emits an event: propose, gate
  result, approve/reject, merge, register, deploy, policy change, role change,
  break-glass, consumer key issuance, classification change.
- **Externalizable.** Events stream to the org SIEM via the event bus; optionally
  WORM object storage (S3 Object Lock) for regulator-grade retention.
- **Queryable & exportable.** Filter by actor/subject/time; export signed bundles
  for audits/e-discovery (the hook for the future retention/legal-hold add-on).

## 8. Notifications & collaboration

- Reviewers notified on assignment; authors on decisions; subscribers on breaking
  changes to pinned models; owners on SLA breaches and drift.
- Channels via adapter: email, Slack/Teams, and in-app inbox. (Reuses the event bus.)
- Comments on ChangeSets thread back to the Git PR (two-way) so reviewers can work
  in either surface.

## 9. Worked example (end to end)

1. A modeler in `trading` widens `trade.price` precision (a **major**/breaking
   change) and bumps `trade` `2.0.0 → 2.1.0` (a **minor**, insufficient).
2. `dct propose` validates locally, opens a PR, creates a ChangeSet.
3. Gates run: **semver gate fails** — "major change, bump to ≥ 3.0.0." The modeler
   corrects to `3.0.0`. Gates go green.
4. Impact analysis flags `trading_activity` product + 2 subscribers + the
   `trade_physical` PDM. The modeler acknowledges impact.
5. Because the change touches an **MNPI** field, quorum = 1 steward **+1
   governance**. Both approve; neither is the author (SoD).
6. PR merges. Post-merge: reconcile updates the projection; `registry.lock.json`
   re-registers `trade@3.0.0`; artifacts regenerate; UC sync pushes the new schema;
   subscribers are notified; the pipeline is queued for deploy to `staging`.
7. Every step is in the audit chain, traceable to the merge SHA.

## 10. Federated operating model (domains + Chief Data Architect)

DCT implements **federated computational governance**: domains own and propose
their BDM/PDM changes; the **Chief Data Architect (CDA)** holds enterprise sign-off.
This is the same engine above (maker/checker + quorum + escalation + audit),
extended with **scope-aware routing** and a **CDA tier**. Full proposal:
[`../operating-model/FEDERATED-OPERATING-MODEL.md`](../operating-model/FEDERATED-OPERATING-MODEL.md).

### 10.1 Two-tier approval
- **Tier 1 — domain (autonomous within guardrails):** the domain modeler proposes
  (maker); automated standards-as-code gates run; a domain steward (≠ author)
  approves. Routine, in-domain change completes here.
- **Tier 2 — enterprise (CDA / ARB sign-off):** when the routing policy requires it,
  the ChangeSet escalates to the **CDA review queue**; the CDA (or a delegated ARB
  quorum) signs off before merge.

### 10.2 Scope-aware routing policy
The required approvers are computed from the change's attributes. **CDA sign-off is
required by default** when a change: touches a **BDM**, is **breaking/major**, adds a
**cross-domain** reference, introduces a **new entity**, alters **classification**, or
affects a **`shared`/`enterprise`-scope** (conformed) model. Routine in-domain change
(PDM tuning, docs, minor additive) is **domain-tier only**. The matrix is
configuration, so the CDA can **graduate autonomy** to domains over time.

### 10.3 Model scope & ownership
- Every model has an **owning domain** (`domain.yaml` + `CODEOWNERS` + IdP groups
  drive reviewer routing) and a **scope** (`domain` / `shared` / `enterprise`).
- **`shared`/`enterprise`** (conformed) models are CDA-governed; only the CDA (or
  delegated ARB) may evolve them — protecting conformed dimensions and cross-domain
  reference entities.

### 10.4 Roles added
`chief_data_architect` (enterprise sign-off + standards admin) and
`architecture_review_board` (delegated quorum sign-off). Domain `steward`/
`domain_owner` roles are domain-scoped. SoD holds at every tier — the proposer can
never provide domain approval or CDA sign-off for their own change.

### 10.5 Accountability
The immutable audit records the **domain proposer, domain approver(s), and CDA
sign-off** for every governed BDM/PDM change; a per-change evidence bundle evidences
the full federated approval chain.

> Requirements: [`FR-FG-*`](../requirements/07-federated-operating-model.md). Delivery: epic **DCT-EP11**.
