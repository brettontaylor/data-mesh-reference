---
name: save-session
description: |
  Session wrap-up for DCT. Captures git state, decisions, and remaining work into
  .context/HANDOFF.json and appends notable learnings/issues to docs/known-issues.md
  so the next session (or teammate) can resume without losing a beat. Invoke at the
  end of a work session, or when the user says "save session", "wrap up", "save my
  progress", or "hand off".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# /save-session — End-of-Session Handoff (DCT)

You are a Staff Engineer who keeps meticulous session notes. Capture the working
context — what was done, what was decided, what's left — into in-repo files so any
future session can resume via `/start-session`.

**HARD GATE:** Do NOT implement code changes or run generators. This skill captures
state only (writes markdown/JSON in-repo).

**All state lives in-repo** under `.context/` and `docs/`. No network, no `~/.gstack`.

---

## Step 1: Gather git state

```bash
echo "=== BRANCH ==="; git branch --show-current 2>/dev/null
echo "=== STATUS ==="; git status --short 2>/dev/null
echo "=== DIFF STAT ==="; git diff --stat 2>/dev/null
echo "=== RECENT LOG ==="; git log --oneline -8 2>/dev/null
echo "=== LAST COMMIT ==="; git log -1 --format="%h|%s" 2>/dev/null
echo "=== NOW ==="; git log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ
```

Use the last line as the timestamp (a real clock at runtime — never hardcode a date).

---

## Step 2: Summarize the session

From git state plus the conversation, produce:

1. **workingOn** — the high-level goal or feature (1 line)
2. **Decisions made** — architectural choices, trade-offs, and why
3. **nextSteps** — concrete next actions, in priority order (2-4 items)
4. **openQuestions** — anything unresolved a future session needs

If the work touched `packages/engine/contracts/`, record explicitly whether
`pnpm generate` was run and whether `pnpm check` passes — an un-propagated contract
change is the single most important thing to flag for the next session.

---

## Step 3: Write `.context/HANDOFF.json`

```bash
mkdir -p .context
```

Write (overwrite) `.context/HANDOFF.json` with the current handoff. This file is the
single latest-state pointer; `/start-session` reads it first.

```json
{
  "timestamp": "<ISO 8601 from Step 1>",
  "branch": "<current branch>",
  "workingOn": "<1-line description>",
  "lastCommit": { "hash": "<short hash>", "message": "<subject>" },
  "uncommittedFiles": ["<paths from git status --short>"],
  "keyDecisions": ["<durable choices made this session>"],
  "openQuestions": ["<unresolved items>"],
  "nextSteps": ["<2-4 concrete next actions>"],
  "propagationStatus": "<n/a | generated+check-passing | contract-change-pending>"
}
```

Use relative repo-root paths in `uncommittedFiles`.

---

## Step 4: Append notable learnings to `docs/known-issues.md`

If this session surfaced a durable gotcha, a new bug, or resolved a tracked one,
update `docs/known-issues.md` (create it with a simple `# Known Issues` heading if
missing). Get today's date at runtime:

```bash
git log -1 --format=%cd --date=short 2>/dev/null || date +%Y-%m-%d
```

- **New issue** → add a bullet with a severity tag (P0/P1/P2) and a one-line repro.
- **Resolved issue** → move it to a `## Resolved` section with the date.
- Only record durable, reusable facts. Skip one-off transient errors.

Append only — never delete existing entries a teammate may rely on.

---

## Step 5: Git reminder (report only)

```bash
git status --short && echo "---BRANCH---" && git branch --show-current
```

- Uncommitted changes → note them so they aren't lost.
- Feature branch with commits → remind to push and open a PR.
- NEVER suggest pushing to `main`/`master`.

Do not run commits or pushes yourself unless the user explicitly asks.

---

## Output format

```
SESSION SAVED
─────────────────────────────
Working on:  {workingOn}
Branch:      {branch} ({clean|uncommitted|unpushed})
Handoff:     .context/HANDOFF.json
Docs:        {docs/known-issues.md updated? y/n}
Propagation: {propagationStatus}
Next up:     {top nextStep}
─────────────────────────────
Resume later with /start-session.
```

---

## Rules (corporate)

- Writes markdown/JSON only, all in-repo (`.context/`, `docs/`). No code changes.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP, no localhost HTTP.
- **Never commit secrets or PII.** If a value looks sensitive, reference it as
  `file:line` in the handoff — never paste the value.
- Never push to `main`/`master`; feature work goes through a branch + PR.
- Audit trail stays plain-text in-repo; never write to `~/.claude` or `~/.gstack`.
