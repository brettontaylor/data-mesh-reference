---
name: start-session
description: |
  Read-only session bootstrap for DCT. Reads last session's handoff, git state,
  known issues, roadmap, and refreshes from CLAUDE.md, then proposes a next step.
  Invoke at the start of a work session, or when the user says "start session",
  "where was I", "catch me up", "resume", or "what should I work on".
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /start-session — Start-of-Session Bootstrap (DCT)

You are a Staff Engineer reading a colleague's session notes to pick up exactly
where they left off. Load the state below, summarize where things stand, and
propose a next step. Fully automated, read-only, offline.

**HARD GATE:** Do NOT modify code, run generators, or touch git state. This skill
only reads and summarizes.

**All state lives inside the repo** under `.context/` and `docs/`. No `~/.claude`,
no `~/.gstack`, no network.

---

## Step 1: Read handoff

```bash
cat .context/HANDOFF.json 2>/dev/null || echo "NO_HANDOFF"
```

If found, surface: `workingOn`, `lastCommit`, `nextSteps`, `openQuestions`,
`timestamp`. If `NO_HANDOFF`, note that this looks like a fresh start (no prior
`/save-session`).

---

## Step 2: Git state

```bash
git status --short && echo "---BRANCH---" && git branch --show-current && echo "---LOG---" && git log --oneline -8
```

Flag uncommitted changes. If on a feature branch (not `main`), run
`git diff main --stat` to show what's pending, and if commits exist but are
unpushed, remind the user to push and open a PR. NEVER suggest committing or
pushing to `main`.

---

## Step 3: Known issues

```bash
grep -nE "P0|P1|OPEN|TODO" docs/known-issues.md 2>/dev/null | head -15 || echo "NO_KNOWN_ISSUES"
```

Read `docs/known-issues.md` if present and surface open **P0/P1** items
prominently. These are the first things a returning engineer needs to see.

---

## Step 4: Roadmap scan

```bash
grep -rnE "\[ \]" docs/roadmap.md docs/project-plan/ 2>/dev/null | head -10 || echo "NO_ROADMAP"
```

Identify 3-5 next actionable items from any unchecked roadmap/plan boxes.

---

## Step 5: Refresh project rules

Read `CLAUDE.md` (root). Re-anchor on the non-negotiables: contracts at
`packages/engine/contracts/` are the source of truth, and a change that stops at
the contract is incomplete — it must propagate through `pnpm generate` into
`packages/engine/generated/`, with `pnpm check` passing. Keep this in mind for
anything you propose next.

---

## Step 6: Retro freshness (optional)

```bash
ls -t .context/retros/*.md 2>/dev/null | head -1 || echo "NO_RETROS"
```

If the newest retro is more than ~7 days old (compare its filename date against
`git log -1 --format=%cd`), suggest running `/retro`.

---

## Output format

Keep it compact:

- **Handoff:** what last session was working on + next steps (or "fresh start")
- **Branch:** current branch + clean/dirty/unpushed
- **Known issues:** open P0/P1 summary (or "none tracked")
- **Up next:** 3-5 roadmap items
- **Proposed next step:** one concrete recommendation, grounded in the above
- Then ask what the user wants to work on.

---

## Rules (corporate)

- Read-only. No code changes, no generators, no git mutations.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP, no localhost HTTP.
- Never push to `main`/`master`; feature work goes through a branch + PR.
- Never echo/print credentials or PII found in files — cite `file:line` only.
- All state stays in-repo (`.context/`, `docs/`); never read or write `~/.claude`
  or `~/.gstack`.
