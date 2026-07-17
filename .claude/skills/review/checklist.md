# Pre-Landing Review Checklist — DCT (Mapping and Metadata Platform)

## Instructions

Review the diff vs the base branch (detect: `git symbolic-ref refs/remotes/origin/HEAD`,
fallback `main`) for the issues below. Cite `file:line` and suggest a fix. Skip anything fine.

**Two-pass review:**
- **Pass 1 (CRITICAL):** blocks PR approval.
- **Pass 2 (INFORMATIONAL):** logged, non-blocking.

Never echo credential or PII values — cite `file:line` and name the issue class only.

---

## Pass 1 — CRITICAL

### Contract → generated propagation (the golden rule of this repo)
- A file under `packages/engine/contracts/` changed but `packages/engine/generated/`
  was NOT regenerated/staged in the same diff. Propagation is broken — `pnpm check`
  would fail. Fix: run `pnpm generate`, stage `generated/`, confirm `pnpm check` passes.
- Only part of the generated surface (Databricks · Cube · Snowflake · catalog) updated
  for a contract change — regeneration must be complete and consistent.
- A new entity added under `contracts/entities/` but not registered in its source's
  `produces` (registry-consistency gate would fail).

### Hand-edited generated output
- Files under `packages/engine/generated/` edited by hand instead of via the contract.
  Generated output is derived — Fix: revert the manual edit, change the contract, regenerate.

### Zero-IP violations (this is a PUBLIC repo)
- Real employer or client names, real (non-synthetic) data, or proprietary BDM/PDM
  schemas introduced anywhere. The domain must stay generic, illustrative, synthetic
  capital-markets data. Fix: replace with generic/synthetic equivalents before landing.

### Credential & secret exposure
- Hardcoded connection strings, API keys, tokens, passwords in source.
- `.env` / secret configs staged for commit.
- Credentials in comments, TODOs, or debug logging; tokens in URL query params.
- **Never echo the credential — cite `file:line` and say "hardcoded credential detected".**

### Medallion boundary violations
- App code (`apps/*`) reading directly from Bronze/Silver instead of Gold.
- Direct writes to Bronze from application code (must go through the ingestion pipeline).
- PII present in Gold/serving layer without masking.
- Cross-layer joins that bypass the transformation pipeline.
- Transformation logic placed in the wrong medallion layer.

### Database / ORM safety
- Raw SQL built by string interpolation (injection risk).
- Missing `WHERE` on `UPDATE`/`DELETE` (mass modification).
- N+1 queries (query calls in a loop without batching).
- `DROP`/`TRUNCATE`/mass `DELETE` without an explicit approval workflow.
- Schema changes without a migration plan.

### API route security (`apps/api`)
- Routes missing authentication/authorization.
- No role-based access control on sensitive endpoints.
- Missing input validation on request body/params.
- Error responses leaking internal stack traces or system details.
- Uploads without size/type validation; CORS misconfiguration.

### Data privacy
- PII logged to console, files, or monitoring.
- User data in error messages.
- Audit-trail gaps (sensitive operations without logging).
- Data retention beyond policy.

---

## Pass 2 — INFORMATIONAL

### Dead code & consistency
- Unused variables/imports; stale comments describing old behavior.
- Commented-out code blocks (remove, don't comment).
- Type definitions not matching the current contract/schema.

### Test gaps
- New entities, generators, or medallion stages without test coverage.
- Complex governance/transformation logic without edge-case tests.
- New API endpoints/services without tests.

### Performance
- Unbounded queries (no LIMIT / pagination).
- Large result sets loaded into memory.
- Synchronous operations that could be async.

### Code organization
- Business logic in the route/controller layer (belongs in a service/engine module).
- Shared utilities duplicated across packages instead of using `@dct/shared`.

---

## Suppressions — DO NOT flag
- Harmless redundancy that aids readability.
- Correctly inferred type annotations.
- Consistency-only changes with no functional impact.
- Issues already addressed in the diff being reviewed.
- Regenerated `generated/` output that correctly matches a contract change in the same diff.
- TODOs that reference a tracked ticket number.
