---
name: cascade-plan
description: |
  Trace every consumer of shared code before changing it, so a monorepo edit
  doesn't surprise-break another package or app. Read-only analysis. Invoke with
  "what breaks if I change X", "cascade plan", "trace consumers", "/cascade-plan".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# /cascade-plan — Cascade-Aware Implementation Plan (DCT)

Before changing shared code, trace every consumer to prevent breakage.

---

## Step 1: Identify the Change
- **What** is being changed (file, exported symbol, contract, generated surface)?
- **Why** (bug fix, feature, refactor)?
- **Scope** — single file, shared package, or contract that regenerates surfaces?

## Step 2: Trace Consumers

This is a **pnpm monorepo**. Shared packages are consumed across apps and other packages —
`packages/shared`, `packages/sdk-ts`, and `@dct/engine` (`packages/engine`) are the usual
hubs. Trace **cross-package imports**, not just same-file usage.

```bash
# Named-import consumers of the symbol
grep -rn "import.*SymbolName" --include="*.ts" --include="*.tsx" packages apps

# Package-level consumers (who depends on the package you're touching)
grep -rn "@dct/engine\|@dct/shared\|@dct/sdk-ts" --include="*.ts" packages apps

# All references
grep -rl "SymbolName" --include="*.ts" --include="*.tsx" packages apps
```

If the change is to a **contract** under `packages/engine/contracts/`, its consumers include
every generated surface under `packages/engine/generated/` (databricks · snowflake · cube ·
catalog · registry · medallion) and anything reading those artifacts — trace those too.

Build the consumer table:

| Changed Item | Consumer (pkg/app + file) | Import Type | Needs Update? |
|--------------|---------------------------|-------------|---------------|

## Step 3: Classify
- **Bug fix** → cascade everywhere automatically.
- **New feature** → apply everywhere, confirm first.
- **Subjective change** → ask per location (AskUserQuestion).
- **Breaking change** → flag every affected consumer prominently, list them all.

## Step 4: Implementation Plan
Per affected location: what changes, expected behavior, risk level. If a contract changed,
the plan MUST include `pnpm generate` and committing the regenerated `generated/`.

## Step 5: Post-Change Verify
```bash
pnpm typecheck                 # pnpm -r typecheck across all packages
pnpm check                     # governance gates: contract→generated propagation + registry
grep -rn "oldPattern" --include="*.ts" packages apps   # confirm no stragglers
```
There is **no lint script** — never run `pnpm lint` / `npm run lint`.

## Rules (corporate)
- Always trace before implementing; treat `packages/shared`, `packages/sdk-ts`, `@dct/engine`
  as shared hubs and check cross-package consumers.
- Golden rule: a contract change that doesn't regenerate `generated/` and pass `pnpm check`
  is INCOMPLETE.
- Bug fixes cascade automatically; subjective changes need approval.
- Run `pnpm typecheck` + `pnpm check` after every cascade change.
- No network calls, no package installs, no pushing to `main` — feature branch + PR only.
- Never echo credentials or PII — cite `file:line` only.
