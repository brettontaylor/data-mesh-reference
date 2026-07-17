# Skill Architecture Guide — Corporate Edition

How to build Claude Code skills that work in locked-down environments.

---

## Skill File Format

```yaml
---
name: skill-name
description: One-line description
allowed-tools:        # ONLY use these in corporate
  - Bash              # Run existing build/lint/test commands
  - Read              # Read files
  - Write             # Write files (markdown, config)
  - Edit              # Edit existing files
  - Grep              # Search code
  - Glob              # Find files by pattern
  - AskUserQuestion   # Get user input
  # NEVER include: WebSearch, WebFetch, Agent (may not be available)
---
```

---

## Key Principles

### 1. One Skill = One Cognitive Mode
- `/review` = paranoid security reviewer
- `/ship` = disciplined release engineer
- `/data-quality` = compliance auditor

### 2. Self-Contained
- No external dependencies (no web, no MCP, no APIs)
- All reference docs are local files in `/knowledge/`
- All state lives in `.context/` inside the repo

### 3. Safe by Default
- Read-only unless explicitly stated otherwise
- Never push to main — always feature branch
- Never echo credentials or PII
- Never install packages

### 4. Declare Allowed Tools
Only list tools that are available in your environment. Corporate setups often restrict to:
- `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `AskUserQuestion`

### 5. Anti-Patterns (Negative Examples)
LLMs need explicit "don't do this" instructions:
- "NEVER push to main"
- "NEVER echo connection strings"
- "NEVER install packages"

---

## GitHub Copilot Compatibility

If running inside Copilot Chat (not standalone Claude Code):

### Option 1: `.github/copilot-instructions.md`
Copilot reads this file automatically. Put your most critical rules here.

### Option 2: Manual Skill Invocation
Paste in Copilot Chat:
```
Read the file at .claude/skills/review/SKILL.md and execute that workflow against my current git diff
```

### Option 3: Prompt Templates
Extract the Steps section from any SKILL.md and save as a reusable prompt.

---

## State Management

All state lives in `.context/` (add to `.gitignore`):

```
.context/
  MEMORY.md           # Project memory
  HANDOFF.json        # Session handoff
  session-learnings.md # Process improvements
  retros/             # Retrospective history
    2026-03-24.json
```

This avoids any user-home-directory dependencies that may be restricted.
