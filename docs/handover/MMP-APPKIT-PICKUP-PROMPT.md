# MMP AppKit drop — paste-ready pickup prompt

Paste everything inside the fence below into an AI coding assistant (Claude
Code / Copilot agent) running **inside your corporate fork**. Replace
`<PATH-TO-REFERENCE-CLONE>` with the local path of your clone of the
`mapping-metadata-platform` reference repo first. Companion doc with full
rationale: `docs/handover/MMP-APPKIT-HANDOVER.md` (in the reference clone).

```
You are integrating a drop from the mapping-metadata-platform reference repo,
cloned locally at <PATH-TO-REFERENCE-CLONE> (call it REF below). You are inside
our corporate fork — a diverged fork of that reference: lending/finance domain
(NOT the reference's capital-markets domains), server-side ERD, our own theme
and branding. Do NOT overwrite our ERD, theme, web pages, README/CLAUDE.md, or
contracts. This drop is four new self-contained surfaces + one small engine
fold-in; reference everything by PATH (the drop may be at REF's main tip or
uncommitted — copy from the working tree either way).

CONSTRAINTS (non-negotiable):
- Work on a new feature branch; deliver via PR. NEVER push to main.
- No secrets: never commit .env or credentials; .env.example files are templates only.
- Never hand-edit anything under packages/engine/generated/ — regenerate instead.
- Keep our lending-domain contracts; never copy REF's synthetic contracts,
  registry.lock.json, or generated/ output into our repo. (Sole exception:
  the two contracts/products/*.yaml samples as scaffolding — Step 2g rewrites
  every synthetic value in them.)

STEP 0 — branch:
  git checkout -b feat/mmp-appkit-drop

STEP 1 — TRACK A: copy the AppKit app wholesale (new directory, no collisions):
  Copy REF/apps/appkit/ -> apps/appkit/, EXCLUDING node_modules and client/dist.
  Contents you should end up with:
    package.json (@dct/appkit-app), tsconfig.json, app.yaml, databricks.yml,
    .env.example, README.md,
    server/{server.ts,routes.ts,services.ts,tiering.ts,access.ts,repo.ts,
            versioning.ts,writeback.ts,local-dev.ts,schema.sql},
    client/  (React 19 + react-router 7 pages: Dashboard, Assets, AssetDetail,
              AssetEdit, Changesets, Pipelines, Migration, Access + persona switcher)
  Then: pnpm install  (links the @dct/engine, @dct/shared, @dct/auth workspace deps —
  if our fork renamed the @dct scope, rename those three deps in
  apps/appkit/package.json and fix the imports across apps/appkit/**).

STEP 2 — TRACK B: fold in the engine postgres generator AND the data-product
threading (6 files + product contracts):
  a) NEW file — copy verbatim:
     REF/packages/engine/src/generators/postgres.ts
       -> packages/engine/src/generators/postgres.ts
     (What it does: generates Lakebase Postgres serving DDL from the contract's
      gold model — schema "gold" only; type map decimal(p,s)->numeric(p,s),
      int->integer, bigint->bigint, date->date, timestamp->timestamptz,
      boolean->boolean, string/unknown->text; restricted columns excluded from
      serving; classification in COMMENT ON COLUMN; PII/MNPI columns get
      masked-view guidance from the shared access engine; pk->PRIMARY KEY,
      bk->NOT NULL + <entity>_business_key UNIQUE; emits postgres/tables/<entity>.sql,
      postgres/schema.sql, postgres/manifest.json.)
  b) packages/engine/src/generators/index.ts — if diverged, re-apply by hand:
     add   import { generatePostgres } from "./postgres";
     and   ...generatePostgres(c),   inside the generateAll() array.
  c) packages/engine/src/governance/checks.ts — propagation gate: in the
     per-entity surfaces() list add
       join(gen, "postgres", "tables", `${e.entity}.sql`)
     and in the single-file surfaces array add
       "postgres/schema.sql" and "postgres/manifest.json".
     ALSO fold in the new product-integrity check (check #8 in REF's
     checkContract()): PRODUCT_DUPLICATE, PRODUCT_VERSION_INVALID (semver),
     PRODUCT_EMPTY (no members), PRODUCT_MEMBER_UNRESOLVED (every member
     {kind,id} must resolve in the contract).
  d) packages/engine/src/framework/types.ts — products threading: add the
     Product interface (product, label?, domain, owner?, version, status?,
     description?, includes: AssetRef[]) and products: Product[] on Contract.
  e) packages/engine/src/framework/load.ts — load contracts/products/*.yaml
     in BOTH loadContract() and contractFromFiles() (mirror REF).
  f) packages/engine/src/cli.ts — comment-only: add "postgres" to the listed
     generate surfaces.
  g) PRODUCT CONTRACTS — copy REF/packages/engine/contracts/products/
     {reference-data-360.yaml,trading-analytics.yaml} into OUR
     contracts/products/ as scaffolding ONLY, then AUTHOR our real product
     definitions: replace product ids, labels, domain, owner, description,
     and EVERY member {kind,id} with our lending-domain assets. (This is the
     sole exception to "never copy REF contracts" — and it self-enforces:
     PRODUCT_MEMBER_UNRESOLVED fails pnpm check while any synthetic member
     id remains.) Products version independently: start each at "1.0.0".
  h) DQ RULES LIBRARY threading (generic rules, applied at table or column
     level; see REF handover §1.10):
     - NEW file, copy verbatim: REF/packages/engine/src/framework/dq.ts
       (resolveDqRule / dqRuleUsage / missingDqParams — merges library
       defaults with application overrides into one executable shape).
     - packages/engine/src/framework/types.ts: add DqRuleDef, DqParamDecl,
       ResolvedDqRule; extend DqRule with use?/optional type + optional
       severity; add dqRules: DqRuleDef[] on Contract; add "row_count_min"
       to DqRuleType.
     - packages/engine/src/framework/load.ts: load contracts/dq-rules/*.yaml
       in BOTH loaders.
     - packages/engine/src/governance/checks.ts: fold in check #9 —
       DQRULE_DUPLICATE / DQRULE_VERSION_INVALID / DQRULE_SCOPE_INVALID /
       DQRULE_CHECK_UNKNOWN on library rules; DQ_APPLICATION_AMBIGUOUS /
       DQ_APPLICATION_EMPTY / DQ_LIBRARY_RULE_UNRESOLVED / DQ_BINDING_SCOPE
       (column-scoped needs field, table-scoped forbids it) /
       DQ_BINDING_FIELD_UNKNOWN / DQ_PARAMS_MISSING on applications.
     - packages/engine/src/medallion/run.ts: add the DqResult type + the
       post-load DQ pass that EXECUTES every resolved application against
       the gold rows (LayerStats.dq; freshness reports "skipped" locally).
     - packages/engine/src/index.ts: export ./framework/dq and DqResult.
     - COPY the 8 seed rules AS-IS (they are domain-neutral):
       REF/packages/engine/contracts/dq-rules/*.yaml -> contracts/dq-rules/
     - Re-point OUR rule sets to the library: convert inline rules to
       `use: <rule-id>` applications bound at column (field:) or table
       level, overriding params/severity per application (see REF's
       contracts/dq/trade_dq.yaml for both forms). Expect the engine's
       version gate to demand a MAJOR bump on each converted rule set.
  i) MAPPING-DOCUMENT governance (REF handover §1.11): fold in check #10
     from REF's governance/checks.ts — reference integrity for mapping
     (bronze→silver) and transformation (silver→gold) documents:
     MAPPING_FROM/TO_UNRESOLVED, MAPPING_TARGET_FIELD_UNKNOWN,
     TRANSFORMATION_{TARGET,SOURCE,REFMAP,FROM}_UNRESOLVED,
     TRANSFORMATION_FROM_FIELD_UNKNOWN. Run pnpm check: any phantom field
     in OUR existing mapping docs will now fail — fix the docs (that is
     the point). Validate GET /api/mappings afterwards: every
     bronze→silver doc reports coverage {mapped/targetFields/unmapped};
     drive coverage of production-critical docs to full.
  j) DOMAINS threading (top-level governed grouping; see REF handover §1.13):
     - packages/engine/src/framework/types.ts: add the Domain interface
       (domain, label?, description?, owner?, version, status?) and
       domains: Domain[] on Contract.
     - packages/engine/src/framework/load.ts: load contracts/domains/*.yaml
       in BOTH loaders.
     - packages/engine/src/governance/checks.ts: fold in check #7b
       (DOMAIN_DUPLICATE, DOMAIN_VERSION_INVALID) AND the
       PRODUCT_DOMAIN_UNRESOLVED guard (every product.domain must resolve to a
       defined domain).
     - AUTHOR contracts/domains/*.yaml for OUR real domain taxonomy
       (banking, lending, common, core, … — NOT the reference's
       reference/trading/etc.), each at version "1.0.0". Every product's
       `domain` and every asset's derived domain must map to one of these.
     - Re-point the app's domain derivation: in apps/appkit/server/tiering.ts
       `domainOf()`, map OUR asset kinds to OUR domains (the reference maps
       to reference/trading/analytics/consumption/platform/governance).
       PRODUCT_DOMAIN_UNRESOLVED + the registry/catalog endpoints will flag
       any asset whose domain has no home.
  Then regenerate FROM OUR CONTRACTS and commit the new surface:
    pnpm generate && pnpm typecheck && pnpm check
    git add packages/engine/generated/postgres

STEP 3 — TRACK C: copy the migration guides wholesale:
  REF/docs/appkit-migration/{README.md,streamlit-to-appkit.md,
  delta-to-lakebase-postgres.md} -> docs/appkit-migration/
  (Domain-neutral by construction; examples are synthetic.)

STEP 4 — TRACK D: copy the AI tooling:
  REF/.claude/skills/    -> .claude/skills/     (19 corporate-safe skills)
  REF/.claude/knowledge/ -> .claude/knowledge/  (corporate-guardrails.md etc.)
  REF/.claude/settings.json -> .claude/settings.json IF we have none; if we
  already have one, MERGE: permissions.allow (read-only git + pnpm gates),
  permissions.deny (.env read denials), and the PreToolUse destructive-command
  hook. Then edit the repo-specific header of
  .claude/knowledge/corporate-guardrails.md to describe OUR fork (it currently
  describes the reference repo).

STEP 4b — TRACK F: stand up the Streamlit parallel child, then migrate our
existing Streamlit app onto it page-by-page:
  a) Copy the scaffold wholesale (Python sibling, no package.json — the pnpm
     workspace ignores it, so it does not affect pnpm typecheck | check | build):
       REF/apps/streamlit/ -> apps/streamlit/
     (Contents: app.py [Dashboard], lib/api.py [shared API client: base URL +
      x-dct-* persona headers], lib/ui.py [render helpers], pages/ [multipage
      mirror of the 7-nav IA], requirements.txt, .env.example, README.md.)
  b) Configure the switch — copy apps/streamlit/.env.example -> apps/streamlit/.env
     and set:
       MMP_API_BASE  -> our running @dct/appkit-app server (e.g.
                        http://localhost:8000). BOTH UIs share this ONE API
                        surface — do NOT stand up a second backend.
       MMP_PERSONA   -> a dev persona (x-dct-user/x-dct-roles/x-dct-domains),
                        matching the AppKit persona switcher. Deployed, both UIs
                        inherit the platform's forwarded identity instead.
  c) Run it (with the AppKit server up):
       python -m pip install -r apps/streamlit/requirements.txt
       streamlit run apps/streamlit/app.py
  d) Now EXECUTE docs/handover/STREAMLIT-PARALLEL-PLAN.md — migrate OUR existing
     Streamlit pages onto this foundation ONE PAGE AT A TIME. For each page,
     re-point it from its old Delta/UC reads to the governed /api/* endpoint per
     the parity matrix (Dashboard->/api/catalog, Registry->/api/registry
     [+/api/changesets], Mappings->/api/mappings, Data Model->/api/erd,
     DQ Library->/api/dq, Pipelines->/api/runs[+/api/migration],
     Access->/api/access[+/api/access/check]). Keep both UIs live; track each
     page in the parity matrix (page -> route -> endpoint -> status); flip the
     switch per env only once a page reaches parity.
     GUARDRAIL: the Streamlit UI must NOT re-read Delta/UC directly or embed
     business logic — governance and PII masking are enforced server-side and
     inherited. Known non-parity: the interactive React-Flow ERD is React-only;
     Data Model degrades to a table (+ optional Graphviz) — note it in the
     matrix, do not fake it.

STEP 5 — ADAPTATION POINTS (do all six; these are deliberate seams):
  1. IdP users — apps/appkit/server/access.ts: the USERS array is a demo
     persona registry (alice/bob/frank/carol/dana/pat). Replace it with our
     IdP/SCIM group feed if available now; otherwise leave the personas for
     local dev and add a TODO referencing the swap point comment in that file.
     Keep toPrincipal() and all payload shapes unchanged.
  2. Domain taxonomy — apps/appkit/server/tiering.ts: domainOf() derives the
     owning domain per asset kind using the REFERENCE domains
     (reference/trading/analytics/consumption/governance/platform). Our domains
     are DIFFERENT (lending/finance). Re-point each case of domainOf() at our
     domain taxonomy (however our fork encodes ownership — entity group, owner
     field, or domain registry). Keep the function signature and TierVerdict shape.
  3. Tier policy — apps/appkit/server/tiering.ts classifyChange(): review the
     escalation rules (delete; new BDM/PDM; existing-extract modification;
     major version bump; status -> deprecated/retired; BDM structural diffs =
     field removal, type change, pk/bk change, classification downgrade,
     PII/MNPI flag change) against our governance policy; adjust only with a
     comment citing the policy.
  4. Default roles — apps/appkit/app.yaml APP_DEFAULT_ROLES (currently
     "modeler"): set to the roles our platform-authenticated users should get
     until IdP claim mapping is wired.
  5. Bundle names — apps/appkit/databricks.yml: our app name (replace
     mapping-metadata-platform if we brand differently), our workspace
     host/profile, and our real Lakebase instance_name/database_name.
     Our contracts feed the app automatically via loadContract() — nothing to
     copy for data.
  6. Models write-back — env per environment (server/writeback.ts contract):
     MODELS_WRITEBACK = off | fs | git (default off) and MODELS_DIR (defaults
     to the engine contracts dir). Set "off" for demo/CI, "fs" to write merged
     asset YAML + bumped product YAML to MODELS_DIR, "git" ONLY with
     MODELS_DIR pointing at a clone of OUR models repo checked out on a
     FEATURE BRANCH — git mode commits on the current branch, never pushes,
     and REFUSES main/master (the merge returns 409 and nothing mutates).
     Deletes write a tombstone (YAML kept with status: retired), never rm.

STEP 6 — DATABASE DDL (only if a Lakebase/Postgres database is reachable now;
otherwise record these as deploy steps in the PR description):
  psql $PGHOST -f apps/appkit/server/schema.sql
  -- If an OLDER (pre-tier) dct_app.changeset table already exists, ALSO run
  -- (CREATE TABLE IF NOT EXISTS does not add columns):
  ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 1;
  ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier_reasons jsonb NOT NULL DEFAULT '[]';
  ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS domains jsonb NOT NULL DEFAULT '[]';
  -- If a pre-products database exists, ALSO run (auto-semver + product runs):
  ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS version_notes jsonb NOT NULL DEFAULT '[]';
  ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
  ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '[]';
  psql $PGHOST -f packages/engine/generated/postgres/schema.sql   -- OUR regenerated DDL

STEP 7 — VALIDATE. Gates:
  pnpm typecheck && pnpm generate && pnpm check
Start the app locally (zero infra needed — stub workspace client + in-memory repo):
  pnpm --filter @dct/appkit-app dev    # http://localhost:8000
Then run this E2E script (B=http://localhost:8000/api). Use our adapted
personas/domains from Step 5; the expected outcomes must hold regardless:

  # tier-1 proposal (modeler, minor edit on an asset in domain D1)
  curl -s -X POST $B/changesets -H 'content-type: application/json' \
    -H 'x-dct-user: alice' -H 'x-dct-roles: modeler' \
    -d '{"title":"minor edit","edits":[{"kind":"bdm","id":"<asset-in-D1>","spec":{<existing spec + description tweak>}}]}'
  # EXPECT: 200, "tier":1, "domains":["<D1>"]

  # cross-domain steward approve -> 403
  curl -s -X POST $B/changesets/<id>/approve -H 'x-dct-user: frank' -H 'x-dct-roles: steward'
  # EXPECT: 403, message says tier-1 routes to [<D1>] and scope does not cover it

  # owning-domain steward approve -> 200 "approved"
  curl -s -X POST $B/changesets/<id>/approve -H 'x-dct-user: bob' -H 'x-dct-roles: steward'

  # tier-2 proposal: a delete
  curl -s -X POST $B/changesets -H 'content-type: application/json' \
    -H 'x-dct-user: alice' -H 'x-dct-roles: modeler' \
    -d '{"title":"retire","edits":[{"kind":"dq","id":"<dq-id>","action":"delete","spec":{}}]}'
  # EXPECT: 200, "tier":2, tierReasons includes "asset retirement (delete)"

  # steward on tier-2 -> 403 requiring change:signoff
  curl -s -X POST $B/changesets/<id2>/approve -H 'x-dct-user: bob' -H 'x-dct-roles: steward'
  # CDA approve -> 200; domain-owner merge -> 200 "merged"
  curl -s -X POST $B/changesets/<id2>/approve -H 'x-dct-user: dana' -H 'x-dct-roles: chief_data_architect'
  curl -s -X POST $B/changesets/<id2>/merge   -H 'x-dct-user: carol' -H 'x-dct-roles: domain_owner'

  # SoD: author approving own changeset -> 403 "segregation of duties"
  # withdraw: non-author -> 403 "only the author can withdraw"; author -> 200 "withdrawn"

  # access checker
  curl -s "$B/access/check?sub=bob&capability=change:approve&domain=<other-domain>"
  # EXPECT: allowed=false, reasons show capability granted but domain not covered
  curl -s "$B/access/check?sub=dana&capability=change:signoff"
  # EXPECT: allowed=true

  # --- products, auto-semver, live enforcer, write-back (new in this drop) ---
  # products list (OUR product definitions from Step 2g)
  curl -s $B/products
  # EXPECT: our products, each with its own version + memberCount

  # live enforcer: cosmetic-only edit (description tweak) -> PATCH, tier 1
  curl -s -X POST $B/validate -H 'content-type: application/json' \
    -d '{"edits":[{"kind":"bdm","id":"<asset>","spec":{<existing spec, description changed>}}]}'
  # EXPECT: valid=true, tier=1, versionPlan[0].level="patch"
  # (reference verified: 1.1.0 -> 1.1.1)

  # live enforcer: same spec with one FIELD REMOVED -> MAJOR, tier 2
  # EXPECT: versionPlan[0].level="major", tier=2, tierReasons names the field
  # (reference verified: "removes field 'minor_units'")

  # live enforcer: pk stripped from the key fields -> governance rejects
  # EXPECT: valid=false, issues includes PK_CARDINALITY at level "error";
  # nothing persisted (validate never writes)

  # product-increment loop: with MODELS_WRITEBACK=git + MODELS_DIR on a
  # feature-branch models clone, propose a tier-1 edit on a PRODUCT MEMBER,
  # approve (owning-domain steward), then merge (domain owner). EXPECT in the
  # merge response (reference verified):
  #   productIncrements: [{product, from "1.0.0", to "1.1.0", level "minor"}]
  #   writeback: {mode:"git", files:[asset yaml, product yaml], commit:<sha>}
  #   run: <id> — and GET $B/runs shows it with trigger="product-increment"
  #        and products=[{product, version:"1.1.0"}]
  # git log in MODELS_DIR: chore(models): <title> [changeset <id>, tier 1]
  #   containing BOTH the asset YAML and the bumped product YAML
  # (a tier-2 merge bumps the product MAJOR instead)

  # guardrail: check out main in the models clone, retry a merge
  # EXPECT: 409 "direct commits to main are forbidden"; changeset stays
  # approved, contract unchanged, no commit created

  # --- DQ rules library (new in this drop) ---
  curl -s $B/dq
  # EXPECT: library = the 8 seed rules, each with usage[] joined from OUR
  # rule sets; applications = every rule-set entry with its resolved form
  # (reference verified: 8 rules / 10 applications)

  # pipeline runs EXECUTE applied rules:
  curl -s -X POST $B/runs -H "x-dct-user: pat" -H "x-dct-roles: platform_engineer"
  # EXPECT: stats[].dq holds per-rule results {status: pass|fail|skipped,
  # violations}; freshness reports "skipped" locally (warehouse-only)

  # binding enforcement via the live enforcer: apply a column-scoped rule
  # (e.g. use: not_null_standard) WITHOUT a field binding in a dq edit
  # EXPECT: valid=false, issues includes DQ_BINDING_SCOPE

  # governance cascade: propose an edit to a library rule that is in use
  # EXPECT: tier=2, reason "modifies a DQ library rule applied by N
  # binding(s) across rule set(s) ...", version plan = major

UI spot-check in a browser at :8000 with the persona switcher: Assets lists all
9 kinds from OUR contracts; AssetEdit shows a tier verdict on propose;
Changesets shows tier badges + gated actions per persona; Pipelines triggers a
medallion run with gate results + per-entity DQ results; Products shows
independent product versions + increment history; DQ Library lists the generic
rules with parameters and applications; Migration shows the generated/postgres
manifest; Access renders the roles-x-capabilities matrix, users, data-clearance
model, approval policy, and the interactive checker.

  # --- Streamlit parallel child (Track F) ---
  # With the AppKit server up and MMP_API_BASE pointed at it, run:
  #   streamlit run apps/streamlit/app.py
  # PARITY CHECK, per page: the Streamlit view and the AppKit view over the
  # SAME persona + endpoint must MATCH (same governed truth — both are thin
  # clients over /api/*). Walk the parity matrix page-by-page (Dashboard,
  # Registry, Mappings, Data Model, DQ Library, Pipelines, Access) and record
  # a status for each. Expected non-parity: Data Model (React-Flow ERD is
  # React-only; Streamlit shows a table/Graphviz) — mark it, do not fake it.

STEP 8 — commit on the feature branch and open a PR. Do not include: REF's
contracts or lock, REF's generated/ output, any .env, or changes to our
ERD/theme/web surfaces.

REPORT BACK to the human with:
- Gates: pnpm typecheck / pnpm generate / pnpm check status (must be green).
- E2E: which of the Step-7 expectations passed, with actual status codes.
- Adaptation points: what you set for each of the six Step-5 seams (IdP users
  swapped or TODO'd; the new domainOf() mapping; tier-rule changes if any;
  APP_DEFAULT_ROLES; bundle names; MODELS_WRITEBACK/MODELS_DIR per environment).
- Products: the product definitions you authored in Step 2g (ids, domains,
  member counts) and confirmation that pnpm check passes the PRODUCT_* gates.
- Streamlit parallel child (Track F): parity status PER PAGE (Dashboard,
  Registry, Mappings, Data Model, DQ Library, Pipelines, Access) — for each,
  whether the Streamlit view matches the AppKit view over the same
  persona/endpoint, plus which of our existing Streamlit pages are migrated vs
  still on legacy Delta/UC reads (Data Model expected to be table/Graphviz-only).
- Anything skipped or deferred (e.g. DDL not applied because no database was
  reachable) and what remains for deploy time.
- The PR branch name and a one-paragraph summary suitable for the PR description.
```
