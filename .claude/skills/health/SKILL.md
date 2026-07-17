---
name: health
description: |
  Read-only repo health dashboard for DCT. Runs pnpm typecheck and pnpm check,
  flags contract→generated propagation drift, and surfaces TODO/FIXME counts,
  uncommitted changes, stale branches, and open known-issues. Invoke when the user
  says "health check", "how healthy is the repo", "run the checks", or "is main green".
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /health — Repo Health Dashboard (DCT)

You are a Staff Engineer who owns the dashboard. Run the repo's own checks, read
the results honestly, and present a concise health picture.

**HARD GATE:** Do NOT fix anything and do NOT run `pnpm generate` (it would mutate
`generated/`). Produce the dashboard and recommendations only; the user decides what
to act on.

This is a **pnpm monorepo** (`pnpm@9.15.0`, node >=20.9.0). Use pnpm — never
npm/yarn. **There is no `lint` script — never run `pnpm lint`.**

---

## Step 1: Typecheck

```bash
pnpm typecheck 2>&1 | tail -40; echo "TYPECHECK_EXIT=${PIPESTATUS[0]}"
```

`pnpm typecheck` runs `pnpm -r typecheck` across all packages. Record pass/fail and
count `error TS` lines on failure.

---

## Step 2: Governance check (propagation drift)

```bash
pnpm check 2>&1 | tail -40; echo "CHECK_EXIT=${PIPESTATUS[0]}"
```

`pnpm check` is the governance CI gate — it enforces that
`packages/engine/generated/` is in sync with `packages/engine/contracts/` and that
the registry is consistent. **A failing `pnpm check` almost always means propagation
drift:** someone changed a contract without running `pnpm generate` and committing
the regenerated surfaces (Databricks / Cube / Snowflake / catalog). Flag this as the
top issue if it fails — do NOT run `pnpm generate` to "fix" it; report it.

---

## Step 3: TODO / FIXME debt

```bash
grep -rInE "TODO|FIXME|HACK|XXX" packages/ apps/ 2>/dev/null | grep -vE "node_modules|/generated/" | wc -l
grep -rInE "TODO|FIXME|HACK|XXX" packages/ apps/ 2>/dev/null | grep -vE "node_modules|/generated/" | head -15
```

Report the count and show the first several with `file:line`.

---

## Step 4: Working-tree cleanliness

```bash
git status --short 2>/dev/null | grep -vE "^\?\? " | wc -l
git status --short 2>/dev/null | head -20
echo "---BRANCH---"; git branch --show-current
```

Report uncommitted/staged file count. If on a feature branch with commits, note
whether it's unpushed (needs a PR). Never suggest committing to `main`.

---

## Step 5: Stale branches

```bash
git for-each-ref --sort=-committerdate refs/heads/ \
  --format='%(refname:short)|%(committerdate:relative)' 2>/dev/null | head -15
```

Flag local branches whose last commit is older than ~30 days (compare against
`git log -1 --format=%cd` — read the date at runtime, never hardcode it).

---

## Step 6: Open known-issues

```bash
grep -cE "P0|P1|P2|OPEN" docs/known-issues.md 2>/dev/null || echo 0
grep -nE "P0|P1" docs/known-issues.md 2>/dev/null | head -10
```

Surface open P0/P1 items from `docs/known-issues.md` if present.

---

## Step 7: Dashboard

Present a concise dashboard:

```
DCT REPO HEALTH
─────────────────────────────────────────────
Branch:        <current branch>
Date:          <from git log -1 --format=%cd>

Check              Result        Detail
─────────────────  ────────────  ─────────────────────────────
Typecheck          PASS/FAIL     N errors
Governance (check) PASS/FAIL     propagation in sync? / DRIFT
TODO/FIXME         N             top files listed below
Working tree       CLEAN/DIRTY   N uncommitted
Stale branches     N             older than 30d
Known issues       N open        P0/P1 listed below
─────────────────────────────────────────────
OVERALL: HEALTHY / NEEDS ATTENTION / DRIFT DETECTED
```

Status logic:
- `pnpm check` failing → **DRIFT DETECTED** (highest priority; contracts and
  generated surfaces are out of sync).
- Typecheck failing → **NEEDS ATTENTION**.
- Otherwise report **HEALTHY** with any TODO/known-issue counts as context.

For any failing check, include the actual tail output so the user can act without
re-running. Close with a short prioritized recommendation list (highest impact
first) — but recommend actions only; do not perform them.

---

## Rules (corporate)

- Read-only. Never fix issues; never run `pnpm generate` or any mutating command.
- pnpm only (no npm/yarn). **No `pnpm lint` — that script does not exist.**
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP, no localhost HTTP.
- No package installs; if a tool is missing, mark it SKIPPED, don't install it.
- Never echo credentials or PII from tool output — cite `file:line` only.
- Get the date at runtime; never hardcode it. No git mutations, no pushes to `main`.
- State stays in-repo; never read or write `~/.claude` or `~/.gstack`.
