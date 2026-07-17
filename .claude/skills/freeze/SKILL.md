---
name: freeze
description: |
  Restrict file edits to one directory for the session. Any Edit/Write outside the
  chosen path is blocked. Invoke when asked to "freeze edits", "only edit this folder",
  "lock editing scope", or to keep a debugging session from touching unrelated code.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
hooks:
  PreToolUse:
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

# /freeze — Restrict Edits to a Directory

Lock file edits to a specific directory. Any `Edit` or `Write` targeting a file
outside the allowed path is **blocked** (not just warned). Useful when debugging so
you don't accidentally "fix" unrelated modules, or to scope a change to one package.

## Setup

1. Ask the user which directory to restrict edits to (AskUserQuestion, free-text path —
   e.g. `packages/engine`, `apps/web`). Destructive-command screening is separate
   (`/careful`); this only bounds *where files can be edited*.

2. Resolve to an absolute path and save it to the repo-local state file:

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

> Edits are now restricted to `<path>/`. Any Edit or Write outside this directory is
> blocked. Run `/freeze` again to move the boundary, or `/unfreeze` to remove it.

## How it works

The hook (`bin/check-freeze.sh` → `check-freeze.js`) reads the target `file_path` from
each Edit/Write call, normalizes Windows/Git-Bash path variants, and denies the call
(non-zero exit) if the path is outside the frozen directory. State lives in-repo at
`.claude/.state/freeze-dir.txt` (git-ignored, per-clone).

## Notes

- The trailing `/` prevents `packages/engine` from also matching `packages/engine-old`.
- Applies to `Edit`/`Write` only — `Read`/`Bash`/`Grep`/`Glob` are unaffected. It
  prevents *accidental* edits; it is not a security boundary (`Bash` `sed` could still
  write elsewhere — that's what `/careful` is for).
- **Fail-open:** if Node is unavailable the hook allows the edit rather than stalling work.
- To turn on both edit-boundary and destructive-command screening at once, use `/guard`.

## Rules (corporate)

- State stays in-repo under `.claude/.state/` — never `~/.claude` or `~/.gstack`.
- Offline only; no external network calls.
