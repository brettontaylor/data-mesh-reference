---
name: careful
description: |
  Careful mode: warn/hold before destructive shell commands (rm -rf, DROP/TRUNCATE,
  git force-push, push to main, hard reset, package installs, curl|sh). Invoke when
  asked to "be careful", "careful mode", "safe mode", or before touching anything
  live/shared. Registers a Bash PreToolUse guard for the session.
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
---

# /careful — Destructive Command Guard

Adds a safety net that **holds destructive shell commands** before they run so you
can confirm intent. This enforces the corporate rule that destructive or
irreversible operations require explicit human approval.

## What it does

While active, every `Bash` tool call is screened by
`.claude/skills/careful/bin/check-careful.sh`. If the command matches a destructive
pattern, the hook returns an **approval prompt** (`permissionDecision: "ask"`) with the
reason — the user explicitly approves or denies before it runs. Normal commands pass through.

**Patterns held** (see `bin/check-careful.js` for the exact list):
`rm -rf` · `git push --force` · `git push … main/master` · `git reset --hard` ·
`git clean -f` · `git checkout -- ` · `git branch -D` · SQL `DROP`/`TRUNCATE`/`DELETE`
without `WHERE` · `pnpm/npm/yarn add|install` · `chmod 777` · `curl|sh` · `filter-branch`.

## Activating

The hook is declared in this skill's frontmatter, so invoking `/careful` registers it
for the session. Confirm to the user:

> **Careful mode active.** Destructive shell commands (rm -rf, DROP/TRUNCATE,
> force-push, push to main, hard reset, package installs, …) will be held until you
> approve them. Read-only and normal commands run unaffected.

## Notes

- The guard is **fail-open**: if Node isn't found or input can't be parsed, the command
  is allowed — it prevents accidents, it is not a security boundary. Bash can still be
  used to do harm if a user insists; the point is to force a deliberate pause.
- To also restrict *where files can be edited*, combine with `/freeze` — or use `/guard`
  which turns on both at once.

## Rules (corporate)

- Never push to `main`/`master`; use a feature branch + PR.
- Never run DROP/TRUNCATE/mass DELETE, force-push, or history rewrites without explicit approval.
- Never install packages without human review. Offline only — no external network calls.
