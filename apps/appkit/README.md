# @dct/appkit-app — Mapping and Metadata Platform on Databricks AppKit

A deployable **Databricks AppKit** (v0) implementation of the Mapping and
Metadata Platform (MMP): governed **asset entry/editing with a two-tier
maker/checker workflow** (tier 1 = domain approval, tier 2 = chief-data-architect
sign-off), **pipeline run controls**, and an **access management panel** — backed
by the platform engine (`@dct/engine`; the `@dct` npm scope is a legacy internal
namespace kept to avoid churn) — contracts are the source of truth, medallion
bronze→silver→gold, governance gates on every write path.

This is the reference for migrating Streamlit apps onto the AppKit foundation.
Guides: [`docs/appkit-migration/`](../../docs/appkit-migration/README.md).

## What it does

| Feature | Where | Backed by |
|---|---|---|
| Browse governed assets (BDM/PDM/semantic/mapping/dq/extract/transformation/refmap) | `/assets` | contract at `packages/engine/contracts/` (git SoR) |
| Create / update / retire assets (full change lifecycle incl. delete + withdraw) | `/assets/:kind/:id/edit` | zod validation + `checkContract()` governance gate at the door |
| **Automatic semantic versioning** — server-owned; cosmetic→patch, additive→minor, structural→major, new→1.0.0 | stamped at propose; `versionNotes` on the changeset | `server/versioning.ts` + engine `nextVersion`/`parseSemver` |
| **Live rules enforcer** — the exact proposal gates (zod → version plan → governance checks → tier), nothing persisted | `POST /api/validate` | `services.validate()` — same code path as propose |
| **Data products** — independently versioned asset bundles; merging a member change auto-increments every containing product and auto-triggers a product re-run | `GET /api/products` | `packages/engine/contracts/products/*.yaml` + engine `PRODUCT_*` governance check |
| **Models write-back** — merged YAML (+ bumped product YAML) written to the models repo, optionally git-committed | env-gated on merge | `server/writeback.ts` (`MODELS_WRITEBACK`, see below) |
| **Two-tier maker/checker**: tier 1 (minor) → owning-domain approval; tier 2 (impactful/breaking) → chief-data-architect/ARB sign-off; SoD enforced | `/changesets` | `server/tiering.ts` classifier + `@dct/auth` RBAC/domains + Lakebase/Postgres OLTP state |
| Trigger + monitor medallion pipeline runs | `/pipelines` | `runMedallion()` on synthetic data + gate results |
| Delta→Lakebase migration status | `/migration` | engine `postgres` generator output (`generated/postgres/`) |
| Access management panel: role×capability matrix, user registry, domain scopes, interactive access checker | `/access` | `server/access.ts` (IdP swap point) + `contracts/access.yaml` data-clearance model |
| **DQ rules library** — generic, parameterized rules (kind `dqrule`, column- or table-scoped) applied by rule sets via `use:` bindings and **executed on every pipeline run** | `/dq` + `GET /api/dq` | `contracts/dq-rules/*.yaml` + engine `resolveDqRule()` + runner DQ pass |
| **Governed mapping documents** — bronze→silver source mappings (field rules + **coverage** vs the target BDM) and silver→gold transformations (joins, unions, key resolution, bronze lineage tails); structured mapping editor with live coverage | `/mappings` + `GET /api/mappings` | kinds `mapping`/`transformation` + engine check #10 (`MAPPING_*`/`TRANSFORMATION_*` reference integrity) |
| **Model explorer** — the interactive ERD (React Flow, layered orthogonal layout): expand entities for PK/FK/classification/PII pills, traverse foreign keys, kind filters + compliance role views | `/explorer` (lazy-loaded) + `GET /api/erd` | vendored pre-built bundle `client/src/vendor/erd/` (from `apps/web/erd`) — data-driven off the live contract |

**Tier-2 triggers** (`server/tiering.ts`, conservative by design): asset deletion,
new BDM/PDM, major version bump, published-extract modification, status →
deprecated/retired, and BDM structural diffs (field removal, type change,
pk/bk change, classification downgrade, PII/MNPI flag change). Everything else
is tier 1 and routes to the owning domain's approvers.

**Auto-semver** (`server/versioning.ts`): the proposer never hand-picks a
version — the server diffs each edit against the current contract and stamps
the next version itself (proposer input is overridden for existing assets).
Cosmetic-only changes (`description`/`label`) → **patch**; any other
non-structural change → **minor**; any structural/tier-2 reason from the tier
classifier → **major**; new assets start at **1.0.0**; identical specs stay
put; deletes end the line (retired, no further versions). The same plan is
returned live by `POST /api/validate`, so an editor can show the verdict
(version bump + tier + governance issues) before anything is proposed.

**Data products** (`packages/engine/contracts/products/*.yaml`): a product
bundles governed assets under one independently versioned, domain-owned unit
(see `reference-data-360` and `trading-analytics` for the shape). Product
versions do **not** track member versions: merging any change to a member
increments every containing product on its own semver line — minor for tier-1
changes, major for tier-2 — then triggers a full product re-run (the run is
tagged `trigger: product-increment` with the product versions it executed
for). The engine validates products in `checkContract()` (`PRODUCT_DUPLICATE`,
`PRODUCT_VERSION_INVALID`, `PRODUCT_EMPTY`, `PRODUCT_MEMBER_UNRESOLVED`).

**DQ rules library** (`packages/engine/contracts/dq-rules/*.yaml`): a rule is
defined ONCE, generically — `scope: column|table`, a `check` primitive
(`not_null`, `unique`, `referential`, `range`, `regex`, `accepted_values`,
`row_count_min`, `freshness`), declared `params`, a default `severity`, and an
illustrative SQL `expression`. Rule sets **apply** library rules via
`use: <rule-id>` bound to a column (`field:`) or the table, overriding
params/severity per application; legacy inline `type:` rules still work. The
engine enforces applications in `checkContract()` (`DQRULE_*`,
`DQ_BINDING_SCOPE`, `DQ_BINDING_FIELD_UNKNOWN`, `DQ_PARAMS_MISSING`,
`DQ_LIBRARY_RULE_UNRESOLVED`) and the medallion runner **executes** every
resolved application against the gold rows — results ride on each run's
`LayerStats.dq` (pass/fail/skipped + violation counts). Governance cascade:
editing a library rule that is applied anywhere is automatically **tier 2**
("modifies a DQ library rule applied by N binding(s)"); deleting one that is
still referenced fails the proposal gate.

**Domains & products** (`contracts/domains/*.yaml`, `contracts/products/*.yaml`): the org
overlay. Domains are the top-level governed grouping (own products, own the access boundary);
products are versioned asset bundles within a domain. `GET /api/domains`, `/api/registry`
(flat rows with domain+product join), and `/api/catalog` (the dashboard payload incl. the real
bronze→silver→gold flow) drive the catalog/registry surfaces.

**Navigation** — 7 top-level pages: **Dashboard** (catalog: domains→products + medallion flow
viz), **Registry** (every asset in a filterable table + Changesets tab), **Mappings** (list +
full-width workbench detail), **Data Model** (ERD explorer + domain/product overlay), **DQ
Library**, **Pipelines** (runs + flow + Migration tab), **Access** (tabbed). Design system:
Atlassian-flavoured tokens, light default + dark toggle, shared `PageHeader`/`Breadcrumbs`
(`client/src/lib/page.tsx`).

## Architecture

```
client/  React 19 + react-router 7 (Vite)           — persona switcher (dev-auth)
server/  @databricks/appkit createApp
  ├─ server() plugin        Express + Vite dev middleware / static prod
  ├─ lakebase() plugin      deployed: OAuth-managed Postgres (pg.Pool)
  ├─ services.ts            contract SoR + maker/checker + medallion runs
  ├─ repo.ts                SqlRepo (Lakebase/Postgres) | MemoryRepo (local)
  └─ routes.ts              REST /api/* (mirrors apps/api shapes)
```

Modes:

- **local** (default, zero infra): stub WorkspaceClient (no Databricks auth),
  in-memory repo, contracts + synthetic data from the engine package.
  Optional `DATABASE_URL` for a real local Postgres.
- **databricks** (deployed): platform OAuth, Lakebase via the AppKit plugin
  (`PGHOST` etc. injected), identity via `x-forwarded-*` headers.

## Run locally

```bash
pnpm install                       # repo root
pnpm --filter @dct/appkit-app dev  # http://localhost:8000
```

Use the persona switcher (top right) to demo RBAC: Alice (modeler) proposes,
Bob (steward) approves — approving your own change is rejected (segregation of
duties) — Carol (domain owner) merges, Pat (platform engineer) runs pipelines.

## Deploy to Databricks Apps

1. **Prereqs**: Databricks CLI ≥ 0.240 authenticated (`databricks auth login`),
   Node 22+, a workspace with Apps + Lakebase enabled.
2. **Lakebase**: create (or pick) a project/branch/database:
   `databricks postgres list-projects` → `list-branches` → `list-databases`;
   put the instance/database into `databricks.yml`. Verify connectivity:
   `psql $PGHOST -c "select 1"`.
3. **Apply DDL** (once per database):
   - App workflow state: `server/schema.sql`
   - Migrated gold tables (from contracts): `packages/engine/generated/postgres/schema.sql`
4. **Build client**: `pnpm --filter @dct/appkit-app build` (emits `client/dist/`).
5. **Deploy**: from `apps/appkit/`:
   `databricks bundle validate && databricks bundle deploy -t dev`,
   then `databricks apps deploy mapping-metadata-platform`.
6. App identity: platform-authenticated users arrive via `x-forwarded-*` and get
   `APP_DEFAULT_ROLES` (default `modeler`) until IdP claim mapping is wired.

## Models write-back

Merges can persist to the models repo (git SoR) — env contract in
`server/writeback.ts`:

| Env | Values | Behaviour |
|---|---|---|
| `MODELS_WRITEBACK` | `off` (default) | Demo mode: merges update the in-memory contract only |
| | `fs` | Merged asset YAML + bumped product YAML written to `MODELS_DIR` |
| | `git` | `fs` + `git add` + `git commit` on the **current branch** of `MODELS_DIR`. Never pushes. **Refuses `main`/`master`** — the merge returns 409 and nothing mutates (corporate guardrail: direct commits to main are forbidden) |
| `MODELS_DIR` | path | Models repo root; defaults to the engine's `contracts/` dir |

Details: the merge is atomic (edits are staged on a cloned contract; a
write-back refusal leaves app state untouched). Deletes are **tombstones** —
the YAML is kept with `status: retired` (hard deletion of governed specs is a
manual, reviewed act). Git commits are formatted
`chore(models): <title> [changeset <id>, tier <n>]` with the product
increments listed in the body.

## Governance invariants (unchanged by this app)

- The contract is the source of truth; merges here update the projection and —
  with `MODELS_WRITEBACK=fs|git` — write YAML back to the models repo on a
  feature branch for PR review (see `apps/api` GovernanceService for the
  PR-based reference implementation).
- Every proposal runs `checkContract()`; contract-breaking edits are rejected (422).
- `pnpm check` (propagation gate) covers the `generated/postgres/` surface —
  contract changes that skip regeneration fail CI.
