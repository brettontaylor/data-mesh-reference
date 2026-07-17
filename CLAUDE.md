# Mapping and Metadata Platform (MMP) — project guide

Generic, illustrative reference architecture for a metadata-driven data mesh,
evolving into the **Mapping and Metadata Platform** (formerly "DEAL Control
Tower" — the `@dct` npm scope remains as a legacy internal namespace).
Published by Semantic Quay, Inc.; orchestrated from `C:\BTCENTER\semantic-quay\`.

## Non-negotiables

- **Zero IP.** Generic and illustrative only. No employer or client names, no
  real data, no proprietary BDM/PDM schemas. The domain is a synthetic
  capital-markets dataset. This is a public repo — keep it clean.
- **Contract is the source of truth.** Change `contracts/` and regenerate. A
  change that stops at the contract is incomplete — it must propagate to the
  generated Databricks / Cube / Snowflake / catalog surfaces, and
  `npm run check` must pass.

## How it works

TypeScript framework (runnable/testable with Node) reads YAML contracts and
generates the real bank-stack artifacts. It follows a single-source-of-truth,
spec-generates-everything pattern, adapted to Databricks · Cube · Snowflake.

- `contracts/` — spec + entities (classified fields) + sources
- `src/framework` — types + loader
- `src/generators` — databricks · snowflake · cube · catalog · postgres (Lakebase DDL)
- `src/governance` — the CI gates
- `src/medallion` — local bronze→silver→gold runner
- `generated/` — committed output (regenerate with `pnpm generate`)

Apps: `apps/api` (Fastify control plane) · `apps/web` (Next.js site) ·
`apps/appkit` (**Databricks AppKit app** — governed asset entry + pipeline
controls on Lakebase; deploy-ready; see `docs/appkit-migration/` for the
Streamlit→AppKit and Delta→Postgres guides).

## Commands

```bash
npm run demo       # check → generate → run → verify propagation
npm run check      # governance gates only
npm run generate   # write generated/
npm run run        # local medallion on synthetic data
npm run typecheck
```

Always run `pnpm typecheck` and `pnpm check` before shipping. If you add an
entity, add it under `packages/engine/contracts/entities/` and register it in its
source's `produces` — the registry-consistency gate enforces both.

## Team skills & guardrails (`.claude/`)

This repo ships a **corporate-safe Claude Code skill library** so every developer works
the same way. All skills are offline (no web/MCP/installs), PR-based (never push to
`main`), and tuned to this stack. Guardrail source of truth:
[`.claude/knowledge/corporate-guardrails.md`](.claude/knowledge/corporate-guardrails.md).

**Always-on:** `.claude/settings.json` pre-approves the safe pnpm/git read commands and
screens destructive shell commands for approval (the `/careful` guard). It's committed —
teammates get it automatically. Personal overrides go in `.claude/settings.local.json`
(git-ignored). Session state lives in `.context/` and `.claude/.state/` (git-ignored).

**Skills** (invoke with `/<name>`):

| Group | Skills |
|---|---|
| Ship & review | `/ship` (PR-only), `/review` (+ checklist), `/plan-review` |
| Data mesh / medallion | `/medallion-plan`, `/data-quality`, `/cascade-plan`, `/verify` |
| Understand & document | `/investigate`, `/learn`, `/spec`, `/document-generate` |
| Session & health | `/start-session`, `/save-session`, `/retro`, `/health` |
| Safety guards | `/careful`, `/freeze`, `/unfreeze`, `/guard` |

The golden rule holds across all of them: **contracts are the source of truth** — a
change that stops at the contract is incomplete; regenerate `packages/engine/generated/`
and make `pnpm check` pass.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **data-mesh-reference** (1393 symbols, 2702 relationships, 111 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/data-mesh-reference/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/data-mesh-reference/context` | Codebase overview, check index freshness |
| `gitnexus://repo/data-mesh-reference/clusters` | All functional areas |
| `gitnexus://repo/data-mesh-reference/processes` | All execution flows |
| `gitnexus://repo/data-mesh-reference/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
