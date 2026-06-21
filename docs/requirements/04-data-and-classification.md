# 4. Data Model & Classification Requirements (DR)

These requirements define the metadata domain model and the classification
semantics that flow through the platform.

## 4.1 Model classes & envelope

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| DR-001 | M | The system SHALL represent **Source, BDM, PDM, Semantic model, Glossary term, Access policy, DQ contract, and Data product** as first-class model classes. | Each class can be created, versioned, and retrieved. |
| DR-002 | M | Every model SHALL carry a common **envelope** (id, kind, version, status, owner, domain, description, tags, created/updated, last change). | Envelope fields persist and surface in API/registry. |
| DR-003 | M | BDM fields SHALL carry: name, type, **classification**, optional PII, optional MNPI, primary-key flag, optional foreign-key reference, facet flag. | A field with these attributes validates and persists. |
| DR-004 | M | PDM SHALL carry a physical binding: target table, load strategy (full/incremental), partitioning, unique key, and a reference to its BDM. | A PDM validates against its BDM and persists the binding. |
| DR-005 | M | Semantic models SHALL declare dimensions and measures referencing BDM fields/metrics, and the source entities consumed. | References resolve; the model publishes. |
| DR-006 | M | Each object SHALL have a stable **URN** for cross-reference, lineage, and audit (environment-qualified where relevant). | URNs are unique and resolvable. |

## 4.2 System of record & projection

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| DR-010 | M | Model definitions SHALL be stored as **versioned files in Git** (the system of record), organized by domain. | Definitions live in the models repo; history is in Git. |
| DR-011 | M | The operational store SHALL hold a **projection** of definitions plus runtime metadata (workflow, runs, lineage, audit); each projection record SHALL carry the source commit it derives from. | Records carry `source_sha`; the projection is rebuildable. |
| DR-012 | M | A committed **version lockfile** SHALL record the registered baseline (version + control surface) per model. | The lock reflects live registered state after each merge. |

## 4.3 Classification & access semantics

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| DR-020 | M | The sensitivity tiers SHALL be ordered **public < internal < confidential < restricted**. | Tier ordering is enforced in access decisions. |
| DR-021 | M | **PII** and **MNPI** SHALL be orthogonal handling tags layered on the tier. | A field may be any tier with any combination of PII/MNPI. |
| DR-022 | M | The visibility rule SHALL be: visible iff `field.tier ≤ role.maxTier` AND (`¬field.pii ∨ role.pii`) AND (`¬field.mnpi ∨ role.mnpi`). | The decision engine matches this rule across all roles in tests. |
| DR-023 | M | A **restricted** field SHALL NOT be exposed as a semantic dimension. | Such a model fails validation. |
| DR-024 | M | A PII/MNPI-tagged field SHALL NOT sit in the most-open tier. | A PII field classified `public` fails governance. |
| DR-025 | S | The model MAY carry **purpose** and **lawful-basis** tags to support privacy (GDPR) workflows. | Tags persist and are available to downstream privacy tooling. |
| DR-026 | S | Data products/domains MAY declare a **data-residency region** constraining deployment targets. | A region-tagged product deploys only to a matching target. |

## 4.4 Provenance & lineage data

| ID | Pri | Requirement | Acceptance criteria |
|----|-----|-------------|---------------------|
| DR-030 | M | Lineage SHALL be stored at **column granularity** with both declared (static) and observed (run-time) edges. | Edges carry an observed flag and (where applicable) a run id. |
| DR-031 | S | Per-field **provenance** (source, confidence, observed-at) SHOULD be representable for derived metadata. | Provenance fields persist where provided. |
