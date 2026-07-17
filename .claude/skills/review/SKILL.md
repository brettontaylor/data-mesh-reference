---
name: review
description: |
  Pre-PR code review for DCT. Analyzes the diff vs the base branch for
  contract-propagation breakage, hand-edited generated files, Zero-IP leaks,
  medallion-boundary violations, credential/PII exposure, and DB/API safety.
  Read-only. Invoke on "review my changes", "review this PR", "code review",
  "check my diff", or before shipping.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /review — Pre-PR Code Review (DCT)

Analyze the current diff for structural issues tests don't catch.

**READ-ONLY.** This skill never modifies files unless the user explicitly asks for a fix.

---

## Step 1: Detect base branch and get the diff

```bash
git branch --show-current
git fetch origin --quiet 2>/dev/null || true
BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'); BASE=${BASE:-main}
echo "Base: $BASE"
git diff "origin/$BASE"... --stat 2>/dev/null || git diff --stat
```

If on the base branch or there is no diff, output **"Nothing to review."** and stop.

---

## Step 2: Read the checklist

Read `.claude/skills/review/checklist.md`. If unreadable, **STOP**.

---

## Step 3: Read the full diff

```bash
git diff "origin/$BASE"... 2>/dev/null || git diff
```

Read the whole diff before commenting.

---

## Step 4: Two-pass review

- **Pass 1 (CRITICAL — blocks the PR):** contract changed without regenerating
  `generated/`; hand-edited generated files; Zero-IP violations (real client/
  employer names, real data, proprietary schemas in this PUBLIC repo); credential/
  secret exposure; PII exposure; medallion-boundary violations; DB/ORM and API safety.
- **Pass 2 (INFORMATIONAL — logged, non-blocking):** dead code, test gaps,
  performance, code organization.

---

## Step 5: Output findings

```
Pre-Landing Review: N issues (X critical, Y informational)

CRITICAL:
- [file:line] Problem → Fix: suggestion

Issues:
- [file:line] Problem → Fix: suggestion
```

For each CRITICAL issue, AskUserQuestion (A: Fix now, B: Acknowledge, C: False positive).

---

## Rules (corporate)

- READ-ONLY unless the user asks for a fix. Cite `file:line`; be terse — one line problem, one line fix. Only flag real problems.
- NEVER echo or display `.env` contents, connection strings, credentials, or PII — cite `file:line` and name the class of issue.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP; review from the local diff.
- Zero IP: this is a PUBLIC repo — flag any real client/employer name, real data, or proprietary schema.
- Full guardrails: `.claude/knowledge/corporate-guardrails.md`.
