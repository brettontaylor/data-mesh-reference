# MMP AppKit Handover — this drop → corporate fork

Pick up the latest **Mapping and Metadata Platform** reference drop into your corporate
fork. This drop delivers four self-contained surfaces plus one small engine fold-in:

1. **`apps/appkit/`** — a deployable **Databricks AppKit** app: governed asset
   entry/editing with a **two-tier maker/checker workflow** (tier 1 = domain
   approval, tier 2 = chief-data-architect/ARB sign-off), pipeline run controls,
   Delta→Lakebase migration status, and an **access management panel** — plus,
   in the latest feature drop: **automatic semantic versioning** (server-owned,
   §1.8), a **live no-persist validation endpoint** (`POST /api/validate`,
   §1.8), **data products with independent versioning** (§1.7), and **models
   write-back to git** (§1.9).
2. **Engine fold-in** — the `postgres` generator (contract → Lakebase Postgres
   DDL, wired into `generateAll()` and the propagation gate) **plus the
   data-product threading** (`Product` type, `contracts/products/` loading,
   product governance checks — §1.7).
3. **`docs/appkit-migration/`** — the Streamlit→AppKit and Delta→Lakebase
   migration guides.
4. **`.claude/`** — 19 corporate-safe Claude Code skills, a knowledge base
   (including the corporate guardrails), and committed team `settings.json`.

> **This drop is referenced by PATH, not SHA.** At the time of writing these are
> working-tree changes in the reference repo about to be committed; "this drop"
> means the paths listed below as they exist at the tip of the reference repo's
> `main` once it lands. Everything below identifies content by path.

> Your fork has diverged (lending/finance domain, server-side ERD, re-branding —
> which our repo root now matches: package name `mapping-metadata-platform`).
> Unlike previous drops, **most of this one does not collide with your
> divergence**: the AppKit app, the migration docs, and the `.claude/` tooling
> are new directories your fork does not have. Those are **wholesale copies**.
> Only the engine generator wiring is a fold-in.

## 0. TL;DR

| Track | What | Pickup mode |
|---|---|---|
| **A** | `apps/appkit/` — AppKit app (server + client + bundle) | **Wholesale copy** — new dir, zero collisions. Adapt the `@dct/*` workspace dep names if your scope differs; your contracts replace the synthetic ones automatically via `@dct/engine` |
| **B** | Engine `postgres` generator + data-product threading | **Fold-in** — 1 new file + 5 touched files + 2 sample product contracts (listed in §2B), then regenerate |
| **C** | `docs/appkit-migration/` — 3 migration guides | **Wholesale copy** |
| **D** | `.claude/` — skills + knowledge + team settings | **Wholesale copy** — team-wide AI guardrails; merge if you already have a `.claude/` |
| **E** | Naming (`mapping-metadata-platform`, README/CLAUDE.md framing) | **No action** — you renamed first; our repo root now matches your naming |
| **F** | `apps/streamlit/` — **Streamlit parallel child** (thin client over the same `/api/*`) + `docs/handover/STREAMLIT-PARALLEL-PLAN.md` | **Wholesale copy** — new dir, no `package.json` (pnpm ignores it). Point `MMP_API_BASE` at your AppKit server, then run the plan's page-by-page migration of your existing Streamlit app. Alignment is structural (both UIs call identical endpoints), not manual — this is the mechanism to flip the switch and stay aligned (§1.14) |

> **Current feature surface at a glance:** two-tier maker/checker governance with
> SoD, auto-semver, a live no-persist enforcer, and write-back + git commit
> (audit-in-git); nine governed asset kinds (bdm/pdm/semantic/mapping/dq/dqrule/
> extract/transformation/refmap) plus first-class **domains** and **products**,
> every one an independently versioned changeset citizen; a generic→applied→
> executed **DQ rules library**; governed **mapping documents** (bronze→silver +
> silver→gold with coverage); a medallion data plane with a Postgres/Lakebase
> generator and Delta→Lakebase migration; a 7-nav IA (catalog + medallion flow,
> registry, ERD explorer, light/dark, breadcrumbs); and dual deploy targets
> (Databricks Apps + Lakebase, or local zero-infra). The full index is the
> **Current state** section immediately below; detail lives in §1.x.

---

## Current state — feature inventory

Everything the AppKit app does today, grouped. This is the index — the detail
lives in the §1.x sections cited per row.

**Governance** (§1.2, §1.3, §1.8, §1.9)
- Two-tier **maker/checker** workflow: tier 1 = domain approval, tier 2 =
  chief-data-architect / ARB sign-off; conservative auto-classification at
  proposal time.
- **Segregation of duties** — an author can never approve/reject/sign off their
  own changeset, at either tier.
- **Automatic semantic versioning** — the server diffs each edit and stamps
  patch/minor/major; the proposer never hand-picks a version.
- **Live rules enforcer** (`POST /api/validate`) — runs the exact proposal-time
  gates and persists nothing; the endpoint an editor UI polls as the user types.
- **Write-back + git commit** — merges persist to the models repo (git SoR),
  env-gated `off|fs|git`; git mode commits on a feature branch, refuses
  main/master, never pushes → **audit-in-git**.

**Model management** (§1.1, §1.7, §1.13)
- Nine governed asset kinds — `bdm`, `pdm`, `semantic`, `mapping`, `dq`,
  `dqrule`, `extract`, `transformation`, `refmap` — plus first-class **domains**
  and **products**, all versioned changeset citizens (tiering, auto-semver,
  write-back).

**DQ rules library** (§1.10)
- Generic rules defined once → applied at table/column level by rule sets →
  **executed** against gold rows on every medallion run (results ride on
  `LayerStats.dq`).

**Mapping documents** (§1.11)
- Bronze→silver (`mapping`) + silver→gold (`transformation`), joined with
  **coverage** (mapped/target fields + the unmapped list) as the review signal.

**Products & Domains** (§1.7, §1.13)
- Products version **independently** of their members: any merged member change
  auto-increments every containing product (minor tier-1 / major tier-2) and
  re-runs it; domains are the top-level grouping that owns products, with
  domain routing driving approval scope.

**Data plane** (§1.4)
- Local **medallion runner** (bronze→silver→gold on synthetic data); the
  **Postgres/Lakebase generator** (contract → gold serving DDL); **Delta→Lakebase**
  migration status from `generated/postgres/manifest.json`.

**UX** (§1.12, §1.13)
- **7-nav IA**: Dashboard (catalog: domains→products + medallion flow), Registry
  (+ Changesets), Mappings (workbench), Data Model (ERD explorer + overlay), DQ
  Library, Pipelines (+ Migration), Access — with the ERD explorer, light/dark
  theming, breadcrumbs, and a persona switcher.

**Deploy** (§1.1)
- **Databricks Apps + Lakebase** (Asset Bundle + attached database resource) or
  **local zero-infra mode** (stub workspace client + in-memory repo).

**Parallel UI** (§1.14)
- A **Streamlit parallel child** (`apps/streamlit/`) — a second thin client over
  the same `/api/*`, so both UIs render identical governed truth and the team
  can flip between them during a page-by-page migration.

---

## 1. What changed in this drop

### 1.1 The AppKit app — `apps/appkit/` (`@dct/appkit-app`)

A presentation/integration layer over the existing engine — no framework
duplication. The contract (git) stays the source of truth for asset
definitions; only **workflow state** (changesets, pipeline runs) lives in
Lakebase/Postgres.

**Server** (`apps/appkit/server/`):

| File | Role |
|---|---|
| `server.ts` | `createApp` with `server()` + `lakebase()` plugins; picks the repo (Lakebase plugin → `DATABASE_URL` pool → in-memory) and mounts routes via `appkit.server.extend()` |
| `local-dev.ts` | **Local stub-client mode**: `isLocalMode()` (no `DATABRICKS_HOST`/`DATABRICKS_CLIENT_ID` → local), `applyLocalEnvDefaults()` pins `DATABRICKS_WORKSPACE_ID=0`, and `makeStubWorkspaceClient()` is injected via createApp's `client` option so AppKit boots with zero Databricks auth |
| `repo.ts` | `Repo` interface with two backends: `SqlRepo` (Lakebase plugin or any Postgres via `DATABASE_URL`) and `MemoryRepo` (zero-infra dev/CI). Types: `Changeset` (with `tier`, `tierReasons`, `domains`), `ModelEdit`, `PipelineRun` |
| `services.ts` | Contract SoR reads; `propose()` classifies the tier, applies the auto-semver version plan, runs `checkContract()` **at the door** (structural break → 422), and persists with `versionNotes`; `validate()` runs the same gates with **nothing persisted** (§1.8); `decide()`/`withdraw()`; `merge()` stages on a clone → increments containing products → write-back → swaps the contract → auto product-increment run (§1.7/§1.9); `triggerRun()` executes `runMedallion()` + both gate suites; `migration()` reads `generated/postgres/manifest.json` |
| `versioning.ts` | Auto-semver: `applyVersionPlan()` computes and **stamps** each edit's next version server-side (details in §1.8) |
| `writeback.ts` | Models write-back to the git SoR, env-gated `MODELS_WRITEBACK=off\|fs\|git` (details in §1.9) |
| `tiering.ts` | The two-tier classifier + `domainOf()` domain routing (details in §1.2) |
| `access.ts` | Role/capability/user registry + `accessOverview()` + `checkAccess()` (details in §1.3) |
| `routes.ts` | REST surface; principal resolution: dev-auth headers (`x-dct-user`/`x-dct-roles`) → Databricks Apps forwarded identity (`x-forwarded-email`/`x-forwarded-user` + `APP_DEFAULT_ROLES`) → anonymous viewer (dev-auth only) |
| `schema.sql` + `repo.ts` DDL | OLTP: `dct_app.changeset` (incl. `tier`, `tier_reasons`, `domains`, and now `version_notes`) + `dct_app.pipeline_run` (now incl. `trigger`, `products`). `SqlRepo.init()` creates the full current shape; **pre-existing databases need the `ALTER TABLE` lines in §2** (`CREATE TABLE IF NOT EXISTS` does not add columns) |

**REST surface** (all under `/api`, mirrors `apps/api` shapes):

```
GET  /api/meta                          app info, mode, store, asset counts, principal
GET  /api/assets?kind=&q=               browse all 8 governed kinds
GET  /api/assets/:kind/:id              asset detail (contract SoR)
GET  /api/changesets                    list proposals
POST /api/changesets                    propose (zod-validated; governance gate; tier classified; auto-semver stamped)
POST /api/validate                      live rules enforcer: full proposal gates, nothing persisted (§1.8)
POST /api/changesets/:id/approve        tier-routed decision (see §1.2)
POST /api/changesets/:id/reject         tier-routed decision
POST /api/changesets/:id/merge          change:merge; atomic: clone → product increments → write-back → swap → auto re-run
POST /api/changesets/:id/withdraw       author-only, proposed-only
GET  /api/access                        the full access panel payload
GET  /api/access/check?sub=&capability=&domain=   interactive access validator
GET  /api/products                      data products with versions + member counts (§1.7)
GET  /api/runs · POST /api/runs         medallion run history / trigger (pipeline:deploy); runs carry trigger + products
GET  /api/migration                     Delta→Lakebase status from generated/postgres/
```

**Client** (`apps/appkit/client/src/`): React 19 + react-router 7 (Vite). Pages:
**Dashboard, Assets, AssetDetail, AssetEdit, Changesets, Pipelines, Migration,
Access** — with a **persona switcher** (top right) that sets the dev-auth headers
so you can demo the full maker/checker flow as Alice (modeler) → Bob/Frank
(domain stewards) → Carol (domain owner) → Dana (CDA) → Pat (platform engineer).

**Deploy config**: `app.yaml` (runtime command + `APP_MODE=databricks`,
`DEV_AUTH=false`, `APP_DEFAULT_ROLES`, `LAKEBASE_ENDPOINT` valueFrom the attached
database resource) and `databricks.yml` (Asset Bundle
`mapping-metadata-platform`, Lakebase database resource with
`CAN_CONNECT_AND_CREATE`). `.env.example` documents local vs deployed env.

### 1.2 The two-tier change framework — `apps/appkit/server/tiering.ts`

Every proposal is classified automatically at proposal time by diffing each edit
against the current contract. Classification is conservative: when in doubt,
escalate to tier 2.

**Tier-2 escalation rules** (`classifyChange()`):

| Rule | Trigger |
|---|---|
| Deletion | any `action: "delete"` — asset retirement is consumer-impacting |
| New first-class model | a `bdm` or `pdm` id that doesn't exist yet (architectural change) |
| Extract modification | any edit to an *existing* `extract` (published consumer contract) |
| Major version bump | `major(spec.version) > major(existing.version)` — declared breaking |
| Lifecycle regression | `status` transitions to `deprecated` or `retired` |
| BDM structural diffs | field **removal** · field **type change** · **pk/bk change** · **classification downgrade** (rank: public < internal < confidential < restricted) · **PII/MNPI flag change**. Additive nullable fields and description edits stay tier 1 |

**Routing** (`AppServices.decide()`):

- **Tier 1 (minor)** — decider needs capability `change:approve` **and domain
  membership of EVERY owning domain** in the changeset's `domains` list.
- **Tier 2 (impactful/breaking)** — decider needs `change:signoff`
  (chief data architect / architecture review board), domain-independent.
- **Segregation of duties** — the author can never approve/reject/sign off their
  own changeset, at either tier.
- **Withdraw** — the author (and only the author) can withdraw a still-proposed
  changeset.
- **Merge** — `change:merge` (domain owner+), only from `approved`.

**Domain derivation** (`domainOf()` — **this is the function you re-point at
your domain taxonomy**, see §2A):

| Kind | Owning domain |
|---|---|
| `bdm` | `group === "reference"` → `reference`, else `trading`; unknown → `platform` |
| `pdm` | via its `bdm` |
| `semantic` | `analytics` |
| `mapping` | via its target BDM, falling back to its source BDM, else `platform` |
| `dq` | via its target BDM, else `governance` |
| `extract` | `consumption` |
| `transformation` | via its first source entity's BDM, else `consumption` |
| `refmap` | `reference` |

### 1.3 The access management panel — `apps/appkit/server/access.ts`

- **Roles × capabilities matrix**: 9 roles (`viewer, modeler, steward,
  domain_owner, platform_engineer, governance, chief_data_architect,
  architecture_review_board, admin`) × 9 capabilities (`catalog:read,
  model:propose, change:approve, change:signoff, change:merge, pipeline:deploy,
  governance:admin, audit:read, admin`), computed by `@dct/auth`
  `capabilitiesFor()` / `clearanceFor()`.
- **User registry**: the demo persona list in `USERS` (Alice/Bob/Frank/Carol/
  Dana/Pat + viewer). **IdP swap point**: replace `USERS` / `listUsers()` usage
  in `access.ts` with your SCIM/OIDC group feed — the payload shapes stay
  identical.
- **Checker endpoint**: `GET /api/access/check?sub=&capability=&domain=` returns
  `{allowed, reasons[]}` — human-readable reasons for both the capability grant
  and the domain-scope check.
- **Data-clearance model**: the panel payload includes `dataAccessModel` straight
  from the governed access contract
  (`packages/engine/contracts/access.yaml`) — the same roles that drive
  Snowflake masking and the postgres masked-view comments.
- **`approvalPolicy` payload**: the two-tier policy stated *as data* (tier-1
  requires/routing, tier-2 requires/routing, merge capability, SoD sentence) so
  the panel renders governance policy without hardcoding it in the client.

### 1.4 The engine `postgres` generator (Delta→Lakebase toolchain)

New generator `packages/engine/src/generators/postgres.ts`, emitting into
`packages/engine/generated/postgres/`:

- `postgres/tables/<entity>.sql` — standalone per-entity DDL
- `postgres/schema.sql` — the full serving schema (idempotent, re-applyable)
- `postgres/manifest.json` — machine-readable manifest the Migration page and
  migration tooling diff against

Design:

- **Single `gold` schema** — Lakebase serves the gold layer only, mirroring the
  Snowflake serving generator (bronze/silver stay in Delta; Postgres is the OLTP
  copy).
- **Type mapping**: `decimal(p,s)`→`numeric(p,s)` (bare `decimal`→
  `numeric(38,9)`), `int`→`integer`, `bigint`→`bigint`, `date`→`date`,
  `timestamp`→`timestamptz`, `boolean`→`boolean`, `string`/unknown→`text`.
- **Classification carried in `COMMENT ON COLUMN`**; `restricted` columns are
  **excluded from the serving copy entirely**; PII/MNPI columns get masked-view
  guidance whose allowed roles are computed by the same access engine as the
  Snowflake masking policies.
- **Keys**: `pk` → `PRIMARY KEY`; `bk` → `NOT NULL` + a
  `<entity>_business_key UNIQUE (...)` constraint.
- **Propagation-gate coverage**: `packages/engine/src/governance/checks.ts` now
  requires `postgres/tables/<entity>.sql` per entity plus `postgres/schema.sql`
  and `postgres/manifest.json` — a contract change that skips regeneration
  fails `pnpm check` / CI.

Wiring: `packages/engine/src/generators/index.ts` imports and calls
`generatePostgres(c)` inside `generateAll()`; `packages/engine/src/cli.ts`
header comment lists the surface.

### 1.5 Migration guides — `docs/appkit-migration/`

- `README.md` — index + the golden rule (contract is the source of truth).
- `streamlit-to-appkit.md` — inventory phase, widget→component mapping table,
  session-state translation, data-access split (warehouse analytics vs Lakebase
  OLTP), jobs plugin, on-behalf-of auth, worked end-to-end example,
  strangler-pattern rollout + acceptance checklist.
- `delta-to-lakebase-postgres.md` — OLTP-vs-analytics decision table, the
  contracts→generate→apply flow, type-mapping reference, backfill (JDBC /
  staged COPY / CDF incremental), validation and dual-run, cutover + rollback,
  PII classification handling, Lakebase operational specifics.

### 1.6 Corporate AI tooling — `.claude/`

- `.claude/skills/` — 19 corporate-safe skills (careful, cascade-plan,
  data-quality, document-generate, freeze/unfreeze, guard, health, investigate,
  learn, medallion-plan, plan-review, retro, review, save-session, ship, spec,
  start-session, verify) plus the gitnexus reference set.
- `.claude/knowledge/` — `corporate-guardrails.md` (the baseline every skill
  cites), `medallion-architecture.md`, `skill-architecture.md`.
- `.claude/settings.json` — **committed team config**: pre-approved read-only +
  pnpm-gate commands, `.env` read denial, and an always-on PreToolUse hook that
  screens destructive shell commands.

### 1.7 Data products — independent versioning (engine + app)

A **product** bundles governed assets under one independently versioned,
domain-owned unit. Product versions do **not** track member versions: any
merged change to a member increments every containing product on its own
semver line — **minor for tier-1** changes, **major for tier-2/breaking** —
and triggers a full product re-run (tagged `trigger: product-increment` with
the product versions it executed for).

Engine threading (part of Track B):

| File | Change |
|---|---|
| `packages/engine/src/framework/types.ts` | New `Product` interface (`product`, `label?`, `domain`, `owner?`, `version`, `status?`, `description?`, `includes: AssetRef[]`) + `products: Product[]` on `Contract` |
| `packages/engine/src/framework/load.ts` | Products loaded from `contracts/products/*.yaml` (both `loadContract()` and the in-memory `contractFromFiles()` path) |
| `packages/engine/src/governance/checks.ts` | New check #8 — product integrity: `PRODUCT_DUPLICATE`, `PRODUCT_VERSION_INVALID` (semver), `PRODUCT_EMPTY` (no members), `PRODUCT_MEMBER_UNRESOLVED` (member `{kind,id}` must resolve in the contract) |
| `packages/engine/contracts/products/` | 2 sample product contracts: `reference-data-360.yaml` (10 reference-domain members), `trading-analytics.yaml` (9 trading members) — **shape templates only; author your own** (§2A) |

App surface: `GET /api/products` (products + member counts); `/api/meta` lists
product versions; merged product bumps appear in the merge response
(`productIncrements: [{product, from, to, level}]`).

### 1.8 Automatic semantic versioning + the live rules enforcer

The proposer **never hand-picks a version** — `server/versioning.ts` diffs
each edit against the current contract and stamps the next version
server-side (proposer input is overridden for existing assets), using the
engine's own `nextVersion`/`parseSemver`:

| Change | Level | Rule |
|---|---|---|
| Cosmetic only (`description`, `label`) | **patch** | deep-diff with cosmetic keys stripped is identical |
| Additive / behavioural (new fields, rule/logic changes) | **minor** | non-cosmetic diff, no structural reason |
| Structural / breaking | **major** | any tier-2 structural reason from the tier classifier |
| New asset | **1.0.0** | (or the proposer's valid initial version) |
| Identical spec | none | no-op edit, version unchanged |
| Delete | retired | version line ends; write-back keeps a `status: retired` tombstone (§1.9) |

The plan lands on the changeset as `versionNotes` (one human-readable note per
edit; persisted in `changeset.version_notes`).

**Live rules enforcer** — `POST /api/validate` runs the *exact* proposal-time
gates (zod → tier classification → auto-semver plan → cloned-contract
`checkContract()`) and **persists nothing**. Returns
`{valid, issues, tier, tierReasons, domains, versionPlan}` — this is the
endpoint an editor UI (structured BDM/PDM creators) polls to show the
version-bump + tier verdict and governance errors as the user types.

### 1.9 Models write-back — `apps/appkit/server/writeback.ts`

Merges can persist to the models repo (git SoR). Env contract:

| Env | Values | Behaviour |
|---|---|---|
| `MODELS_WRITEBACK` | `off` (default) | Demo: merges update the in-memory contract only |
| | `fs` | Merged asset YAML + bumped product YAML written to `MODELS_DIR` |
| | `git` | `fs` + `git add` + `git commit` on the **current branch** of `MODELS_DIR`. Never pushes. **Refuses `main`/`master`** — the merge returns 409 and *nothing mutates* |
| `MODELS_DIR` | path | Models repo root; defaults to the engine's `contracts/` dir |

Semantics: the merge is **atomic** — edits and product bumps are staged on a
cloned contract, so a write-back refusal leaves app state, changeset status,
and the repo untouched. Deletes are **tombstones** (YAML kept with
`status: retired`; hard deletion of governed specs stays a manual, reviewed
act). Commit format: `chore(models): <title> [changeset <id>, tier <n>]` with
`<product>: <from> -> <to> (<level>)` lines in the body.

### 1.10 DQ rules library — generic rules, applied at table or column level

A governed library of GENERIC data-quality rules, defined once and applied by
rule sets — the rule carries the semantics; the application carries the
binding.

**Library rule** (new asset kind `dqrule`, `contracts/dq-rules/*.yaml`, 8 seed
rules): `scope: column|table` · `check` primitive (`not_null`, `unique`,
`referential`, `range`, `regex`, `accepted_values`, `row_count_min`,
`freshness`) · declared `params` (name/type/required/default) · default
`severity` · illustrative SQL `expression`. Independently semver'd and
maker/checker'd like every other asset.

**Application** (extended `DqRule` in rule sets): `use: <rule-id>` +
`field: <column>` for column scope (nothing for table scope) + per-application
`params`/`severity` overrides. Legacy inline `type:` rules keep working
(`contracts/dq/trade_dq.yaml` shows both forms + a table-level application).

**Engine threading** (fold-in files): `framework/types.ts` (`DqRuleDef`,
`DqParamDecl`, `ResolvedDqRule`, extended `DqRule`, `Contract.dqRules`),
`framework/dq.ts` (NEW — `resolveDqRule`/`dqRuleUsage`/`missingDqParams`),
`framework/load.ts` (`dq-rules/` in both loaders), `governance/checks.ts`
check #9 (`DQRULE_DUPLICATE|VERSION_INVALID|SCOPE_INVALID|CHECK_UNKNOWN`,
`DQ_APPLICATION_AMBIGUOUS|EMPTY`, `DQ_LIBRARY_RULE_UNRESOLVED`,
`DQ_BINDING_SCOPE`, `DQ_BINDING_FIELD_UNKNOWN`, `DQ_PARAMS_MISSING`),
`medallion/run.ts` (the runner **executes** every resolved application against
gold rows; results ride on `LayerStats.dq` as
`{rule,label,scope,field?,severity,status: pass|fail|skipped,violations,detail?}`;
`freshness` reports `skipped` locally — warehouse-only), `index.ts` exports.

**App surfaces**: `GET /api/dq` (library + usage join + all resolved
applications) · `dqrule` is a full changeset citizen (create/edit/delete,
auto-semver, write-back to `dq-rules/`) · **governance cascade**: editing a
library rule applied anywhere is auto **tier 2** ("modifies a DQ library rule
applied by N binding(s) across rule set(s) …"); deleting a still-referenced
rule fails the proposal gate (`DQ_LIBRARY_RULE_UNRESOLVED`). Client: `/dq`
page (library + applications) and per-run DQ results under Pipelines.

**Verified live**: 8 library rules / 10 applications on `trade`; run executes
9 + 1 skipped (freshness) with 0 violations; column-scoped rule applied
without a field → `DQ_BINDING_SCOPE` (invalid, blocked at the door); in-use
`range_check` edit → tier 2 + major bump.

### 1.11 Governed mapping documents — bronze→silver + silver→gold

The platform's namesake surface, now first-class:

- **Bronze→silver** (kind `mapping`, `contracts/mappings/*.yaml`): source →
  BDM field-level rules `{target, sources[], logic, description}`. Two samples
  (`trade_src_to_bdm` 11/11 fields, `counterparty_src_to_bdm` 6/6).
- **Silver→gold** (kind `transformation`): multi-source joins, UNION assembly,
  subqueries, polymorphic key resolution, refmap lookups, per-field logic with
  **bronze lineage tails**, complexity grading.
- **Engine check #10** (`governance/checks.ts`, fold-in): reference integrity —
  `MAPPING_FROM_UNRESOLVED`, `MAPPING_TO_UNRESOLVED`,
  `MAPPING_TARGET_FIELD_UNKNOWN` (rule targets must exist on the target BDM),
  `TRANSFORMATION_TARGET_UNRESOLVED`, `TRANSFORMATION_SOURCE_UNRESOLVED`,
  `TRANSFORMATION_REFMAP_UNRESOLVED`, `TRANSFORMATION_FROM_UNRESOLVED`,
  `TRANSFORMATION_FROM_FIELD_UNKNOWN` (entity.field halves both validated).
  Negative-tested: a phantom rule target fails `pnpm check`.
- **`GET /api/mappings`**: both document families joined with **coverage**
  (mapped/targetFields + the unmapped field list per bronze→silver doc) —
  the review signal for "is this mapping complete?".
- **UI**: `/mappings` page (both layers, rules/fields tables, coverage
  meters, bronze lineage column) + a **structured mapping editor** with a
  target-field select fed by the chosen BDM and a live coverage hint; the
  enforcer surfaces `MAPPING_TARGET_FIELD_UNKNOWN` while typing.
- Both kinds were already changeset citizens (auto-semver, tiering,
  write-back to `mappings/`/`transformations/`) — no new workflow wiring.

### 1.13 Domains + org overlay, IA restructure & design system

- **Domains are now a first-class governed kind** (`domain`, `contracts/domains/*.yaml`, 6
  seed: reference/trading/analytics/consumption/platform/governance) — the top-level grouping
  that owns products which own assets. Engine threading (fold-in): `framework/types.ts`
  (`Domain` + `Contract.domains`), `framework/load.ts` (`domains/` in both loaders),
  `governance/checks.ts` check #7b (`DOMAIN_DUPLICATE`/`DOMAIN_VERSION_INVALID`) and a
  `PRODUCT_DOMAIN_UNRESOLVED` guard (products must sit in a defined domain). Both `domain` and
  `product` are full changeset citizens in the app (KIND map, tiering, versioning, write-back
  to `domains/`/`products/`).
- **Org endpoints**: `GET /api/domains` (each domain + product/asset counts + its products),
  `GET /api/registry` (flat rows for every asset: kind/id/version/status/domain/product/
  dependsOn — the join is computed server-side), `GET /api/catalog` (dashboard payload:
  totals + domains + the bronze→silver→gold **flow** with real nodes; sources=bronze,
  bdm=silver, pdm/transformation/extract/semantic=gold). `/api/meta` now carries domains too.
- **IA restructure** — 10 pages → **7 nav**: Dashboard (catalog: domains→products + medallion
  flow), Registry (flat filterable table + Changesets tab — absorbs Assets+Changesets),
  Mappings (list + full-width workbench detail), Data Model (explorer + domain/product
  overlay), DQ Library, Pipelines (+ flow + domain grouping + Migration tab), Access (tabbed).
  Products/Changesets/Migration remain deep-linkable routes, just off the top nav.
- **Design system** (`client/src/styles.css` + `client/src/lib/page.tsx`): Atlassian-flavoured
  tokens (ink `#172B4D`, accent `#0052CC`, white surfaces, 14%-ink borders, 12px radius,
  30px/600 titles), light default + dark override, and shared `PageHeader` (blue kicker →
  title → subtitle) / `Breadcrumbs` / `Section` primitives used on every page. Page-specific
  CSS lives in per-page `.css` files. **Corporate fork note**: your derived domains differ
  (banking/loan/…); seed your `contracts/domains/*.yaml` to match your taxonomy and re-point
  `server/tiering.ts` `domainOf()` — the `PRODUCT_DOMAIN_UNRESOLVED` gate enforces the mapping.

### 1.12 Model explorer (ERD) + theming

- The interactive **data-model explorer** from `apps/web/erd` is preserved in
  the AppKit app: the **pre-built bundle is vendored** at
  `apps/appkit/client/src/vendor/erd/` (`erd.js` + `erd.d.ts`, do-not-edit —
  rebuild in `apps/web/erd` and re-copy; only `react`/`react-dom` external).
  `GET /api/erd` adapts the contract to the explorer's `SourceModel[]` shape
  (same flattening as the apps/api projection: `isPk`/`bk`/`fkRef`
  `"entity.field"`, plus PDM/semantic nodes via `dependsOn`). The `/explorer`
  route is **lazy-loaded** (the bundle is ~1.6 MB; main chunk stays ~324 kB).
  The ERD's token contract (`--color-paper/-soft/ink/line/muted/accent/brass`,
  `--font-mono`) is bridged to the app theme in `.erd-host` (styles.css), so
  the diagram follows light/dark. If your fork moved the ERD server-side,
  keep your version and just add the `/api/erd` adapter — the data shape is
  the same one your `dct.models()` already returns.
- **Theming**: the client now has light (default) + dark themes — one token
  system with a `:root[data-theme="light"]` override, a ✳ toggle (labelled
  "Theme") in the topbar, persisted per user, applied before first paint.

### 1.14 Streamlit parallel child — `apps/streamlit/`

A **second UI living inside this repo**, alongside the AppKit React UI, so the
corporate team can **flip a switch** between them and run a **parallel migration**
that stays aligned. This is the strangler pattern with a safety net.

- **Both UIs are thin clients over the same `/api/*`.** There is **no business
  logic in either frontend** — the contract + engine + governance live
  server-side on the `@dct/appkit-app` server (meta, catalog, registry, domains,
  assets, mappings, dq, products, runs, changesets, access, erd, validate,
  migration). Because both call identical endpoints, they render identical
  governed truth. **Alignment is structural, not manual** — neither UI can drift,
  and this is the mechanism to "flip the switch and maintain alignment."
- **The switch** is config-driven, no code change: `MMP_API_BASE` points both
  UIs at the same running server; `ACTIVE_UI=appkit|streamlit` documents intent
  locally; deployed, two Databricks Apps resources share one Lakebase + one API
  surface and a single nav/route flag selects which UI is served (per-env or
  per-user for a phased cutover). Flipping back is instant — state lives in the
  shared backend, not the UI.
- **Parity matrix** (page → route → endpoint → status) tracks the migration
  page-by-page: Dashboard `/`→`/api/catalog`, Registry `/registry`→
  `/api/registry`+`/api/changesets`, Mappings `/mappings`→`/api/mappings`,
  Data Model `/explorer`→`/api/erd`, DQ Library `/dq`→`/api/dq`, Pipelines
  `/pipelines`→`/api/runs`+`/api/migration`, Access `/access`→`/api/access`+
  `/api/access/check`. **Known non-parity**: the interactive React-Flow ERD is
  React-only; Streamlit degrades to a table (+ optional Graphviz) — flagged
  explicitly, not faked.
- **Repo hygiene**: `apps/streamlit/` has **no `package.json`**, so the pnpm
  workspace ignores it — it does not affect `pnpm typecheck | check | build`.
  It is a Python sibling (`streamlit`, `requests`), not a JS workspace member.
- **Full plan**: `docs/handover/STREAMLIT-PARALLEL-PLAN.md`; scaffold to copy:
  `apps/streamlit/` (see Track F, §2).

---

## 2. How to integrate — per track

The drop is uncommitted at authoring time, so integrate **from a local clone of
the reference repo** (paths below use `<REF>` for that clone's root). Work on a
feature branch; deliver by PR.

```bash
cd <your-fork>
git checkout -b feat/mmp-appkit-drop
```

### Track A — `apps/appkit/` (wholesale copy)

```bash
# Copy the app, excluding installs/builds:
rsync -a --exclude node_modules --exclude client/dist <REF>/apps/appkit/ apps/appkit/
# (Windows: robocopy <REF>\apps\appkit apps\appkit /E /XD node_modules dist)

pnpm install          # links @dct/engine, @dct/shared, @dct/auth workspace deps
pnpm --filter @dct/appkit-app typecheck
pnpm --filter @dct/appkit-app dev     # http://localhost:8000 — smoke it locally
```

Adaptation points (all are deliberate seams — the shapes don't change):

| Seam | Where | What to do |
|---|---|---|
| Workspace dep names | `apps/appkit/package.json` | The app depends on `@dct/engine` / `@dct/shared` / `@dct/auth` (`@dct` is a legacy internal scope). If your fork renamed the scope, rename the three deps + their imports |
| Contracts | (nothing to edit) | The app reads whatever `loadContract()` returns — **your lending-domain contracts replace our synthetic capital-markets ones automatically**. Do not copy our contracts |
| Domain taxonomy | `apps/appkit/server/tiering.ts` → `domainOf()` | Our reference domains are `reference`/`trading`/`analytics`/`consumption`/`governance`/`platform` — **yours are not**. Re-point the per-kind derivation (§1.2 table) at your domain taxonomy (however your fork encodes ownership — entity group, owner field, or a domain registry) |
| Tier policy | `apps/appkit/server/tiering.ts` → `classifyChange()` | Tune the escalation rules to your governance policy (e.g. your ARB may also want new semantic models, or may delegate extract edits) |
| User registry | `apps/appkit/server/access.ts` → `USERS` | Replace the demo personas with your IdP feed (SCIM/OIDC claims → roles/domains). Keep `toPrincipal()` and the payload shapes |
| Default roles | `apps/appkit/app.yaml` → `APP_DEFAULT_ROLES` | Roles granted to platform-authenticated users until IdP claim mapping is wired (ours: `modeler`) |
| Product taxonomy | `contracts/products/*.yaml` (in YOUR models repo) | Author **your** product definitions over your lending-domain assets — do not keep our synthetic member lists. Use our two samples as shape templates; `PRODUCT_MEMBER_UNRESOLVED` fails the gate until every member `{kind,id}` resolves against your contracts |
| Write-back mode | env per environment: `MODELS_WRITEBACK` + `MODELS_DIR` | `off` for demos/CI, `fs` for local inspection, `git` **only** with `MODELS_DIR` pointing at a clone of YOUR models repo checked out on a **feature branch** — commits on `main`/`master` are refused (merge → 409, §1.9) |
| App/bundle name | `apps/appkit/databricks.yml` + `app.yaml` | Your app name, workspace host/profile, and your Lakebase `instance_name`/`database_name` |

### Track B — engine postgres generator + products threading (fold-in)

Files:

| File | Change |
|---|---|
| `packages/engine/src/generators/postgres.ts` | **NEW — copy verbatim** |
| `packages/engine/src/generators/index.ts` | Add `import { generatePostgres } from "./postgres";` and the `...generatePostgres(c),` entry inside `generateAll()` |
| `packages/engine/src/governance/checks.ts` | Propagation gate: add `join(gen, "postgres", "tables", `\`${e.entity}.sql\``)` to the per-entity `surfaces()` list, and `"postgres/schema.sql"`, `"postgres/manifest.json"` to the single-file surfaces list. **Products threading**: fold in check #8 (product integrity — the four `PRODUCT_*` codes, §1.7) |
| `packages/engine/src/framework/types.ts` | **Products threading**: add the `Product` interface + `products: Product[]` on `Contract` (§1.7) |
| `packages/engine/src/framework/load.ts` | **Products threading**: load `contracts/products/*.yaml` in both `loadContract()` and `contractFromFiles()` |
| `packages/engine/src/cli.ts` | Comment-only: add `postgres` to the generate surface list |
| `packages/engine/contracts/products/*.yaml` | Copy the 2 samples as scaffolding, then **rewrite** them into your real product definitions (members/domain/owner/description) — see the §2A seam. The gate blocks unresolved synthetic members |
| `packages/engine/src/framework/dq.ts` | **NEW — copy verbatim** (DQ library resolution: `resolveDqRule`/`dqRuleUsage`/`missingDqParams`, §1.10) |
| `packages/engine/src/framework/types.ts` | **DQ threading**: `DqRuleDef`/`DqParamDecl`/`ResolvedDqRule`, extended `DqRule` (`use`/optional `type`+`severity`), `dqRules: DqRuleDef[]` on `Contract` (§1.10) |
| `packages/engine/src/framework/load.ts` | **DQ threading**: load `contracts/dq-rules/*.yaml` in both loaders |
| `packages/engine/src/governance/checks.ts` | **DQ threading**: fold in check #9 (library integrity + application bindings — the `DQRULE_*`/`DQ_*` codes, §1.10) |
| `packages/engine/src/medallion/run.ts` | **DQ threading**: `DqResult` + the post-load DQ pass executing resolved applications on gold rows (`LayerStats.dq`) |
| `packages/engine/src/index.ts` | Export `./framework/dq` + `DqResult` |
| `packages/engine/contracts/dq-rules/*.yaml` | Copy the 8 generic seed rules **as-is** — they are domain-neutral (not_null/unique/range/regex/allowed-values/referential/row-count/freshness) — then re-point your rule sets to `use:` them at your own column/table bindings |

Then regenerate **from your contracts** and let the gate prove it:

```bash
pnpm generate && pnpm typecheck && pnpm check
git add packages/engine/generated/postgres    # commit the regenerated surface
```

### Track C — migration guides (wholesale copy)

```bash
cp -r <REF>/docs/appkit-migration docs/appkit-migration
```

Adapt the two sentences that name the reference domains if you care; the guides
are otherwise domain-neutral by construction (synthetic examples only).

### Track D — `.claude/` (wholesale copy / merge)

```bash
cp -r <REF>/.claude/skills   .claude/skills
cp -r <REF>/.claude/knowledge .claude/knowledge
# settings.json: copy if you have none; otherwise merge permissions.allow,
# permissions.deny (the .env read denials) and the PreToolUse hook.
```

This is the team-wide AI guardrail layer — the skills enforce the
contract-is-SoR and PR-only rules mechanically. Review
`.claude/knowledge/corporate-guardrails.md` and adjust the repo-specific
non-negotiables header to your fork's reality (it currently states the
reference repo's).

### Track E — naming (no action)

Root `package.json` is now `mapping-metadata-platform`; README.md and CLAUDE.md
carry the MMP framing. You renamed first — our repo now matches your naming, so
there is nothing to port back.

### Track F — Streamlit parallel child (wholesale copy + follow the plan)

```bash
# Copy the scaffold (Python sibling, no node_modules to exclude):
cp -r <REF>/apps/streamlit apps/streamlit
# (Windows: robocopy <REF>\apps\streamlit apps\streamlit /E)

cp apps/streamlit/.env.example apps/streamlit/.env   # then edit (below)
python -m pip install -r apps/streamlit/requirements.txt
streamlit run apps/streamlit/app.py                  # smoke it against your AppKit server
```

Then **execute** `docs/handover/STREAMLIT-PARALLEL-PLAN.md`: it drives the
page-by-page migration of your existing Streamlit app onto this foundation, one
page at a time, keeping both UIs live and aligned until each page reaches parity.

Adaptation points (deliberate seams — the shapes don't change):

| Seam | Where | What to do |
|---|---|---|
| API base | `apps/streamlit/.env` → `MMP_API_BASE` | Point at your running `@dct/appkit-app` server (e.g. `http://localhost:8000`). Both UIs share this one surface — no second backend |
| Persona / auth | `apps/streamlit/.env` → `MMP_PERSONA` (+ `x-dct-*` headers in `lib/api.py`) | Dev: send the same `x-dct-user`/`x-dct-roles`/`x-dct-domains` the AppKit persona switcher uses. Deployed: both inherit the platform's forwarded identity — drop the dev headers |
| The switch | `ACTIVE_UI=appkit\|streamlit` (local) / a nav/route flag (deployed) | Config-only; flip per env or per user for a phased cutover, roll back instantly |
| **Adaptation seam** (the migration itself) | your existing Streamlit pages/queries | Re-point each page from its old Delta/UC reads to the governed `/api/*` endpoint (per the parity matrix), one page at a time. The Streamlit UI must **not** re-read Delta/UC directly or embed business logic — PII masking and governance are enforced server-side and inherited |
| ERD degrade | `pages/3_Data_Model.py` | The interactive React-Flow ERD is React-only; render `/api/erd` as a table (+ optional Graphviz). Note the non-parity explicitly in the matrix — do not fake it |

Validation: for each page, the Streamlit view and the AppKit view over the
**same persona + endpoint** must match. Track status in the parity matrix; flip
the switch per env only once a page reaches parity.

### Database DDL

Apply once per Lakebase database:

```bash
# 1. App workflow state:
psql $PGHOST -f apps/appkit/server/schema.sql
# 1b. ONLY IF you already ran an earlier (pre-tier) version of the changeset
#     table — CREATE TABLE IF NOT EXISTS won't add the new columns:
#   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 1;
#   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier_reasons jsonb NOT NULL DEFAULT '[]';
#   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS domains jsonb NOT NULL DEFAULT '[]';
# 1c. ONLY IF you ran a pre-products version — auto-semver + product-run columns:
#   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS version_notes jsonb NOT NULL DEFAULT '[]';
#   ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
#   ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '[]';

# 2. Migrated gold serving tables — regenerated from YOUR contracts in Track B:
psql $PGHOST -f packages/engine/generated/postgres/schema.sql
```

---

## 3. Validation checklist

Gates first:

```bash
pnpm typecheck        # all packages green, including @dct/appkit-app
pnpm generate && pnpm check    # propagation gate now covers generated/postgres/
```

Then the E2E workflow script we verified on the reference (dev-auth headers;
substitute your personas/domains after the §2A adaptations). Run against
`pnpm --filter @dct/appkit-app dev` at `http://localhost:8000`:

```bash
B=http://localhost:8000/api

# 1. Propose a tier-1 change (modeler; additive/minor edit on a reference-domain asset)
curl -s -X POST $B/changesets -H 'content-type: application/json' \
  -H 'x-dct-user: alice' -H 'x-dct-roles: modeler' \
  -d '{"title":"minor ref edit","edits":[{"kind":"bdm","id":"currency","spec":{...existing spec with a description tweak...}}]}'
# expect: 200, "tier": 1, "domains": ["reference"]

# 2. Tier-1 CROSS-DOMAIN 403: a steward outside the owning domain cannot approve
curl -s -X POST $B/changesets/<id>/approve -H 'x-dct-user: frank' -H 'x-dct-roles: steward' # frank = trading
# expect: 403 "tier-1 change routes to domain(s) [reference] — your domain scope does not cover: reference"

# 3. Tier-1 domain approve: the owning domain's steward succeeds
curl -s -X POST $B/changesets/<id>/approve -H 'x-dct-user: bob' -H 'x-dct-roles: steward'   # bob = reference
# expect: 200, status "approved"

# 4. Propose a tier-2 change (delete = consumer-impacting)
curl -s -X POST $B/changesets -H 'content-type: application/json' \
  -H 'x-dct-user: alice' -H 'x-dct-roles: modeler' \
  -d '{"title":"retire asset","edits":[{"kind":"dq","id":"<some-dq-id>","action":"delete","spec":{}}]}'
# expect: 200, "tier": 2, tierReasons mentions "asset retirement (delete)"

# 5. Tier-2 steward 403: domain approval is NOT enough for tier 2
curl -s -X POST $B/changesets/<id2>/approve -H 'x-dct-user: bob' -H 'x-dct-roles: steward'
# expect: 403 "tier-2 change requires change:signoff"

# 6. Tier-2 CDA approve, then domain-owner merge
curl -s -X POST $B/changesets/<id2>/approve -H 'x-dct-user: dana' -H 'x-dct-roles: chief_data_architect'
# expect: 200 "approved"
curl -s -X POST $B/changesets/<id2>/merge -H 'x-dct-user: carol' -H 'x-dct-roles: domain_owner'
# expect: 200 "merged"

# 7. SoD: an author can never decide their own changeset (any tier)
#    (propose as bob, then approve as bob → expect 403 "segregation of duties")

# 8. Withdraw is author-only
curl -s -X POST $B/changesets/<id3>/withdraw -H 'x-dct-user: bob' -H 'x-dct-roles: steward'
# expect: 403 "only the author can withdraw a proposal" (when bob != author)
curl -s -X POST $B/changesets/<id3>/withdraw -H 'x-dct-user: alice' -H 'x-dct-roles: modeler'
# expect: 200 "withdrawn" (alice = author)

# 9. Access checker
curl -s "$B/access/check?sub=bob&capability=change:approve&domain=trading"
# expect: allowed=false with two reasons (capability granted; domain NOT covered)
curl -s "$B/access/check?sub=dana&capability=change:signoff"
# expect: allowed=true

# ---- new in this drop: products, auto-semver, validate, write-back ----
# All five below are VERIFIED live on the reference (our synthetic assets;
# substitute yours — the levels/tiers/refusals must reproduce identically).

# 10. Products list
curl -s $B/products
# expect: your products with independent versions + memberCount

# 11. Live enforcer, cosmetic-only edit (description tweak) → PATCH, tier 1
curl -s -X POST $B/validate -H 'content-type: application/json' \
  -d '{"edits":[{"kind":"bdm","id":"currency","spec":{...existing spec, description changed...}}]}'
# verified: valid=true, tier 1, versionPlan level "patch" (1.1.0 → 1.1.1)

# 12. Live enforcer, field REMOVED → MAJOR, tier 2, named root cause
#     (same spec minus one field)
# verified: tier 2, versionPlan level "major",
#           tierReasons includes "removes field 'minor_units'"

# 13. Live enforcer, pk stripped from the key fields → governance REJECTS
# verified: valid=false, issues includes PK_CARDINALITY (error) — nothing persisted

# 14. The product-increment loop: propose a tier-1 edit on a product member,
#     approve, then merge (with MODELS_WRITEBACK=git and MODELS_DIR on a
#     feature-branch clone of the models repo)
# verified on merge of a tier-1 member edit:
#   - productIncrements: reference-data-360 1.0.0 → 1.1.0 (minor)
#   - writeback.commit set; git log shows
#       chore(models): <title> [changeset <id>, tier 1]
#     containing BOTH the asset YAML and the bumped product YAML
#   - run: auto-triggered, trigger="product-increment",
#     products=[{reference-data-360, 1.1.0}]

# 15. Guardrail: MODELS_WRITEBACK=git with the models repo ON main
# verified: merge → 409 "direct commits to main are forbidden" and NOTHING
# mutated — changeset stays approved, contract unchanged, no commit
```

DQ rules library (all verified live on the reference):

```bash
# 16. Library + applications resolve (8 seed rules, usage join populated)
curl -s $B/api/dq | jq '{rules: (.library|length), applications: (.applications|length)}'
# → {"rules": 8, "applications": 10}

# 17. Pipeline runs EXECUTE applied rules — LayerStats.dq on each entity
curl -s -X POST $B/api/runs -H "x-dct-user: pat" -H "x-dct-roles: platform_engineer" \
  | jq '[.stats[].dq // [] | .[] | .status] | group_by(.) | map({(.[0]): length}) | add'
# → e.g. {"pass": 9, "skipped": 1}   (freshness is warehouse-only, reported skipped)

# 18. Binding enforcement — column-scoped rule applied without a field
#     via POST /api/validate → valid:false, issues include DQ_BINDING_SCOPE

# 19. Governance cascade — editing an in-use library rule via /api/validate
#     → tier 2, reason "modifies a DQ library rule applied by N binding(s)…",
#     version plan major. Deleting a still-referenced rule → proposal 422
#     (DQ_LIBRARY_RULE_UNRESOLVED from the cloned-contract check).
```

UI walkthrough (persona switcher, top right): **Dashboard** shows asset counts +
mode/store; **Assets** lists all 9 kinds with search; **AssetDetail** renders the
contract spec; **AssetEdit** proposes and shows the tier verdict; **Changesets**
shows tier badges, reasons, and the approve/reject/merge/withdraw actions gated
per persona; **Pipelines** triggers a medallion run and shows gate results plus
per-entity **DQ results** (pass/fail/skipped + violations); **Products** shows
independent product versions + increment run history; **DQ Library** lists the
generic rules, their parameters and every application; **Migration** shows the
`generated/postgres/` manifest; **Access** renders the roles×capabilities
matrix, users, data-clearance model, approval policy, and the interactive
checker.

---

## 4. What NOT to pick up

| Don't take | Why |
|---|---|
| `packages/engine/contracts/**` + `registry.lock.json` | Synthetic capital-markets domain. Keep YOUR lending-domain contracts; the app and generator consume them as-is. **Sole exception**: the two `contracts/products/*.yaml` samples may be copied as scaffolding — but only if you immediately rewrite them into your own product definitions (§2A/§2B) |
| `packages/engine/generated/**` | Regenerate from **your** contracts (`pnpm generate`) — never copy our generated output |
| `.env.example` values / any `.env` | Examples only; your env is yours. Never commit `.env` (the team settings deny reading it for a reason) |
| `apps/web/**`, root `README.md` / `CLAUDE.md` | Your ERD/theme/branding work has diverged — this drop doesn't touch those surfaces, so don't let a bulk copy clobber them |
| Demo `USERS` personas into production | Local/dev only — swap for the IdP feed before any deployed use |

---

*Corporate guardrails apply throughout: feature branch + PR (never push to a
protected branch), no secrets in code or config, keep `pnpm typecheck` /
`pnpm check` / `pnpm test` green, never hand-edit `generated/`. Full baseline:
`.claude/knowledge/corporate-guardrails.md` (Track D delivers it into your fork).*
