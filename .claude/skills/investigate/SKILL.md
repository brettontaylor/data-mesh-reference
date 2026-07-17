---
name: investigate
description: |
  Systematic root-cause debugging by code analysis only (offline, no live/browser
  repro). Reproduce from code, form hypotheses, trace with Grep/Read across the
  monorepo, confirm the root cause with file:line evidence, then propose a minimal
  fix and note its blast radius. Invoke when the user says "debug this", "why is
  this broken", "root cause", "investigate this error", "it was working yesterday",
  or pastes a stack trace / failing test. Read-only by default.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /investigate — Root-Cause Debugging (code analysis)

Find the real cause before touching anything. This repo is offline and locked down,
so you reproduce and confirm from the code and git history, not from a running app
or a browser. **Iron law: no fix without a confirmed root cause.**

This is a read-only investigation. Do NOT apply a fix unless the user explicitly
asks. When they do, keep the diff minimal and confirm `pnpm typecheck` and
`pnpm check` still pass.

## Step 1: Collect the symptom

Read the exact error, stack trace, failing test name, or described behavior. If the
report is too thin to act on, ask ONE precise question via AskUserQuestion (which
command was run — `pnpm generate`, `pnpm check`, `pnpm test`? which package? full
output?). Do not guess your way past a missing symptom.

## Step 2: Reproduce from code

You cannot click a UI here. Trace the failing path statically instead:
- Which script triggers it? (`pnpm demo | generate | check | typecheck | build | test`
  — all defined in root `package.json`, mostly filtered to `@dct/engine`.)
- Read the entry point for that path (`packages/engine/src/{framework,generators,governance,medallion,registry}`)
  and follow the call chain by hand.
- For a governance failure, the gate lives under `packages/engine/src/governance`;
  for a bad generated surface, under `packages/engine/src/generators`; for a
  medallion run, under `packages/engine/src/medallion`.

## Step 3: Check what changed

A regression means the cause is in a recent diff. Scope the log to the suspect files:

```bash
git log --oneline -20 -- <affected-path>
```

If the contract is the suspect, remember the golden rule of this repo: an edit to
`packages/engine/contracts/` that was never followed by `pnpm generate` leaves
`packages/engine/generated/` stale — a classic source of "the output is wrong but
the code looks right." Check whether contracts and generated output are in sync.

## Step 4: Form and trace hypotheses

State one specific, testable claim about what is wrong and why. Then trace it with
Grep (find every reference / caller) and Read (understand the logic). Common shapes:

| Pattern | Signature | Where to look |
|---------|-----------|---------------|
| Stale generated output | `pnpm check` fails on propagation/registry | contract edited, `generate` not re-run |
| Registry drift | entity exists but no source `produces` it (or vice versa) | `contracts/entities/`, source `produces`, `src/registry` |
| Null / undefined propagation | TypeError on an optional field | missing guards in `src/generators` or `src/framework` |
| Medallion boundary break | Gold reads Bronze directly, or PII leaks to Gold | `src/medallion` bronze→silver→gold ordering |
| Type mismatch | `pnpm typecheck` red | classified field type vs generated type |

Confirm the hypothesis with evidence — quote the offending `file:line`. If it does
not hold, discard it and form the next one. Do not stack a fix on an unconfirmed guess.

## Step 5: Confirm the root cause

You have the root cause when you can point to the exact `file:line` that is wrong and
explain why it produces the symptom. If three hypotheses fail, STOP and reassess via
AskUserQuestion — recurring bugs in the same files are an architectural smell, not a
coincidence. Offer: (A) new hypothesis, (B) escalate for human review, (C) add a
targeted assertion/log and note it for next time.

## Step 6: Propose the fix + blast radius

Report, don't apply (unless asked):

```
DEBUG REPORT
Symptom:      <what was observed / which command failed>
Root cause:   <what is actually wrong> @ <file:line>
Evidence:     <the lines that prove it, plus git-log context if a regression>
Fix:          <smallest change that removes the cause> @ <file:line>
Propagation:  <if contracts touched: which generated surfaces must be regenerated,
               and that `pnpm generate` + `pnpm check` must be re-run>
Blast radius: <files/packages affected; see /cascade-plan if it spans many>
Status:       DONE (root cause confirmed) | BLOCKED (unclear after investigation)
```

If the fix would touch many files or cross package boundaries, say so plainly and
suggest scoping it with `/cascade-plan` before anyone edits code.

## Rules (corporate)

- Read-only investigation. Do not edit code unless the user explicitly asks; then keep
  the diff minimal and re-run `pnpm typecheck` and `pnpm check`.
- Offline only. No curl/fetch/WebSearch/WebFetch/MCP, no localhost, no external lookups.
  Reproduce and confirm from code and `git log`, never from a live service.
- Never install packages or add dependencies to "fix" a bug without human review.
- If you touch `packages/engine/contracts/`, you must `pnpm generate` and commit the
  regenerated `packages/engine/generated/`; `pnpm check` must pass. A change that stops
  at the contract is incomplete.
- Never echo credentials or PII found while tracing — cite `file:line` only, never the value.
- Respect medallion boundaries: app code reads Gold only; no direct Bronze reads; no
  unmasked PII in Gold.
- Never push to `main`/`master`. Any fix goes through a feature branch + PR.
