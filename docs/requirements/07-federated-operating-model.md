# 7. Federated Operating Model Requirements (FR-FG)

Requirements for the **federated governance** of BDM/PDM creation and change:
domains own and propose; the **Chief Data Architect (CDA)** signs off on
enterprise-significant change. Companion to the operating-model proposal
([`../operating-model/FEDERATED-OPERATING-MODEL.md`](../operating-model/FEDERATED-OPERATING-MODEL.md)).
Priority: **M**ust / **S**hould / **C**ould.

## 7.1 Domains & ownership

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-FG-001 | M | The system SHALL represent **domains** as first-class objects with an owner group, description, and SLAs. | A domain can be created with an owner group; models belong to a domain. |
| FR-FG-002 | M | Every model SHALL belong to exactly one **owning domain**; domain ownership SHALL be expressed as data (`domain.yaml` + `CODEOWNERS` + IdP-group mapping). | A model's domain and steward group are resolvable from configuration. |
| FR-FG-003 | M | The system SHALL route a ChangeSet's **domain-tier reviewers** automatically from the owning domain's steward group. | Reviewers are assigned from the correct domain on propose. |
| FR-FG-004 | M | Models SHALL carry a **scope**: `domain`, `shared`, or `enterprise`. `shared`/`enterprise` models are governed centrally (CDA). | A model's scope persists and drives routing. |
| FR-FG-005 | S | The system SHALL provide a **federation registry**: domains, owners, conformed/shared models, and pending sign-offs. | The registry lists domains, owners, and shared models. |

## 7.2 Roles & decision rights

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-FG-010 | M | The system SHALL provide a **Chief Data Architect (CDA)** role with org-wide approval authority and standards-administration capability. | A CDA can sign off on any domain's enterprise-significant change and edit enterprise standards. |
| FR-FG-011 | S | The system SHALL support an **Architecture Review Board (ARB)** role to which the CDA MAY delegate sign-off by quorum. | An ARB quorum can provide the enterprise sign-off when delegated. |
| FR-FG-012 | M | **Domain Steward / Owner** roles SHALL be **domain-scoped**: a steward approves only within their domain. | A steward cannot approve changes outside their domain. |
| FR-FG-013 | M | Segregation of duties SHALL apply at **every tier**: the proposer cannot provide domain approval or CDA sign-off for the same change. | Self-approval at any tier is rejected. |

## 7.3 Approval routing & enterprise sign-off

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-FG-020 | M | The system SHALL compute required approvals from a **configurable routing policy** over change attributes (model kind, severity, scope, classification delta, cross-domain). | Changing the policy changes the required approvers without code changes. |
| FR-FG-021 | M | The routing policy SHALL require **CDA sign-off** by default when a change: touches a **BDM**, is **breaking/major**, adds/changes a **cross-domain** reference, introduces a **new entity**, alters **classification**, or affects a **shared/enterprise** model. | Each listed condition triggers a required CDA sign-off; others do not. |
| FR-FG-022 | M | Routine, in-domain change (PDM tuning, docs, minor additive) SHALL be **approvable at the domain tier alone** (autonomy within guardrails). | An in-domain patch merges with domain approval only. |
| FR-FG-023 | M | A ChangeSet requiring enterprise sign-off SHALL **escalate to the CDA review queue** after domain approval and SHALL NOT merge until signed off. | The change cannot merge without the CDA sign-off recorded. |
| FR-FG-024 | M | The system SHALL provide a **CDA review queue / dashboard** showing pending enterprise sign-offs across all domains, with change scope, impact, and gate status. | The CDA sees all pending enterprise approvals in one place. |
| FR-FG-025 | S | The system SHALL apply **review SLAs** per tier and **escalate** stale enterprise sign-offs (reminder → ARB → delegate). | A stale sign-off triggers escalation per policy. |
| FR-FG-026 | C | The CDA SHALL be able to **delegate** specified change classes to the domain tier (graduated autonomy), recorded and audited. | A delegated class no longer requires CDA sign-off after the policy change. |

## 7.4 Enterprise standards as code

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-FG-030 | M | Enterprise modeling **standards** SHALL be enforced as **automated gates** (naming, classification coverage, semver discipline, cross-domain integrity) in both the ChangeSet pipeline and the models-repo CI. | Non-compliant change fails the relevant gate with detail. |
| FR-FG-031 | S | The system SHALL **flag duplication**: a new entity overlapping a conformed/shared model SHALL be surfaced for reuse before approval. | A near-duplicate entity raises a reuse warning on the ChangeSet. |
| FR-FG-032 | M | Only the **CDA** (or delegated ARB) SHALL be able to create or evolve **`shared`/`enterprise`-scope** models (conformed-model protection). | A domain steward cannot merge a change to a shared model without CDA sign-off. |

## 7.5 Accountability

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| FR-FG-040 | M | The audit trail SHALL record, for every BDM/PDM change, the **domain proposer, domain approver(s), and CDA sign-off** (where applicable). | The audit/evidence bundle shows both tiers for a governed change. |
| FR-FG-041 | S | The system SHALL produce a **per-change evidence bundle** evidencing the federated approval chain. | An evidence bundle exports showing the full approval chain. |
