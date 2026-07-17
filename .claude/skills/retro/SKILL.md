---
name: retro
description: |
  Read-only engineering retrospective for DCT from git history. Reports what
  shipped, work patterns, hotspots, and where to level up, with an optional
  in-repo snapshot. Invoke at the end of a week/sprint, or when the user says
  "retro", "what did we ship", "engineering retrospective", or "weekly review".
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
---

# /retro — Engineering Retrospective (DCT)

Read-only analysis of commit history over a window. The only file this skill may
write is an optional snapshot at `.context/retros/<date>.md`.

**HARD GATE:** Do NOT modify code, run generators, or mutate git state. Analyze and
report only.

## Arguments

- `/retro` — last 7 days (default)
- `/retro 14d` — last 14 days
- `/retro 30d` — last 30 days
- `/retro compare` — current window vs the prior same-length window

If the argument isn't a number followed by `d` or the word `compare`, print the
usage above and stop.

---

## Step 0: Anchor the window at a real date

Never hardcode or guess "today" — read it at runtime from git:

```bash
git log -1 --format=%cd --date=short 2>/dev/null || date +%Y-%m-%d
```

Compute the window start by subtracting the window days from that date, and use an
explicit midnight bound (`--since="<start>T00:00:00"`) in every git query below.

**Staleness guard:** if the newest commit on the base branch predates the window
start, the window is empty — say so plainly and stop rather than narrating a story
from no data.

---

## Step 1: Gather raw data

Pick the base branch (`origin/main`, else `origin/master`, else `HEAD`), then:

```bash
BASE=origin/main   # fall back to origin/master or HEAD if it doesn't exist
git log "$BASE" --since="<start>T00:00:00" --format="%H|%aN|%ae|%ai|%s" --shortstat
git log "$BASE" --since="<start>T00:00:00" --format="%at|%aN|%ai|%s" | sort -n
git log "$BASE" --since="<start>T00:00:00" --format="" --name-only | grep -v '^$' | sort | uniq -c | sort -rn
git diff --stat "$BASE@{<window> ago}" "$BASE" 2>/dev/null
git shortlog "$BASE" --since="<start>T00:00:00" -sn --no-merges
```

---

## Step 2: Metrics

| Metric | Value |
|--------|-------|
| Commits | N |
| Contributors | N |
| Insertions / Deletions / Net LOC | N |
| Active days | N |

## Step 3: Time distribution
Hourly histogram in the system-local timezone (do NOT set `TZ`). Note peak hours.

## Step 4: Session detection
45-minute gap between commits = new session. Classify Deep (50+ min), Medium
(20-50), Micro (<20).

## Step 5: Commit types
feat / fix / refactor / chore / docs breakdown. Flag if fix >50% (churn signal).

## Step 6: Hotspots
Top 10 most-changed files. Flag any file with 5+ touches in the window. Call out
whether churn is concentrated in `packages/engine/contracts/`,
`packages/engine/generated/`, `packages/engine/src/`, or the `apps/` surfaces.

## Step 7: DCT-specific signals
- **Propagation hygiene:** did commits touching `packages/engine/contracts/` land
  alongside regenerated `packages/engine/generated/`? Contract-only commits with no
  matching generated diff are a red flag (the golden rule: a change that stops at
  the contract is incomplete).
- **Focus score:** % of commits in the single most-changed top-level directory.

## Step 8: Compare (only for `/retro compare`)
Run Steps 1-2 for the prior same-length window and show deltas (commits, net LOC,
fix ratio, focus).

---

## Step 9: Optional snapshot

Offer to write a snapshot. Get the date at runtime — never hardcode it:

```bash
DATE=$(git log -1 --format=%cd --date=short 2>/dev/null || date +%Y-%m-%d)
mkdir -p .context/retros
# write to .context/retros/$DATE.md
```

If a prior snapshot exists in `.context/retros/`, reference it for trend context.

---

## Step 10: Narrative

- One-line summary of the window.
- Metrics table + trend vs prior snapshot (if any).
- Shipping velocity and session patterns.
- What went well — anchored in specific commits/files.
- Where to level up — anchored in the data (hotspots, fix ratio, propagation gaps).
- 3 concrete habits for next week.

Target 800-1500 words. Ground every claim in a commit hash, file, or number.

---

## Rules (corporate)

- Read-only. Only file written is the optional `.context/retros/<date>.md` snapshot.
- Offline only: no curl/fetch/WebSearch/WebFetch/MCP, no localhost HTTP.
- Get the date at runtime (`git log -1 --format=%cd`); never hardcode it.
- Never echo credentials or sensitive file contents — cite `file:line` only.
- No git mutations, no pushes; nothing touches `main`/`master`.
- State stays in-repo; never write to `~/.claude` or `~/.gstack`.
