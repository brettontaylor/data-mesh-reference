---
name: ship
description: |
  Ship workflow for DCT: run the gate (typecheck, check, test), enforce
  contract→generated propagation, review the diff, commit to a feature branch,
  push, and hand off for a PR. NEVER pushes to main/master. Invoke when the user
  says "ship it", "ship this", "create a PR", "prep a PR", or "get this landed".
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /ship — PR-Based Ship Workflow (DCT)

Non-interactive ship workflow for the Mapping and Metadata Platform monorepo. Runs the gate,
enforces the contract-propagation rule, commits to a feature branch, and pushes.
`/ship` means DO IT — run straight through and stop only for the conditions below.

**CORPORATE SAFETY: this skill NEVER pushes to `main`/`master`. All changes land through a feature branch + PR opened by a human via the git provider.**

**Stop for:**
- Currently on `main`/`master` with no clean short-name to branch (ask for one).
- Any gate failure: `pnpm typecheck`, `pnpm check`, or `pnpm test`.
- Broken contract propagation (Step 3).
- Pre-landing review finds a CRITICAL issue.

**Never stop for:** uncommitted changes (include them) or commit-message approval (auto-generate).

---

## Step 1: Pre-flight

```bash
git status
git diff --stat
git log --oneline -5
git branch --show-current
```

If on `main` or `master`, create a feature branch from a short, descriptive slug
of the change (kebab-case):

```bash
git checkout -b feat/<short-name>
```

If already on a feature branch, stay on it. Never commit directly to `main`/`master`.

---

## Step 2: Gate — typecheck, check, test (in order)

Run from the repo root. Stop on the first failure; show the error and do not proceed.

```bash
pnpm typecheck   # pnpm -r typecheck
pnpm check       # governance CI gates (propagation + registry consistency)
pnpm test        # pnpm -r test
```

There is **no `lint` script** in this repo — never run `pnpm lint` / `npm run lint`.
Use pnpm only; never npm/yarn. Never install packages to make the gate pass.

**If any command fails:** show the output and **STOP**. **All three pass:** continue.

---

## Step 3: Contract-propagation gate (the golden rule)

A change that stops at the contract is INCOMPLETE. Check whether the diff touches contracts:

```bash
git diff --name-only origin/HEAD... 2>/dev/null | grep '^packages/engine/contracts/' || \
  git diff --name-only | grep '^packages/engine/contracts/'
```

If `packages/engine/contracts/` is touched, ALL of the following must hold — otherwise **STOP**:
1. `pnpm generate` has been run and the regenerated `packages/engine/generated/` is staged in this change (not left dirty in the working tree).
2. `pnpm check` passed in Step 2 (it enforces contract→generated propagation and registry consistency).

Verify the generated surface isn't stale or unstaged:

```bash
git status --porcelain packages/engine/generated/
```

If `generated/` shows unstaged/modified output after a contract edit, run `pnpm generate`,
stage the result, and re-run `pnpm check`. Do not hand-edit files under `generated/` —
change the contract and regenerate.

---

## Step 4: Pre-landing review

1. Read `.claude/skills/review/checklist.md`. If unreadable, **STOP**.
2. Get the full diff being shipped:
   ```bash
   git fetch origin --quiet 2>/dev/null || true
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'); BASE=${BASE:-main}
   git diff "origin/$BASE"... 2>/dev/null || git diff
   ```
3. Apply the checklist in two passes:
   - **Pass 1 (CRITICAL):** contract/propagation breakage, hand-edited generated files, Zero-IP violations, credential/PII exposure, medallion-boundary violations, DB/API safety.
   - **Pass 2 (INFORMATIONAL):** dead code, test gaps, performance, organization.
4. Output: `Pre-Landing Review: N issues (X critical, Y informational)`.
5. **If any CRITICAL:** AskUserQuestion per issue (A: Fix now, B: Acknowledge and ship, C: False positive). Do not proceed past an unresolved CRITICAL.

---

## Step 5: Stage and commit

1. **Never commit secrets.** Refuse to stage: `.env`, `.env.*`, `credentials.*`,
   `secrets.*`, or any file containing connection strings, tokens, or API keys.
   Never echo a credential value — if one appears, cite `file:line` only.
2. Stage the intentional files (never `git add -A` blindly; include regenerated
   `generated/` when contracts changed). Commit with a conventional-prefix message:

```bash
git commit -m "$(cat <<'EOF'
<type>: <summary>

<body — what changed and why>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

`<type>` is one of `feat|fix|chore|docs|refactor|test`.

---

## Step 6: Push feature branch

```bash
git push origin HEAD
```

Then output:

```
Pushed to: origin/<branch-name>
Open a PR against <base> via your git provider (GitHub/GitLab UI or CLI).
```

**NEVER run `git push origin main` / `git push origin master`.** Opening the PR is the human's step.

---

## Rules (corporate)

- NEVER push to `main`/`master`. Feature branch + human-opened PR only.
- NEVER skip the gate. `pnpm typecheck` → `pnpm check` → `pnpm test`, stop on first failure.
- Contract touched ⇒ `pnpm generate` + staged `generated/` + `pnpm check` green, or STOP.
- Never hand-edit `packages/engine/generated/` — change the contract and regenerate.
- NEVER commit `.env`/secrets/credentials; cite `file:line`, never the value.
- NEVER install packages (no `pnpm add` / npm / pip). No new deps without human review.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP, no external networks.
- Zero IP: generic/illustrative only. No real client/employer names, real data, or proprietary schemas in this PUBLIC repo.
- Full guardrails: `.claude/knowledge/corporate-guardrails.md`.
