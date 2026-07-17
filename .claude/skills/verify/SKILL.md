---
name: verify
description: |
  Goal-backward verification for DCT: checks whether a change actually works by
  examining contracts, generated surfaces, medallion code, and tests. Read-only,
  no network calls. Invoke with "verify this", "did my change work", "/verify".
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /verify — Goal-Backward Verification (DCT)

Checks whether a change works via **code analysis only** — no HTTP, no localhost, no network.

---

## Step 1: Resolve the Goal

If an argument is provided (e.g., `/verify "trade entity flows to Gold"`), use it.

Otherwise infer from, in order:
1. `.context/HANDOFF.json` — the `workingOn` / goal field
2. Recent commits: `git log --oneline -5`
3. Working tree: `git status --short`

Confirm the resolved goal with AskUserQuestion before proceeding.

---

## Step 2: Define Must-Haves

Generate **3–8 concrete, checkable truths** for the goal. In DCT, always include the
two repo-specific invariants where relevant:

- **Contract→generated propagation.** If the change touches `packages/engine/contracts/`,
  the matching surfaces under `packages/engine/generated/` (databricks · snowflake · cube ·
  catalog · registry · medallion) must reflect it, and `pnpm check` must pass.
- **Correct medallion-layer placement.** New/changed logic sits in the right layer under
  `packages/engine/src/medallion/` — raw shaping in Bronze, validation/PII masking/dedup in
  Silver, aggregation and app-facing views in Gold.

```
Must-haves for: "trade entity flows to Gold"
1. Entity defined under contracts/entities (or contracts/bdm) and registered in its source's `produces`
2. Generated catalog + cube + medallion artifacts exist for the entity
3. Medallion Gold projection includes the entity, PII masked
4. `pnpm check` passes (propagation + registry consistency)
5. Test coverage exists for the transform
```

---

## Step 3: Check Each Must-Have

**Contract & registry:**
- Read the relevant file under `packages/engine/contracts/` (spec.yaml, entities, sources).
- Confirm the entity is listed in its source's `produces` (registry-consistency gate).

**Generated propagation:**
```bash
grep -rl "EntityName" packages/engine/generated
```
- Confirm a matching artifact exists in each surface it should touch.

**Medallion placement:**
- Read `packages/engine/src/medallion/run.ts` and confirm the layer that owns the logic.

**Governance gates (authoritative check):**
```bash
pnpm check       # governance CI gates: propagation + registry consistency
pnpm typecheck   # pnpm -r typecheck
```

**Test coverage:**
```bash
grep -rl "EntityName" --include="*.test.ts" --include="*.spec.ts" packages
```

Record concrete evidence (`file:line`, command exit status) for every check.

---

## Step 4: Report

```
## Verification: [Goal]

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Entity registered in source `produces` | PASS | contracts/sources/trades_feed.yaml:14 |
| 2 | Generated surfaces updated | PASS | generated/catalog/trade.json, generated/cube/trade.yml |
| 3 | `pnpm check` passes | FAIL | propagation gate: generated/ stale vs contract |

**Result: N/M PASS**
```

---

## Step 5: Suggest Fixes

One-line fix per FAIL (e.g., "run `pnpm generate` and commit regenerated `generated/`").
If all pass: **"All verified."** Do not implement fixes.

---

## Rules (corporate)
- **Code analysis only.** No curl/fetch/WebSearch/WebFetch/MCP, no localhost HTTP. Offline.
- Golden rule: a change that stops at the contract is INCOMPLETE — `pnpm generate` + committed
  `generated/` + passing `pnpm check` are required, never `pnpm lint` (no such script).
- Evidence (`file:line` or command result) required for every PASS/FAIL.
- Suggest fixes; never implement them here.
- Never echo credentials or PII — cite `file:line` only, never the value.
