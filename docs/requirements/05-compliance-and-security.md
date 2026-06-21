# 5. Compliance & Security Requirements (CR)

v1 mandatory bar: **immutable audit + segregation of duties**. GDPR / BCBS 239 /
retention are designed-for and prioritized **Should/Could** for phased delivery.

## 5.1 Change control (SOX-style)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| CR-001 | M | All production-affecting change SHALL pass **maker/checker** with no self-approval. | Self-approval/merge rejected; enforced server-side and via Git branch protection. |
| CR-002 | M | Approval **quorum** SHALL scale with risk and sensitivity (breaking ⇒ 2 incl. owner; PII/MNPI/policy ⇒ +governance). | Quorum thresholds enforced before approval. |
| CR-003 | M | A complete, immutable **change history** SHALL exist for every model and policy (who, what, when, why, approvals). | History retrievable per object; tamper-evident. |
| CR-004 | M | Emergency change SHALL use **break-glass** dual-control with reason and time-box, loudly audited. | Break-glass recorded distinctly; alerts raised. |
| CR-005 | M | A per-change **evidence bundle** (diff, gates, approvals, merge commit, lineage) SHALL be exportable for auditors. | An evidence bundle exports on demand for any change. |

## 5.2 Lineage & data quality (BCBS 239-style)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| CR-010 | S | End-to-end **column-level lineage** from upstream source to consumption SHALL be available as traceability evidence. | Lineage resolves source→consumer for any served column. |
| CR-011 | S | **Data-quality** results SHALL be captured per run and associated with the data product. | DQ pass/fail and freshness are queryable per product. |
| CR-012 | S | Every data product SHALL have an accountable **owner** and domain. | Ownerless products are reported and blocked from publication. |
| CR-013 | C | A **lineage-completeness** score SHOULD be computed and surfaced for governance. | A coverage metric is available per domain. |

## 5.3 Privacy (GDPR / CCPA)

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| CR-020 | M | **PII** SHALL be identifiable on every field and enforced in access (see DR-021/022). | PII fields are masked per the access rule. |
| CR-021 | C | The system SHOULD support **right-to-be-forgotten** propagation: given a subject, trace lineage to affected locations and emit downstream delete tasks. | An RTBF request produces a target list via lineage. |
| CR-022 | C | The system SHOULD enforce **data residency** via region-constrained deployment targets. | Region-tagged products deploy only to matching regions. |

## 5.4 Records retention & legal hold

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| CR-030 | C | The system SHOULD support configurable **retention** for models, versions, and audit records. | Retention policy is configurable and applied. |
| CR-031 | C | The system SHOULD support **legal hold** (immutability) and e-discovery export. | Held records cannot be deleted; export produces a signed bundle. |

## 5.5 Security controls

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| CR-040 | M | Authentication SHALL use the corporate **IdP (OIDC/SAML)**; no shadow password store (except a sealed, auto-disabled bootstrap admin). | SSO works; bootstrap admin disables after IdP config. |
| CR-041 | M | Authorization SHALL be **RBAC + ABAC**, deny-by-default, with DB-layer RLS as defence in depth. | Cross-domain/clearance access blocked at app and DB layers. |
| CR-042 | M | Secrets SHALL be managed externally, **rotatable without redeploy**, never in code/Git/logs. | Rotation works; secret scan clean; logs redacted. |
| CR-043 | M | Outbound dependencies SHALL be **allow-listed** and support private networking (PrivateLink/VNet). | Only required egress is permitted. |
| CR-044 | M | A documented **threat model** (STRIDE) SHALL exist with mitigations tracked. | Threat model reviewed; mitigations mapped to requirements. |
| CR-045 | M | Webhook payloads SHALL be **HMAC-signed**; inbound webhooks SHALL be signature-verified. | Signatures validated end to end. |
