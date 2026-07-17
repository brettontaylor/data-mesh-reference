---
name: guard
description: |
  Full safety mode = /careful + /freeze together: destructive-command holds AND a
  directory-scoped edit boundary. Invoke when asked for "guard mode", "full safety",
  "lock it down", "maximum safety", or before touching prod/shared/live systems.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash .claude/skills/careful/bin/check-careful.sh"
          statusMessage: "Checking for destructive commands..."
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash .claude/skills/freeze/bin/check-freeze.sh"
          statusMessage: "Checking freeze boundary..."
    - matcher: "Write"
      hooks:
        - type: command
          command: "bash .claude/skills/freeze/bin/check-freeze.sh"
          statusMessage: "Checking freeze boundary..."
---

# /guard — Full Safety Mode

Turns on both protections at once: `/careful` (holds destructive shell commands) **and**
`/freeze` (blocks edits outside a chosen directory). Use for maximum safety when working
near prod, shared packages, or anything hard to reverse.

**Depends on** the sibling `careful/` and `freeze/` skill directories (and their
`bin/` scripts) — all ship together in this repo.

## Setup

1. Ask the user which directory to restrict edits to (AskUserQuestion, free-text path).
   Destructive-command screening is always on in guard mode; the boundary bounds edits.

2. Record the boundary (same state file as `/freeze`):

```bash
ROOT="$(git rev-parse --show-toplevel)"
TARGET="$(cd "<user-provided-path>" 2>/dev/null && pwd)"
if [ -z "$TARGET" ]; then echo "Path not found — ask again."; else
  mkdir -p "$ROOT/.claude/.state"
  printf '%s/\n' "${TARGET%/}" > "$ROOT/.claude/.state/freeze-dir.txt"
  echo "Freeze boundary set: ${TARGET%/}/"
fi
```

3. Tell the user:

> **Guard mode active.** Two protections are running:
> 1. **Destructive-command holds** — rm -rf, DROP/TRUNCATE, force-push, push to main,
>    hard reset, package installs, etc. are held until you approve them.
> 2. **Edit boundary** — edits are restricted to `<path>/`; anything outside is blocked.
>
> Run `/unfreeze` to lift the edit boundary. End the session to clear both.

## What's protected

- Destructive command patterns: see `/careful` and `careful/bin/check-careful.js`.
- Edit-boundary enforcement: see `/freeze` and `freeze/bin/check-freeze.js`.

Both guards are **fail-open** (allow on any error/missing Node) — they prevent
accidents, they are not a security sandbox.

## Rules (corporate)

- Never push to `main`/`master`; feature branch + PR only.
- Destructive/irreversible ops and package installs require explicit approval.
- Offline only; state stays in-repo under `.claude/.state/`.
