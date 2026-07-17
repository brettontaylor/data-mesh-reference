---
name: learn
description: |
  Explain a part of THIS codebase to a developer. Locate the relevant code, trace how
  it works end to end (contract → generators → generated, or medallion bronze→silver→gold),
  and produce a clear explanation with file:line references plus a small diagram when it
  helps. Invoke when the user says "explain how X works", "walk me through the medallion
  runner", "how does the catalog generator work", "help me understand this module", or
  "onboard me to the engine". Read-only, offline.

allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /learn — Explain This Codebase

Teach a developer how a piece of DCT actually works, grounded in the real code. You
read before you explain, you cite `file:line`, and you never invent behavior. This is
read-only and offline — no edits, no network.

## Step 1: Pin the target

Figure out exactly what to explain. If the request is vague ("explain the engine"),
ask ONE AskUserQuestion to narrow it — the whole `@dct/engine` package is a lot; a
developer usually wants one seam. Common seams:

- **The generation pipeline** — contract → generators → committed `generated/`.
- **The medallion runner** — bronze → silver → gold on synthetic data.
- **The governance gates** — what `pnpm check` enforces and why.
- **The registry** — how entities and their `produces` sources stay consistent.
- **One package** — audit, auth, catalog-adapter, events, git-adapter,
  orchestration-adapter, projection, sdk-ts, shared, or an app (api / cli / web / worker).

## Step 2: Locate the code

Find the real files before saying anything about them. Map the layout, then read.

```bash
git ls-files packages/engine/src | head -100
```

- Engine internals: `packages/engine/src/{framework,generators,governance,medallion,registry}`.
- Contracts (source of truth): `packages/engine/contracts/` — spec + entities
  (classified fields) + sources.
- Generated output (committed on purpose): `packages/engine/generated/`
  (Databricks · Cube · Snowflake · catalog surfaces).
- Root scripts that drive it all: `package.json` (`demo | generate | check | typecheck
  | build | test | models | register`).

Grep for the symbol or concept the developer named; Read the files end to end, not just
signatures. Read the tests too — they show intended behavior and edge cases.

## Step 3: Trace it end to end

Follow the data, not just the file list. Two backbone flows carry most of the repo:

- **Contract → generated:** a spec + classified entities in `packages/engine/contracts/`
  are loaded by the framework, fed to each generator in `src/generators`, and written as
  the Databricks / Cube / Snowflake / catalog artifacts in `packages/engine/generated/`.
  `pnpm generate` runs this; `pnpm check` proves the generated surfaces match the contract.
- **Medallion bronze → silver → gold:** the runner in `src/medallion` reads synthetic
  capital-markets data and promotes it through the layers; local output lands in
  `packages/engine/generated/medallion/` (gitignored). App code consumes Gold only.

Name each hop with its `file:line` so the developer can jump straight to it.

## Step 4: Explain, with evidence

Write the explanation top-down: one-sentence purpose, then the flow, then the details
that matter. Every non-obvious claim gets a `file:line`. Keep it concrete — name the
function, the script, the artifact, not "the system."

Add a small ASCII (or Mermaid) diagram when the shape is a pipeline or a dependency
chain — it renders everywhere and diffs cleanly. Example:

```
contracts/            src/generators/           generated/
  spec + entities  →   databricks · cube    →    committed artifacts
  (classified)         snowflake · catalog       (pnpm check verifies)
```

Close with: where to look next, which script exercises this path, and one thing that
would surprise a newcomer (a non-obvious "why" you found in the code or comments).

## Step 5: Offer a next step

Point the developer at the natural follow-on: `/investigate` if they were chasing a
bug, `/spec` if they're about to change this area, or another `/learn` on the adjacent
seam. Do not start making changes — this skill only explains.

## Rules (corporate)

- Read-only. Explain code; do not edit it. No `pnpm generate`, no commits from this skill.
- Offline only. No curl/fetch/WebSearch/WebFetch/MCP, no localhost. Everything you cite
  comes from files in this repo.
- Ground every claim in code. Cite `file:line`; never describe behavior you did not read.
- Never echo credentials or PII encountered while reading — reference `file:line`, not the value.
- Reinforce the repo's rules when explaining the pipeline: contracts are the source of
  truth, a contract edit must propagate via `pnpm generate` + `pnpm check`, and app code
  reads Gold only (no direct Bronze, no unmasked PII in Gold).
