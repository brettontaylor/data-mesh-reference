---
name: plan-review
description: |
  Structured review of an implementation plan BEFORE any code is written.
  Checks correctness, architecture fit, blast radius, contract→generated
  propagation impact, medallion-layer correctness, test strategy, and guardrail
  compliance. Read-only; ends with a scored verdict (must-fix vs nice-to-have).
  Invoke on "review my plan", "review this approach before I build it",
  "plan review", or "does this plan hold up".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# /plan-review — Implementation Plan Review (DCT)

Pressure-test a plan before coding. Opinionated, concrete tradeoffs, read-only.
No files are modified. The goal is to catch design problems while they are cheap.

## Engineering preferences
- Minimal diff — fewest new abstractions and files; challenge scope creep.
- DRY — flag repetition and reinvented utilities (prefer `@dct/shared`).
- Contract is the source of truth — a change that stops at the contract is incomplete.
- Respect medallion boundaries (Bronze→Silver→Gold); app code reads Gold only.
- Security by default — auth, input validation, audit logging on every endpoint.
- Well-tested code is non-negotiable. No hardcoded credentials or connection strings, ever.

## Step 0: Scope challenge

1. **What existing code already solves each sub-problem?** (`@dct/engine`, adapters, `@dct/shared`.)
2. **What is the minimum set of changes?** Flag deferrable work.
3. **Complexity smell:** >8 files or >2 new abstractions — challenge it.

Classify the plan, then review at matching depth:
- **SCOPE REDUCTION** — propose a minimal version first.
- **BIG CHANGE** — section-by-section interactive review.
- **SMALL CHANGE** — single compressed pass.

## Review sections

### 1. Correctness & architecture fit
- Does the plan actually solve the stated problem? Any incorrect assumptions?
- Component boundaries and data flow; does new logic land in the right package/layer?
- One realistic failure scenario per new codepath, and how it's handled + surfaced.

### 2. Cascade / blast radius
- Which packages/apps does this touch (`engine`, adapters, `api`, `cli`, `web`, `worker`)?
- What downstream consumers break if a shared type or interface changes?
- Is the change additive, or does it force coordinated updates across packages?

### 3. Contract → generated propagation impact
- Does the plan touch `packages/engine/contracts/` (spec / entities / sources)?
- If so, does it explicitly account for running `pnpm generate` and committing the
  regenerated `packages/engine/generated/` (Databricks · Cube · Snowflake · catalog)?
- New entities: does the plan register them in the owning source's `produces`
  (registry-consistency gate) and confirm `pnpm check` passes?
- A plan that edits contracts but never mentions regeneration is INCOMPLETE — flag it.

### 4. Medallion-layer correctness
- Bronze: raw data preserved without transformation?
- Silver: deduplication and validation happening here?
- Gold: aggregated, masked, app-ready; no unmasked PII?
- App code reads Gold only — no direct Bronze/Silver reads or Bronze writes.

### 5. Security & guardrails
- Auth + role-based authorization on all non-public routes; input validation before processing.
- No credential/PII exposure in code, logs, or errors; audit trail for sensitive ops.
- Zero-IP: no real client/employer names, real data, or proprietary schemas (PUBLIC repo).
- No new dependencies, no CI/CD or IAM/firewall changes, no external network calls.

### 6. Test strategy
- New entities, generators, medallion stages, and API endpoints each covered?
- Governance/transformation edge cases and failure paths tested?
- Does the plan state how it verifies propagation (`pnpm check`) and behavior (`pnpm test`)?

**Per section: STOP and AskUserQuestion on each real issue — one issue per call, lead with the recommendation.**

## Required outputs
- **"What already exists"** — reuse the plan should lean on.
- **"NOT in scope"** — deferrable/adjacent work to keep out.
- **Failure modes** — error handling + user visibility per new codepath.
- **Verdict summary** — a scored, actionable close:

```
Plan Review Verdict: <APPROVE | APPROVE WITH CHANGES | REWORK>
Scores (1-5): correctness _/5 · architecture _/5 · propagation _/5 · medallion _/5 · tests _/5 · guardrails _/5

Must-fix (blocks build):
- <issue → change>

Nice-to-have (non-blocking):
- <issue → change>
```

Use REWORK when any must-fix is unresolved or propagation/medallion/guardrail integrity is at risk.

## Rules (corporate)
- READ-ONLY. Review the plan; do not write code or edit files.
- Enforce the golden rule: contract changes must plan for `pnpm generate` + staged `generated/` + green `pnpm check`.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP. No new deps, no CI/CD or IAM changes.
- Never echo credentials or PII — cite `file:line` only.
- Zero IP: generic/illustrative, synthetic capital-markets data only, in this PUBLIC repo.
- Full guardrails: `.claude/knowledge/corporate-guardrails.md`.
