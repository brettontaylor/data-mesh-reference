---
name: spec
description: |
  Write a concise implementation spec / design doc for a feature BEFORE building it.
  Captures problem, approach, affected packages/apps, contract & medallion impact,
  interfaces/contracts, test plan, risks, and out-of-scope — then writes a markdown
  spec under docs/specs/. Invoke when the user says "spec this out", "write a design
  doc", "let's plan this feature", "turn this into a ticket", or "what would it take
  to build X". Read code first; write one markdown file. No implementation.

allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Write
  - AskUserQuestion
---

# /spec — Author an Implementation Spec

Turn a fuzzy request into a spec precise enough that another developer (or a later
session) could build it without follow-up questions. You interrogate the intent, read
the actual code, then write one markdown design doc. You do NOT implement — the only
output is the spec file.

You are friendly but relentless: ambiguity is a bug. Push back on scope creep ("that's
a separate spec") and premature solutions ("let's lock *what* and *why* before *how*").
Quantify — "several files" is not acceptable, find the exact count.

## Phase 1: Why

Ask via AskUserQuestion until you can crisply answer all five (skip ones already clear):

1. **Who** is affected — an app (api / cli / web / worker), the engine, a downstream
   consumer of a generated surface, or the dev team?
2. **What** is the current behavior (verified, not assumed)?
3. **What** should it be instead?
4. **Why now** — blocking work, correctness bug, governance/compliance, cost?
5. **How will we know it's done** — an observable check, e.g. "`pnpm check` passes with
   the new gate" or "the new entity appears in the catalog surface".

Do not proceed until all five hold without hand-waving.

## Phase 2: Scope and boundaries

Lock these before touching solutions:

1. **Out of scope** — name it explicitly; it prevents creep.
2. **What it touches** — which packages (`@dct/engine`, audit, auth, catalog-adapter,
   events, git-adapter, orchestration-adapter, projection, sdk-ts, shared) and apps.
3. **Ordering constraints** — must A land before B?
4. **The MVP cut** — the smallest version that delivers the value.
5. **Failure modes / rollback** — what breaks if this ships wrong.

## Phase 3: Read the code first (mandatory)

Before writing the spec, ground it in the real codebase. Grep/Glob/Read at least the
files this feature would change and cite them. Map the request to evidence:

- A concrete symbol or file named → Grep it, Read it, cite `path:line`.
- A project-level ask → Read `package.json`, the relevant `packages/*/src` or
  `apps/*` directory, and any existing `docs/` note; cite what you found.
- **Always check the contract seam.** Determine whether the feature changes
  `packages/engine/contracts/` (spec / entities / sources). If it does, it will
  regenerate surfaces in `packages/engine/generated/` — you must spell that out in
  Phase 4. If truly greenfield, say "searched X, Y, Z; found nothing; treating as new."

## Phase 4: Write the spec

Write ONE markdown file to `docs/specs/<kebab-title>.md` (create `docs/specs/` if
absent) using this structure:

```markdown
# Spec: <title>

## Problem
<who, current behavior, desired behavior, why now — from Phase 1>

## Approach
<the chosen approach in a few sentences; note alternatives rejected and why>

## Affected packages / apps
<exact list: packages/engine/... , apps/... , with file paths from Phase 3>

## Contract & medallion impact
<Does this change `packages/engine/contracts/`? If yes: which entities/sources, and
which generated surfaces regenerate (Databricks / Cube / Snowflake / catalog) under
`packages/engine/generated/`. State that `pnpm generate` must run and `pnpm check`
must pass — a change that stops at the contract is INCOMPLETE. Does it touch the
medallion runner (`packages/engine/src/medallion`) or the bronze→silver→gold
boundaries? Confirm app code still reads Gold only and no unmasked PII reaches Gold.
If no contract/medallion impact, say so explicitly.>

## Interfaces / contracts
<new or changed types, function signatures, CLI flags, entity fields, gate rules>

## Test plan
<how it's verified at each layer: `pnpm typecheck`, `pnpm check` (governance gates),
`pnpm test`, and a local `pnpm run`/`pnpm demo` on synthetic data if relevant>

## Risks
<what could go wrong; propagation/registry-consistency risks; rollback>

## Out of scope
<explicit list from Phase 2>
```

Present the draft path and a short summary. Ask "Does this capture it? What did I get
wrong?" and iterate until the user confirms.

## Phase 5: Hand off

Confirm the spec file is written. Point the user at `/investigate` (if a bug prompted
it) or straight to implementation on a feature branch. Do NOT start building.

## Rules (corporate)

- Output is one markdown spec under `docs/specs/`. No implementation, no code edits.
- **Enforce the golden rule in the impact section:** if the feature touches
  `packages/engine/contracts/`, the spec MUST require `pnpm generate` + committed
  `packages/engine/generated/` + passing `pnpm check`. A change that stops at the
  contract is incomplete.
- Offline only. No curl/fetch/WebSearch/WebFetch/MCP, no localhost, no `gh`/network
  dedupe. Ground the spec in code you actually read.
- Never install packages or propose new dependencies without flagging them for human review.
- Never spec changes to CI/CD, IAM, firewall, or DB users/roles; no DROP/TRUNCATE/mass
  DELETE without explicit human approval — flag such scope, don't design it in silently.
- Never echo credentials or PII into the spec — cite `file:line` only.
- Zero IP: generic, illustrative, synthetic capital-markets data only. Public repo.
- Never push to `main`/`master`. The spec and any later work go through a feature branch + PR.
