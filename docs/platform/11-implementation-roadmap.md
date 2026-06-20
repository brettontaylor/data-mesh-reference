# 11 — Implementation Roadmap & Playbook

How to build Harbormaster from today's `data-mesh-reference`, phase by phase, with
work breakdown, testing strategy, and acceptance criteria. Each phase is shippable
and independently valuable.

## 1. Guiding sequencing principles

1. **Engine first, then control plane, then UX, then integrations, then hardening.**
2. **Every phase ends runnable** (`docker compose up`) with the `local` orchestrator
   so there's never a "can't demo it" gap.
3. **GitOps + projection before workflows** — the spine must exist before governance.
4. **Adapters stubbed early** (local/in-memory) so vertical slices complete without
   waiting on Databricks/IdP.

## 2. Phase plan

### Phase 0 — Monorepo foundation (1 sprint)
- Convert repo to pnpm workspaces + Turborepo + Changesets.
- Move `src/` → `packages/engine`; keep `dmref` CLI working; CI green.
- Add `packages/shared` (config, logging, errors, telemetry, db client).
- Scaffold empty `apps/api`, `apps/web`, `apps/worker`, `apps/cli`, `packages/*`
  adapter packages with interfaces only.
- **Acceptance:** `pnpm build/test` green; `dmref demo` still passes; image builds.

### Phase 1 — GitOps spine + projection (1–2 sprints)
- `git-adapter` interface + a `local` (bare repo) impl + GitHub impl.
- Postgres schema + migrations (`model`, `model_field`, `model_version`, `domain`,
  `model_edge`).
- **Reconciler**: Git tree@SHA → projection (idempotent); `hbr reconcile [--rebuild]`.
- `apps/api` read endpoints: domains, models, registry, search (FTS).
- Seed loader (synthetic models) → models repo → projection.
- **Acceptance:** edit a model in Git → reconcile → it appears via API; rebuild from
  Git reproduces the projection exactly.

### Phase 2 — Catalog & consumption read surfaces (1–2 sprints)
- Catalog/publication service: model/product detail, generated contracts
  (schema/openapi/jsonld), `/.well-known`.
- Port the existing developer UI (catalog, model detail, registry, interactive ERD,
  access demo, semantic query) into `apps/web` against the live API.
- `packages/sdk-ts` (generated from OpenAPI) + `sdk-python` skeleton.
- Access engine wired as ABAC masking on all read paths (no auth yet → dev role).
- **Acceptance:** consumers can discover + read products with attribute masking; ERD
  + registry render from the projection; SDK round-trips.

### Phase 3 — AuthN/Z (1–2 sprints)
- `auth` package: OIDC (Entra/Okta) + session; group→role mapping; API keys/service
  principals; RBAC capabilities; ABAC clearances from groups.
- Postgres RLS on model/field/views.
- Admin: IdP config, role mapping, domains.
- **Acceptance:** SSO login; a viewer sees masked data, a steward sees their domain;
  RLS blocks cross-domain even via direct SQL; keys are scoped + revocable.

### Phase 4 — Governance & workflows (2–3 sprints) — the core differentiator
- `audit` package: append-only, hash-chained, verifier job, SIEM stream.
- Governance service: ChangeSet model, lifecycle state machine, control-surface
  diff (engine), semver gate, impact analysis, gates pipeline.
- Maker/checker + SoD + quorum matrix; PR creation via git-adapter; merge gate.
- Web: model editor (form+YAML, validate, simulate), ChangeSet review (diff,
  classification deltas, impact tree, gates, approvals), governance dashboards.
- Reusable **models-repo CI workflow** + branch-protection templates.
- **Acceptance:** the [worked example](03-governance-workflows.md#9-worked-example-end-to-end)
  runs end-to-end; self-approval blocked; PII change forces +1 governance; audit
  chain verifies; direct-Git changes are gated too.

### Phase 5 — Orchestration (2 sprints)
- `orchestration-adapter` interface + `local` (in-process medallion) + `databricks`
  (DLT + Workflows via Asset Bundles).
- Pipeline service: deploy/trigger/monitor; `pipeline`/`pipeline_run` projection;
  run console UI; DQ contracts → DLT expectations.
- Environments (dev/staging/prod) + promotion; four-eyes prod deploy.
- **Acceptance:** a model change generates + deploys a Databricks pipeline to
  staging; runs tracked; DQ results + freshness surfaced; `local` adapter runs the
  whole thing in CI without Databricks.

### Phase 6 — Lineage + Unity Catalog sync (2 sprints)
- `catalog-adapter`: UC push (schemas/tags/masks), UC pull (import/reconcile),
  system-table ingestion.
- Lineage service: static lineage from engine + OpenLineage ingestion; lineage
  explorer UI; impact analysis powered by lineage.
- Reconciliation engine (Git↔projection↔UC↔lineage) + drift dashboards.
- **Acceptance:** column-level lineage source→consumer; UC shows model-driven tags;
  drift detected + remediable; import an existing UC estate as candidate models.

### Phase 7 — Events, subscriptions, notifications (1 sprint)
- Transactional outbox → NOTIFY + webhooks (HMAC, retries, DLQ) + optional Kafka.
- Product subscriptions; breaking-change notifications; notification adapters
  (email/Slack/Teams/in-app).
- **Acceptance:** subscriber gets notified before a breaking merge; webhook delivery
  retries + dead-letters + replays.

### Phase 8 — Hardening, ops & GA (1–2 sprints)
- Helm chart, Terraform modules, Databricks App bundle, first-run wizard.
- Observability dashboards/alerts; backup/restore drills; chaos tests (kill
  Databricks/IdP/Git → verify graceful degradation).
- Security: SCA/SBOM/signing, pen-test fixes, threat-model review.
- Docs site, runbooks, examples, reference architecture published.
- **Acceptance:** clean-room install per README in < 1 hour; HA on k8s; restore
  drill passes; security checklist green.

### Post-GA (roadmap, designed-for)
- GDPR/CCPA pack (purpose/lawful-basis tags, RTBF propagation, residency sharding).
- BCBS 239 evidence pack (lineage completeness scoring, DQ evidence bundles).
- Retention + legal hold (WORM, e-discovery export).
- Additional orchestrators (Airflow, dbt); additional catalogs (Collibra/Purview
  federation); streaming-first contracts; MDM/ER module (optional).

## 3. Work-breakdown summary (by package)

| Package/app | Primary phases | Key deliverables |
|-------------|----------------|------------------|
| `packages/engine` | 0 | (exists) + envelope fields, product class, DQ generation |
| `packages/shared` | 0 | config, logging, telemetry, db client, errors |
| `packages/git-adapter` | 1 | interface + local + GitHub (+ GitLab/ADO/Bitbucket later) |
| `apps/api` | 1–7 | REST/GraphQL, services, gateway |
| `apps/worker` | 1,4,5,6,7 | reconcile, gates, deploy, poll, sync, webhooks |
| `apps/web` | 2,3,4,5,6,7 | catalog, ERD, editor, review, console, lineage, admin |
| `packages/auth` | 3 | OIDC/SAML, RBAC/ABAC, keys, RLS policies |
| `packages/audit` | 4 | hash-chained log + verifier + SIEM |
| `packages/orchestration-adapter` | 5 | interface + local + databricks |
| `packages/catalog-adapter` | 6 | UC sync + OpenLineage |
| `packages/sdk-ts` / `sdk-python` | 2+ | typed clients |
| `apps/cli` | 1+ | `hbr` (supersedes `dmref`) |
| `deploy/*` | 8 | docker/helm/terraform/databricks-app |

## 4. Testing strategy

| Layer | Approach |
|-------|----------|
| Engine | Vitest unit (already strong); property tests on semver/severity; golden-file tests on generators |
| Services | Vitest + ephemeral Postgres (Testcontainers); idempotency + concurrency tests on reconcile/jobs |
| API | Contract tests (Pact) so SDKs/consumers can't break silently; OpenAPI schema validation |
| Auth/Z | Policy unit tests (RBAC matrix + ABAC mask truth tables); RLS integration tests |
| Governance | Scenario tests for the full lifecycle incl. SoD/quorum/break-glass; audit-chain integrity tests |
| Orchestration | `local` adapter e2e in CI; Databricks adapter integration tests behind a flag (real workspace) |
| UI | Playwright e2e against compose; accessibility checks; visual checks via Chrome MCP |
| Resilience | Chaos: dependency outages → assert graceful degradation; restore-from-backup drill |
| Security | SCA, secret scan, banned-term (zero-IP) scan, SBOM, image signing in CI |

## 5. Definition of done (per change)
- Tests written + green; types clean; lint + boundary rules pass.
- Gates green (engine governance) for any model/seed change.
- Docs updated (these docs + generated reference); changelog (Changesets) entry.
- Zero-IP scan clean; no secrets; a11y pass for UI.
- Observability: new flows emit metrics/traces/audit events.

## 6. Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Scope sprawl ("solve everything") | Strict phase gates; compliance add-ons explicitly post-GA |
| Two-store complexity (Git+PG) | Reconcile is the single convergence path; rebuild-from-Git tested continuously |
| Databricks coupling | Adapter + `local` impl; integration tests flagged, not blocking |
| Corporate variance (IdP/Git/secrets) | Adapter interfaces; conformance test kits per provider |
| Adoption | Seed demo, great catalog UX, SDK/CLI, "minimal intervention" install |

## 7. First two weeks (concrete start)
1. Phase 0 monorepo conversion (engine intact, `dmref` working, CI green).
2. `git-adapter` (local) + Postgres migrations + reconciler skeleton.
3. `apps/api` read endpoints + seed loader → a live catalog reading from a Git repo.
4. Port the existing developer UI onto the live API.
→ Outcome in two weeks: the current demo, now backed by GitOps + a real metastore —
the foundation everything else builds on.

## 8. Next action
On approval of this plan, begin **Phase 0** (monorepo foundation). It is low-risk,
preserves everything that works today, and unlocks parallel work on the spine
(Phase 1) and the ported UI (Phase 2). I can scaffold Phase 0 + the package/interface
skeletons in the repo whenever you give the word.
