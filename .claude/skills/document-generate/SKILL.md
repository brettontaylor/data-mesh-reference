---
name: document-generate
description: |
  Generate or refresh in-repo markdown documentation — README sections, module docs,
  architecture notes — from the actual code and contracts. Research the source, then
  produce accurate markdown that cites its sources. Invoke when the user says "write
  docs for this", "document this module", "update the README", "generate architecture
  notes", or "explain this feature in the docs". Plain markdown only — no PDF/export,
  no browser, no network.

allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - AskUserQuestion
---

# /document-generate — In-Repo Markdown Docs from Code

Produce documentation that is correct because it was read out of the code, not guessed.
You research the source and contracts first, then write plain markdown files in the repo.
Every claim is traceable to a `file:line`. No external tools, no network — markdown only.

## Step 1: Scope

Decide what to document and where it lands. If unclear, ask ONE AskUserQuestion:

- **What** — a module (`packages/engine/src/{framework,generators,governance,medallion,registry}`),
  a package (audit, auth, catalog-adapter, events, git-adapter, orchestration-adapter,
  projection, sdk-ts, shared), an app (api / cli / web / worker), the contract →
  generated pipeline, or the whole project.
- **Where** — inline in an existing file (README, an `ARCHITECTURE.md`), a new file under
  `docs/`, or both. Follow whatever convention `docs/` already uses if it exists.

## Step 2: Research (do not skip)

Documentation quality tracks how well you understand the code. Read before you write.

```bash
git ls-files | grep -vE '/(node_modules|dist|build)/' | head -200
```

For the target:
- Read the implementation end to end, not just signatures.
- Read the tests — they reveal intended behavior and edge cases.
- Read `packages/engine/contracts/` when the topic touches data shape — the contracts
  (spec + classified entities + sources) are the source of truth for what the generated
  Databricks / Cube / Snowflake / catalog surfaces contain.
- Read the root `package.json` scripts (`demo | generate | check | typecheck | build |
  test | models | register`) so any commands you document are real.

Build a short internal outline before writing: purpose (one sentence), key concepts,
public surface (scripts, functions, entity fields, generated artifacts), dependencies,
and any non-obvious "why" you found in comments or design.

## Step 3: Write accurate markdown

Write the docs. Match content to reader need — keep reference (what it is), how-to (how
to do a task), and explanation (why it works this way) distinct; don't blend them.

- **Reference** — factual and complete, pulled straight from code. Include real types,
  defaults, constraints, and examples that would actually run (e.g. the exact `pnpm`
  command and its effect). No loose paraphrase.
- **How-to / tutorial** — actionable steps with the exact commands and a way to verify
  ("run `pnpm check` — it should pass"). Show the real output where it matters.
- **Explanation / architecture** — lead with the problem, then the approach, then the
  trade-offs. Use an ASCII or Mermaid diagram for pipelines (contract → generators →
  generated) or the medallion bronze → silver → gold flow; they render and diff everywhere.

Cite sources: reference the `file:line` or script a statement comes from so the next
reader (and the next generation of these docs) can re-verify.

## Step 4: Cross-link and self-review

- Link new docs from the natural entry point (README section, `docs/` index) so they are
  reachable in a click or two. Grep for `](` links you added and confirm the targets exist.
- Accuracy gate before you finish: every command shown is a real script; every type/field
  matches the code; no reference to a renamed or removed entity; no stale contract detail.
  If the code changed and a doc claim no longer holds, fix the doc.

## Step 5: Report

List the files written or updated and the one-line purpose of each. Do not commit or push
unless the user asks; if they do, stage the doc files by name (never `git add -A`) on a
feature branch.

## Rules (corporate)

- Plain in-repo markdown only. No PDF, no HTML export, no browser, no doc-site build step.
- Offline only. No curl/fetch/WebSearch/WebFetch/MCP, no localhost, no external references.
  Everything documented is read from this repo.
- Accuracy is non-negotiable. Every code/command/field claim must trace to the source;
  if unsure, re-read the code — do not guess. Cite `file:line`.
- When documenting the pipeline, state the repo's golden rule: contracts are the source of
  truth and a contract edit must propagate via `pnpm generate` + `pnpm check`. Keep docs in
  sync with `packages/engine/generated/`; do not describe a surface the contracts don't produce.
- Never put credentials or PII in docs — not even as examples pulled from real data. Use
  obviously-synthetic placeholders; reference sensitive code by `file:line`, never by value.
- Respect medallion framing: app code reads Gold only; no unmasked PII in Gold.
- Zero IP: generic, illustrative, synthetic capital-markets data only. This is a public repo.
- Never push to `main`/`master`. Docs go through a feature branch + PR.
