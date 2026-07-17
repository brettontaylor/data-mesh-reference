# Corporate Environment Guardrails

Rules for using AI coding assistants in regulated, firewalled enterprise environments.

> **This repo (Mapping and Metadata Platform / DCT).** The rules below are the general corporate
> baseline. Three repo-specific non-negotiables sit on top of them and are enforced by
> the skills in `.claude/skills/`:
>
> 1. **Contracts are the source of truth.** `packages/engine/contracts/` generates the
>    Databricks · Cube · Snowflake · catalog surfaces in `packages/engine/generated/`.
>    A change that stops at the contract is **incomplete** — run `pnpm generate`, commit
>    the regenerated `generated/`, and `pnpm check` must pass. Never hand-edit generated files.
> 2. **Zero IP.** Generic/illustrative only — synthetic capital-markets data. No employer or
>    client names, no real data, no proprietary BDM/PDM schemas. **This is a public repo.**
> 3. **pnpm monorepo, no `lint`.** Gates are `pnpm typecheck`, `pnpm check`, `pnpm test`.
>    There is no `lint` script — never invoke `pnpm lint` / `npm run lint`.

---

## What AI Assistants Must NEVER Do

### Credentials & Secrets
- Never hardcode connection strings, API keys, tokens, or passwords
- Never echo/print/log credentials — even in debug output
- Never include credentials in commit messages or PR descriptions
- Never store secrets in source code, comments, or documentation
- Never read `.env` files and display their contents
- If credentials are found in code, flag the file:line but do NOT display the value

### Data & Privacy
- Never display actual PII (names, SSNs, account numbers) from databases or files
- Never include sample production data in code, tests, or documentation
- Never exfiltrate data outside the repository (no curl, no external API calls)
- Never create test fixtures with real customer data
- Never log user-identifiable information in application output

### Infrastructure & Access
- Never push directly to main/master/release branches
- Never modify CI/CD pipelines without explicit team review
- Never change IAM roles, security groups, or access policies
- Never install packages from unverified sources
- Never modify firewall rules or network configurations
- Never create or modify database users/roles
- Never execute DROP, TRUNCATE, or mass DELETE without explicit approval

### Compliance
- Never bypass code review requirements
- Never suppress security scan findings
- Never disable audit logging
- Never modify compliance-related configurations
- Never create workarounds for access controls

---

## What AI Assistants SHOULD Do

### Code Quality
- Run existing lint/test/build commands (whatever's in package.json, Makefile, etc.)
- Flag potential security issues during code review
- Enforce consistent patterns across the codebase
- Suggest existing utilities before creating new ones (DRY principle)
- Track technical debt in docs/known-issues.md

### Data Layer
- Validate medallion layer boundaries (Bronze/Silver/Gold)
- Check PII handling at each layer transition
- Verify data contracts between layers
- Flag direct Bronze reads from application code
- Ensure Gold layer has no unmasked PII

### Process
- Create feature branches for all changes (never commit to main)
- Write descriptive commit messages with conventional prefixes
- Document architectural decisions
- Maintain session continuity via HANDOFF.json
- Run retrospectives to track engineering health

### Security
- Flag hardcoded credentials in code review
- Verify authentication on all API routes
- Check input validation on all endpoints
- Ensure error messages don't expose internals
- Verify role-based access control is applied

---

## PR-Based Workflow (Required)

In corporate environments, ALL changes go through pull requests:

```
1. Create feature branch: git checkout -b feat/description
2. Make changes + commit
3. Push branch: git push origin HEAD
4. Create PR via web UI (or gh CLI if available)
5. Wait for review + CI checks
6. Merge via PR (squash or merge commit per team convention)
```

**The `/ship` skill enforces this** — it creates a branch and pushes, never touches main.

---

## Offline-Only Operation

These skills work without any network access beyond git push/pull:

- No web search (WebSearch, WebFetch removed from all skills)
- No MCP servers (no Gmail, Box, Chrome, external APIs)
- No localhost HTTP calls (verify skill uses code analysis instead)
- No package installation (npm install, pip install, etc.)
- No external file downloads

**All knowledge is pre-loaded** in the `/knowledge/` directory. Skills reference these files instead of searching the web.

---

## Audit Trail

For regulated environments, maintain an audit trail:

1. **Git history** — every change is a commit with author and timestamp
2. **HANDOFF.json** — session-by-session record of what was worked on
3. **`.context/retros/`** — periodic engineering health snapshots
4. **`docs/known-issues.md`** — tracked issues with severity and resolution
5. **`docs/roadmap.md`** — progress tracking with checkbox history

All of these are plain text files in the repo — auditable, versioned, and transparent.
