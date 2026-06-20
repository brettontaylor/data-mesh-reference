# 01 — System Architecture

## 1. Architectural style

DEAL Control Tower is a **modular monolith** (deployable as one container) with clean
internal module boundaries that can be peeled into services later. This is the
right call for "stand up with minimal intervention": one process, one image,
optional horizontal scale — without the operational tax of microservices on day
one. Boundaries are enforced in code (package boundaries, dependency rules) so a
module (e.g., orchestration) can be extracted to its own service if scale demands.

Core tenets:

- **GitOps system of record (D1).** Model definitions are YAML in a Git repo. The
  app never silently mutates definitions; all changes flow through commits/PRs.
- **Postgres as a materialized projection (D2).** A background **reconciler** turns
  Git state into rows for fast queries, search, graph traversal, and workflow
  state. The projection is *rebuildable from Git at any time*.
- **Unity Catalog two-way sync (D2).** A connector pushes model-derived schemas,
  tags, and classifications into UC, and pulls existing UC assets in for
  reconciliation and discovery.
- **Stateless app tier (D3).** All durable state is in Postgres, Git, object
  storage, and Databricks. App replicas are interchangeable.

## 2. Logical architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CLIENTS                                                                         │
│  Web UI (Next.js)   CLI (dct)   SDK (TS/Python)   CI bots   External apps      │
└───────────────┬─────────────────┬───────────────────┬───────────────┬─────────┘
                │ HTTPS (OIDC)     │ token            │ token          │ token
┌───────────────▼─────────────────▼───────────────────▼───────────────▼─────────┐
│ API GATEWAY / EDGE  (rate limit, authn, request log, CORS, CSRF)               │
├────────────────────────────────────────────────────────────────────────────────┤
│ APPLICATION CORE (Node.js)                                                       │
│                                                                                  │
│  ┌────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Model svc  │ │ Governance  │ │ Orchestr.  │ │ Catalog &  │ │ Lineage svc  │ │
│  │ (CRUD over │ │ svc (state  │ │ svc (adapter│ │ Publication│ │ (graph,      │ │
│  │  Git, val- │ │ machine,    │ │  → engines)│ │ svc (docs, │ │  OpenLineage)│ │
│  │  idate,    │ │ maker/      │ │            │ │  contracts)│ │              │ │
│  │  simulate) │ │ checker,SoD)│ │            │ │            │ │              │ │
│  └─────┬──────┘ └──────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬───────┘ │
│        │               │              │              │               │         │
│  ┌─────▼───────────────▼──────────────▼──────────────▼───────────────▼──────┐  │
│  │ ENGINE (packages/engine): contracts model, generators, registry,         │  │
│  │ access policy, governance checks, semver, control-surface diff           │  │
│  └─────┬─────────────────────────────────────────────────────┬─────────────┘  │
│        │                                                       │                │
│  ┌─────▼───────┐ ┌───────────────┐ ┌──────────────┐ ┌─────────▼────────────┐  │
│  │ Git adapter │ │ Reconciler    │ │ Audit svc    │ │ AuthN/Z (OIDC, RBAC/ │  │
│  │ (provider   │ │ (Git→Postgres │ │ (append-only,│ │ ABAC, PII/MNPI)      │  │
│  │  abstraction│ │  projection)  │ │ hash-chain)  │ │                      │  │
│  └─────┬───────┘ └──────┬────────┘ └──────┬───────┘ └──────────────────────┘  │
│        │                │                 │                                     │
│  ┌─────▼────────┐ ┌─────▼─────────┐ ┌─────▼──────┐ ┌──────────────┐ ┌────────┐ │
│  │ Job runner / │ │ Event bus     │ │ Secrets    │ │ Search index │ │ Cache  │ │
│  │ scheduler    │ │ (outbox→NOTIFY│ │ provider   │ │ (PG FTS/     │ │ (in-mem│ │
│  │ (BullMQ)     │ │  / webhooks)  │ │ adapter    │ │  OpenSearch) │ │ /Redis)│ │
│  └──────────────┘ └───────────────┘ └────────────┘ └──────────────┘ └────────┘ │
└───────────────┬───────────────┬───────────────┬───────────────┬────────────────┘
                │               │               │               │
        ┌───────▼──────┐ ┌──────▼─────┐ ┌───────▼──────┐ ┌──────▼────────────┐
        │ Git provider │ │ PostgreSQL │ │ Object store │ │ Databricks         │
        │ (GitHub/GL/  │ │ (projection│ │ (S3/ADLS:    │ │ (Workflows, DLT,   │
        │  ADO/Bitbk)  │ │ +workflow  │ │  archives,   │ │  Unity Catalog,    │
        │  = SoR       │ │ +audit)    │ │  exports)    │ │  SQL warehouse)    │
        └──────────────┘ └────────────┘ └──────────────┘ └────────────────────┘
```

## 3. Core modules (responsibilities & boundaries)

| Module | Responsibility | Depends on |
|--------|----------------|------------|
| **Model service** | Read/propose model changes (commit/branch/PR via Git adapter), validate (engine), simulate impact & diff | Engine, Git adapter, Reconciler (reads) |
| **Governance service** | Lifecycle state machine, approval workflows, maker/checker, SoD, semver gate, change-set assembly | Engine, Git adapter, Audit, AuthZ |
| **Orchestration service** | Translate models → pipeline specs via engine; deploy/trigger/monitor via orchestration adapter; record runs | Engine, Orchestration adapter, Databricks |
| **Catalog & publication** | Render docs, expose contracts (JSON Schema/OpenAPI/JSON-LD), data-product pages, search | Reconciler, Engine |
| **Lineage service** | Build/serve the lineage graph; ingest OpenLineage run events; expose impact analysis | Postgres (graph), Databricks/OpenLineage |
| **Reconciler** | Materialize Git → Postgres projection; detect drift; rebuild on demand | Git adapter, Postgres |
| **Audit service** | Append-only, hash-chained audit log of every state-changing action | Postgres |
| **AuthN/Z** | OIDC/SAML login, session, RBAC/ABAC decisions incl. PII/MNPI | IdP, Engine (access model) |
| **Job runner** | Async/retryable jobs: reconcile, sync UC, deploy pipeline, poll runs | Postgres/Redis (queue) |
| **Event bus** | Transactional outbox → Postgres NOTIFY + outbound webhooks/Kafka | Postgres |

### Boundary rules (enforced by lint + CI)

- The **engine** has **zero** dependencies on services, HTTP, DB, or Node-only IO
  beyond the filesystem reader it already uses — it stays pure and unit-testable.
- Services depend on the engine and on **adapter interfaces**, never on concrete
  providers (no service imports the GitHub SDK directly; it imports `GitProvider`).
- The UI talks only to the API; it never reaches the DB or Git directly.

## 4. The GitOps + projection model (D1 + D2) — in detail

### 4.1 Why both Git and Postgres

- **Git** gives diffable history, branch/PR review, signed commits, blame,
  rollback, disaster recovery, and an auditable change medium reviewers already
  trust. It is the **system of record** for *definitions*.
- **Postgres** gives sub-second queries, full-text & faceted search, graph
  traversal (lineage/impact), workflow state, run history, and audit — things Git
  is bad at. It holds **runtime/operational metadata** and a **projection** of the
  definitions. It is *never* the source of truth for definitions.

### 4.2 Write path (proposing a change)

```
Modeler edits model in UI/CLI
        │
        ▼
Model svc validates with engine (schema, refs, classification, semver pre-check)
        │  (on success)
        ▼
Git adapter: create branch + commit (signed) + open PR  ──► Git provider (SoR)
        │
        ▼
Governance svc: create ChangeSet (status=in_review), compute control-surface diff,
                required semver bump, impact analysis; assign reviewers per CODEOWNERS/domain
        │
        ▼
Checker reviews diff in UI → approves (maker/checker + SoD enforced) → PR merged
        │
        ▼
Merge webhook → Reconciler materializes new state into Postgres projection
        │
        ▼
Post-merge jobs: regenerate artifacts, sync UC, (optionally) deploy pipeline, emit events
```

### 4.3 Read path

All reads (catalog, registry, lineage, search) hit the **Postgres projection** —
fast and rich. The projection carries the Git commit SHA it was built from, so any
record is traceable to an exact definition revision.

### 4.4 Reconciliation & drift

- A **merge webhook** triggers incremental reconcile. A scheduled job runs a full
  reconcile (e.g., every 10 min) as a safety net and to catch out-of-band commits.
- The reconciler is **idempotent**: it computes the desired projection from the Git
  tree at a SHA and upserts/deletes to match. A `dct reconcile --rebuild` wipes and
  rebuilds the projection from Git (the DR path).
- **Drift detection:** if the projection's SHA diverges from the repo's default
  branch head for longer than a threshold, raise an operational alert.

## 5. Monorepo layout

The repo (`data-mesh-reference`, evolving) becomes a workspace monorepo
(pnpm workspaces + Turborepo for task orchestration; Changesets for versioning):

```
/
├── packages/
│   ├── engine/                 # ← today's data-mesh-reference src/ (pure core)
│   │   ├── framework/          #   types, load, access engine, version utils
│   │   ├── generators/         #   databricks, snowflake, cube, catalog, access, registry
│   │   ├── governance/         #   structural checks
│   │   └── registry/           #   model registry, surface diff, lockfile
│   ├── contracts-spec/         # published JSON Schema / OpenAPI / JSON-LD of the model
│   ├── git-adapter/            # GitProvider interface + github/gitlab/ado/bitbucket impls
│   ├── orchestration-adapter/  # Orchestrator interface + databricks impl (+ stubs)
│   ├── catalog-adapter/        # UnityCatalog connector + OpenLineage in/out
│   ├── auth/                   # OIDC/SAML, session, RBAC/ABAC policy engine
│   ├── audit/                  # append-only hash-chained audit log
│   ├── sdk-ts/                 # TypeScript consumer/producer SDK
│   └── shared/                 # logging, config, errors, telemetry, db client
├── apps/
│   ├── api/                    # Node API service (Fastify/Nest) — the control plane
│   ├── web/                    # Next.js UI
│   ├── worker/                 # job runner (BullMQ) — reconcile, sync, deploy, poll
│   └── cli/                    # `dct` CLI (wraps engine + API)
├── sdk-python/                 # Python consumer SDK (thin REST client + models)
├── db/
│   └── migrations/             # SQL migrations (forward-only)
├── deploy/
│   ├── docker/                 # Dockerfiles, docker-compose.yml (one-command stand-up)
│   ├── helm/                   # Helm chart for k8s
│   ├── terraform/              # optional: Databricks + cloud infra modules
│   └── databricks-app/         # Databricks App bundle packaging
├── seed/                       # demo seed (the synthetic capital-markets models)
├── docs/                       # these docs + generated reference docs
└── examples/                   # sample consuming apps, CI integration recipes
```

> Migration note: the current `src/` moves under `packages/engine/`, `contracts/`
> become the **seed** model repo content, and `generated/` output is produced on
> demand. Backwards-compatible CLI (`dmref`) is preserved as an alias of `dct`.

## 6. Technology stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | **TypeScript (Node 22 LTS)** | One language across engine, API, UI, CLI, SDK; matches D3 |
| API framework | **Fastify** (or NestJS if DI/structure preferred) | Fast, schema-first (JSON Schema → OpenAPI for free) |
| UI | **Next.js 16 + React 19 + Tailwind v4** | Matches existing site; SSR + RSC; one design system |
| DB | **PostgreSQL 16+** | Projection, workflow, audit, FTS, `ltree`/recursive CTEs for graphs |
| DB access | **Prisma** (typed client) + raw SQL migrations | Typed client; raw SQL for views, RLS, constraints |
| Jobs/queue | **BullMQ on Redis** (Redis optional → PG-based queue fallback) | Retries, scheduling, backoff; degrade gracefully |
| Search | **Postgres FTS** (v1) → OpenSearch (scale) | No new dependency to start; pluggable |
| Auth | **openid-client / passport-saml**, JWT sessions | Standard OIDC/SAML; works with Entra/Okta |
| Git | **isomorphic-git / provider REST APIs** behind `GitProvider` | Provider-agnostic |
| Databricks | **@databricks/sdk** (REST) | Workflows, DLT, UC, SQL |
| Observability | **OpenTelemetry** (traces/metrics/logs), Prometheus, structured logs | Standard, vendor-neutral |
| Packaging | **Docker + docker-compose + Helm** | Minimal-intervention local; k8s for prod |
| IaC | **Terraform** (optional modules) | Reproducible Databricks/cloud setup |
| Tests | **Vitest** (unit), **Playwright** (e2e), **Pact** (contract) | Fast unit, real e2e, API contracts |

## 7. Deployment topologies

### 7.1 Minimal (single node / demo / small team)
`docker compose up` → app (api+web+worker in one image or three), Postgres, Redis.
Git = a hosted repo or a local bare repo; Databricks = optional (demo mode runs
the engine + local medallion without a workspace).

### 7.2 Standard (corporate, HA)
Kubernetes via Helm: `api` (N replicas), `web` (N replicas), `worker` (M replicas),
managed Postgres (HA), managed Redis, ingress with corporate TLS + OIDC,
secrets from the org secret manager, Databricks workspace via PrivateLink.

### 7.3 Databricks App packaging
The same image is wrapped as a Databricks App bundle (`deploy/databricks-app/`):
runs inside the workspace, inherits Databricks auth and network; Postgres is a
managed instance reachable from the app. Used when the org wants everything inside
Databricks' perimeter.

## 8. Environments & promotion

Three logical environments map to **Git branches + UC catalogs + Databricks
targets**: `dev` → `staging` → `prod`. Model changes promote by merging across
branches (or by environment-scoped tags), and the orchestration adapter deploys to
the matching Databricks target. Environment config is data, not code (see
[09](09-deployment-operations.md)).

## 9. Key cross-cutting concerns (pointers)

- **Multi-tenancy / domains:** every model belongs to a **domain**; domains map to
  Git paths + CODEOWNERS + UC schemas + RBAC scopes. → [02](02-domain-model.md), [03](03-governance-workflows.md)
- **Idempotency & exactly-once-ish:** all jobs idempotent; transactional outbox for
  events; reconcile is convergent. → [04](04-pipeline-orchestration.md), [10](10-edge-cases-and-adrs.md)
- **Backpressure & rate limits:** API rate-limited per principal; job concurrency
  capped per connector/workspace. → [09](09-deployment-operations.md)
- **Failure isolation:** a broken model or a down Databricks workspace degrades one
  capability, not the platform. → [10](10-edge-cases-and-adrs.md)
