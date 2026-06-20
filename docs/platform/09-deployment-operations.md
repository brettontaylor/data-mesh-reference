# 09 — Deployment & Operations

Design target: **clone → set a handful of values → one command → running**, with a
clean path to HA production.

## 1. Packaging

- **Single container image** builds all runtimes; a `ROLE` env selects `api`,
  `web`, or `worker` (or `all` for single-node). Distroless base, multi-arch, signed
  (cosign), SBOM attached.
- **docker-compose** (`deploy/docker/`) for local/minimal: app(all) + Postgres +
  Redis + (optional) a local bare Git repo + seed loader.
- **Helm chart** (`deploy/helm/`) for k8s: separate `api`/`web`/`worker`
  Deployments, HPA, PodDisruptionBudgets, NetworkPolicies, Ingress (TLS+OIDC),
  external Postgres/Redis, secret refs.
- **Terraform** (`deploy/terraform/`, optional) for Databricks workspace objects +
  cloud Postgres/Redis/object store, so the data-plane side is reproducible.
- **Databricks App bundle** (`deploy/databricks-app/`) per [08 §7](08-databricks-integration.md#7-databricks-app-packaging-optional-d3).

## 2. Configuration (one source, layered)

- A single typed config (`harbormaster.yaml` + env overrides) validated at boot;
  the app **refuses to start** on invalid/missing required config with a precise
  message (fail fast, no half-up state).
- Layering: defaults → `harbormaster.yaml` → env vars → secret manager. Secrets
  never in the YAML.
- Key config groups: `server`, `database`, `redis`, `git` (provider, repo, bot
  identity), `idp` (OIDC/SAML), `databricks` (workspaces/envs), `secrets`
  (provider), `policy` (quorum matrix, classification rules), `notifications`,
  `retention`, `featureFlags`.
- `.env.example` enumerates every variable with comments (zero real values).

## 3. First-run bootstrap ("minimal intervention")

On first start the app runs an idempotent bootstrap:
1. Run DB migrations (forward-only).
2. Verify connectivity: DB, Redis, Git provider, IdP discovery, Databricks (warn,
   not fail, if Databricks absent → demo mode).
3. If `git.repo` empty → optionally scaffold a models repo from `seed/` (the
   synthetic capital-markets models) so the platform is immediately explorable.
4. Reconcile Git → projection.
5. Print a **first-run wizard URL**: configure IdP group→role mapping, create the
   first domain, connect a Databricks workspace. The sealed bootstrap admin is
   auto-disabled once IdP is wired.

Result: `docker compose up` yields a working, seeded, explorable platform in
minutes with no manual DB or schema steps.

## 4. CI/CD

### 4.1 Platform repo (the app)
- PR pipeline: typecheck, unit (Vitest), lint/boundary rules, build, e2e
  (Playwright against compose), contract tests (Pact), SCA + secret scan + SBOM,
  image build + sign.
- Release: Changesets versions packages; tagged release publishes the image + Helm
  chart + SDKs (npm/pypi) + the docs site.

### 4.2 Models repo (customer's data models)
- A provided **reusable CI workflow** runs the engine gates on every PR
  (`hbr validate`, `checkContract`, `checkVersions`, propagation, secret/term scan)
  and posts results to the ChangeSet — so governance holds even for changes made
  directly in Git, not just via the UI.
- Branch protection templates (required reviews, no self-approve, required checks)
  ship with the chart for one-click setup.

## 5. Observability

- **OpenTelemetry** traces/metrics/logs; OTLP export to the org's stack (Grafana/
  Datadog/etc.). Structured JSON logs with correlation + actor (redacted of
  secrets/PII values).
- **Golden signals** per service + domain metrics: reconcile lag, projection drift,
  approval cycle time, gate pass rates, pipeline run success/SLA, UC drift count,
  audit-chain integrity, queue depth, webhook delivery success.
- **Health endpoints:** `/health` (liveness), `/ready` (readiness incl. DB/Git/IdP),
  `/version`. Dashboards + alert rules shipped as Grafana JSON.

## 6. Scaling & performance

- **Stateless app tier** → scale `api`/`web` horizontally; `worker` scales by queue
  depth (HPA on custom metric).
- Postgres is the main shared resource: read replicas for catalog/lineage reads;
  partition `audit_event` and `pipeline_run` by time; FTS now, OpenSearch when
  search load demands.
- Projection rebuild is chunked + resumable for very large model estates.
- Per-principal API rate limits + per-workspace job concurrency caps protect
  downstreams.

## 7. Backup, DR & business continuity

- **Git is the SoR** → definitions survive total platform loss; `hbr reconcile
  --rebuild` reconstructs the projection from Git.
- **Postgres**: PITR backups (workflow state, audit, run history, lineage). The
  **audit chain** is included and verified on restore.
- **Object store**: versioned; exports/archives retained per policy.
- **RTO/RPO targets** documented; restore drills scripted. Multi-region: active-
  passive with replicated Postgres + the same Git SoR; promote standby on failover.

## 8. Upgrades & migrations

- Forward-only DB migrations gated in CI; backward-compatible for one minor
  (rolling upgrade safe).
- Engine/contract-standard version is tracked; a model-standard migration tool
  bulk-upgrades models across a major with a reviewable ChangeSet.
- Blue/green or rolling deploys via Helm; health-gated; auto-rollback on failed
  readiness.

## 9. Runbooks (shipped in `docs/runbooks/`)

- Reconcile drift / rebuild projection.
- Rotate Git bot token / Databricks creds / IdP secret.
- Break-glass procedure (dual-control, time-box, audit).
- Recover a failed pipeline deploy; quarantine a poison run.
- Restore from backup + verify audit chain.
- Onboard a domain; onboard an existing UC estate.
- Incident: Databricks down / IdP down / Git provider down (degradation matrix).

## 10. Cost of ownership

- Minimal footprint: 1 small app node + managed Postgres + Redis for a team; scale
  with usage. No data duplication (metadata only). Databricks cost is governed and
  surfaced, not incurred by the platform itself.
