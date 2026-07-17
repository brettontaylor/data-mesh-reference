#!/usr/bin/env bash
# /freeze boundary hook (PreToolUse: Edit, Write). Fail-open convenience guard.
# Blocks edits to files outside the directory recorded in .claude/.state/freeze-dir.txt.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE="$ROOT/.claude/.state/freeze-dir.txt"
[ -f "$STATE" ] || exit 0   # no boundary set -> allow everything
INPUT="$(cat)"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif [ -x "/c/Program Files/nodejs/node.exe" ]; then
  NODE_BIN="/c/Program Files/nodejs/node.exe"
else
  exit 0   # no node -> fail open
fi
printf '%s' "$INPUT" | "$NODE_BIN" "$ROOT/.claude/skills/freeze/bin/check-freeze.js" "$STATE" "$ROOT"
