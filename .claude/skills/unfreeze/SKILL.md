---
name: unfreeze
description: |
  Clear the edit boundary set by /freeze, allowing edits everywhere again. Invoke
  when asked to "unfreeze", "unlock edits", "remove freeze", or "allow all edits".
allowed-tools:
  - Bash
  - Read
---

# /unfreeze — Clear the Freeze Boundary

Remove the edit restriction set by `/freeze`, re-allowing edits in all directories.

```bash
ROOT="$(git rev-parse --show-toplevel)"
STATE="$ROOT/.claude/.state/freeze-dir.txt"
if [ -f "$STATE" ]; then
  PREV="$(cat "$STATE")"
  rm -f "$STATE"
  echo "Freeze boundary cleared (was: $PREV). Edits are now allowed everywhere."
else
  echo "No freeze boundary was set."
fi
```

Tell the user the result. Note the `/freeze` and `/guard` hooks may still be
registered for the session — with no state file they simply allow everything. Run
`/freeze` again to re-establish a boundary.

## Rules (corporate)

- Offline only; touches only the in-repo `.claude/.state/` file.
