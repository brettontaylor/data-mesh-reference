---
name: medallion-plan
description: |
  Plan a new data shape, pipeline, or app feature on the medallion architecture:
  which layer owns the logic, what contracts it needs, how to test it. Read-only
  planning — no implementation. Invoke with "plan a pipeline", "which layer should
  this go in", "medallion plan", "/medallion-plan".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# /medallion-plan — Medallion Architecture Planning (DCT)

Plan new features or pipelines with correct layer alignment. **Planning only — no code.**

---

## Step 1: Understand the Request

Parse what's being built:
- **New data shape / source** → contract entity + Bronze ingestion + Silver transform + Gold serving.
- **New app feature** → Gold view/endpoint + possible Silver enrichment.
- **New report/metric** → Gold aggregation + API.
- **Data enrichment** → Silver transform update.

### DCT starting point — contract first
In this repo, a new data shape almost always starts as a **contract entity** under
`packages/engine/contracts/entities/` (or the BDM/PDM/semantic contract folders), **registered
in its source's `produces`** in `packages/engine/contracts/sources/`. You then run
`pnpm generate` to propagate it into `packages/engine/generated/` (databricks · snowflake ·
cube · catalog · registry · medallion). The plan MUST call this out as step one of
implementation — a change that stops at hand-written code and skips the contract is wrong here.

```bash
ls packages/engine/contracts/entities packages/engine/contracts/sources
ls packages/engine/src/medallion       # runner + layer logic
```

---

## Step 2: Layer Assignment

For each piece of logic, assign the layer:

| Logic Type | Correct Layer | Examples |
|-----------|---------------|----------|
| Raw ingestion / feed parsing | **Bronze** | source feed load, queue consumption |
| Dedup, validation, type casting | **Silver** | merge duplicates, validate keys, parse dates |
| PII masking / tokenization | **Silver** | mask counterparty, hash identifiers |
| Aggregation, business metrics | **Gold** | positions by book, exposure by counterparty |
| App-ready views / API responses | **Gold** | dashboard data, search results |
| Cross-source joining | **Silver** | link reference-master to trade feed |

**Flag any logic sitting in the wrong layer.**

---

## Step 3: Define Contracts

Because contracts are the source of truth, define the entity/field spec first, then the
layer-transition guarantees.

```
### Contract entity: [Name]
- File: packages/engine/contracts/entities/<name>.yaml (or bdm/pdm/semantic)
- Registered in source `produces`: packages/engine/contracts/sources/<source>.yaml
- Fields + classification (mark PII/sensitive explicitly)

### Bronze → Silver
- Input (Bronze): source, key fields, freshness
- Transform: dedup key, validation rules, type conversions, PII handling per field
- Output (Silver): schema + guarantees (unique on X, non-null Y, PII masked)

### Silver → Gold
- Input (Silver): guarantees relied on
- Transform: aggregation grain, derived fields, confirmed PII status
- Output (Gold): schema + which apps/APIs consume it
```

---

## Step 4: Testing Strategy

| Layer | Test Type | What to Verify |
|-------|-----------|----------------|
| Contract | Registry test | Entity registered in source `produces`; `pnpm check` passes |
| Bronze | Ingestion | Raw shape matches source |
| Silver | Transform | Dedup, validation, correct types |
| Silver | PII | Sensitive fields masked before leaving Silver |
| Gold | Aggregation | Metrics correct, no double-counting |
| Gold | Contract | Gold artifact matches generated surface |
| E2E | Propagation | `pnpm generate` produces expected `generated/`; `pnpm check` green |

---

## Step 5: App Layer Integration

For features needing app code (`apps/api|cli|web|worker`):
- Which **Gold** artifact/view does it read? (Apps read Gold only.)
- Authorization / role scoping.
- Caching + refresh interval; behavior when Gold is stale or missing.

---

## Step 6: Output Plan

```
## Medallion Plan: [Feature Name]

### Contract-first steps
1. Add/extend entity under packages/engine/contracts/entities (+ register in source `produces`)
2. `pnpm generate` → commit regenerated packages/engine/generated/
3. `pnpm check` must pass

### Layer Assignments
| Component | Layer | Rationale |

### Contracts
[entity + Bronze→Silver + Silver→Gold]

### Testing Strategy
[per-layer]

### App Integration
[Gold reads / API changes]

### Risks
- [risk + mitigation]

### NOT in scope
- [deferred items + rationale]
```

---

## Rules (corporate)
- **Planning only.** Don't write implementation code.
- New data shapes start as a **contract entity registered in its source's `produces`**, then
  `pnpm generate` — the plan must make this explicit. A change that stops at the contract (or
  skips it) is INCOMPLETE; `pnpm check` must pass.
- Every piece of logic gets a layer assignment — no ambiguity. Apps read Gold only.
- PII handling is never optional; mask before Gold, and never print PII values while planning.
- Ask before assuming (AskUserQuestion) on ambiguous layer calls.
- No network calls, no installs, no pushing to `main` — feature branch + PR only.
