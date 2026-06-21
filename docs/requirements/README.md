# DEAL Control Tower — Requirements

A formal, robust requirements set for **DEAL Control Tower (DCT)** — the metadata
management & governance control plane for the DEAL lakehouse. This is the
collection your team can review, baseline, and trace the build against.

> **Two formats:** this markdown collection (canonical, diffable) and a
> consolidated **Word document** (`DEAL-Control-Tower-SRS.docx`) generated from the
> same content for circulation/sign-off. A single consolidated markdown
> (`DEAL-Control-Tower-SRS.md`) is also provided for easy conversion.

## Documents

| Doc | Contents |
|-----|----------|
| [01-introduction.md](01-introduction.md) | Purpose, scope, stakeholders, definitions, assumptions, constraints |
| [02-functional-requirements.md](02-functional-requirements.md) | All functional requirements (FR), by capability area |
| [03-non-functional-requirements.md](03-non-functional-requirements.md) | Performance, scale, availability, security, operability, etc. (NFR) |
| [04-data-and-classification.md](04-data-and-classification.md) | Data model, classification, access semantics (DR) |
| [05-compliance-and-security.md](05-compliance-and-security.md) | Regulatory & security control requirements (CR) |
| [06-traceability-matrix.md](06-traceability-matrix.md) | Requirement → build phase → Jira epic traceability |

## Conventions

- **Requirement IDs** are stable and unique: `FR-<area>-NNN` (functional),
  `NFR-<area>-NNN` (non-functional), `DR-NNN` (data), `CR-NNN` (compliance).
  Never renumber a requirement — supersede with a new ID and mark the old one.
- **Normative keywords** (RFC 2119): **SHALL / SHALL NOT** = mandatory,
  **SHOULD** = recommended, **MAY** = optional.
- **Priority (MoSCoW):** **M** = Must (v1/MVP), **S** = Should, **C** = Could,
  **W** = Won't-yet (explicitly deferred, captured for completeness).
- **Acceptance criteria** are testable; each requirement is "done" only when its
  criteria are demonstrably met.
- **Traceability:** every requirement maps to a build phase (P0–P8) and a Jira
  epic — see [06-traceability-matrix.md](06-traceability-matrix.md).

## Capability areas (FR prefixes)

| Prefix | Area |
|--------|------|
| `FR-MM` | Model management (authoring, validation, versioning) |
| `FR-GV` | Governance & workflow (change control, maker/checker, audit) |
| `FR-OR` | Pipeline orchestration |
| `FR-LN` | Lineage |
| `FR-CP` | Catalog & publication |
| `FR-AX` | Access control & classification |
| `FR-IN` | Integration (Git, Databricks/UC, IdP, secrets, events) |
| `FR-CN` | Consumption surfaces (API, SDK, CLI) |
| `FR-UI` | User interface |
| `FR-AD` | Administration |
