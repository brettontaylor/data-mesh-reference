#!/usr/bin/env bash
# /careful destructive-command hook (PreToolUse: Bash). Fail-open safety guard.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
INPUT="$(cat)"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif [ -x "/c/Program Files/nodejs/node.exe" ]; then
  NODE_BIN="/c/Program Files/nodejs/node.exe"
else
  exit 0   # no node -> fail open
fi
printf '%s' "$INPUT" | "$NODE_BIN" "$ROOT/.claude/skills/careful/bin/check-careful.js"
