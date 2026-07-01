# Integration Handover — latest reference changes → corporate tool

Pull the latest changes from the **`data-mesh-reference`** baseline into your corporate
**Model & Metadata Management Tool** (formerly "DEAL Control Tower" — ignore that naming;
adapt to your current name/structure).

> Your corporate fork has diverged materially from the baseline (lending/finance domain;
> the ERD relocated **server-side** with the standalone `apps/web/erd` package removed;
> new review/mapping surfaces; re-branding). So this is a **guided integration**, not a
> clean `git cherry-pick` of everything. Two tracks below: one that cherry-picks cleanly,
> one that must be **re-applied** to your structure.

## 0. TL;DR

| | |
|---|---|
| Repo | `https://github.com/brettontaylor/data-mesh-reference` (branch `main`) |
| Commits to integrate | **`58c1acc`** (asset kinds + business keys + docs) · **`8e2f047`** (ERD overhaul + Confluence theme) |
| Track 1 — backend/asset model | **Cherry-pick `58c1acc`**, fold additive blocks, **skip** our synthetic contracts + lock; add `bk` + your own new-kind contracts |
| Track 2 — ERD + theme | **Re-apply** ERD logic to your server-side ERD; apply theme tokens |
| Naming | Tool renamed generically; don't preserve "DEAL Control Tower" wording |

## 1. What changed this session

**`58c1acc` — governed asset kinds + business keys** (portable, backend-centric):
- Five new first-class, versioned, governed asset kinds threaded through the whole spine
  (engine `types.ts`/`load.ts`/`surface.ts`/`registry.ts` → `projection`/`sdk` `ModelKind`
  → `api/mapping.ts` projection → `governance.ts` `ModelEditKind`/`DIRS`/`idField`/
  `applyEdits`/`currentIds` → catalog):
  - **`mapping`** (bronze→silver field mapping), **`transformation`** (graded silver→gold:
    sources/joins, UNION matrix + subqueries as governed SQL text, polymorphic key
    resolution, refmap refs, per-field logic + bronze lineage tail), **`refmap`** (reusable
    reference/key-resolution maps), **`dq`** (data-quality rule sets), **`extract`**
    (consumer extract/view contracts — breaking change = consumer-impacting).
- **`bk`** (business/natural key) field attribute alongside `pk`/classification.
- Long-form **master requirements/architecture doc** + design docs `platform/12` & `13`.

**`8e2f047` — ERD overhaul + Confluence theme** (needs re-application to your structure):
- ERD: **ELK layered layout + ORTHOGONAL edge routing** (obstacle-avoiding, right-angle
  connectors; edges route around boxes) with a floating-edge fallback; **canonical field
  ordering** (PK → business key → process date → decimal → integer → string → date →
  boolean → flags); **PK (blue) / business-key (green) row shading**; corporate white/blue
  node theme; **cardinality** (`1` — `0..*`) offset off the node; **recenter/ego-fit on
  expand** with size-aware layout (expanding pushes neighbours, no overlap); minimap
  removed; deep-link (`?focus=`) → auto-expand + center; **compact embed mode**
  (diagram-only + integrated Open-full-ERD/Fullscreen). ELK is inlined into the bundle.
- Site: **Confluence-style theme** (white surfaces, corporate blue accent, neutral borders)
  via `globals.css` tokens; badge lozenges; catalog/detail ERD deep-links; BDM detail
  embeds a compact entity-focused ERD; transformation/refmap detail renderers.

## 2. Fetch the baseline changes

```bash
git remote add ref https://github.com/brettontaylor/data-mesh-reference.git   # once
git fetch ref
git log --oneline ref/main -5          # see 58c1acc, 8e2f047
git diff db7a95e..8e2f047 --stat       # full change set vs the prior baseline
```

## 3. Integration map

| Area (baseline path) | How to integrate into your fork |
|---|---|
| `packages/engine/src/framework/types.ts` | **Fold additive** — add the new interfaces (`Mapping/Transformation/RefMap/DqRuleSet/Extract` + nested), extend `ModelKind`, add `Contract` arrays, add `bk?` to `Field` |
| `packages/engine/src/framework/load.ts` | **Fold** — parse the new contract dirs in both loaders |
| `packages/engine/src/registry/{surface,registry}.ts` | **Fold** — new surfaces + severity branches + `buildModels` loops |
| `packages/projection/src/types.ts`, `packages/sdk-ts/src/index.ts` | **Fold** — extend `ModelKind`; add `bk?` to field records |
| `apps/api/src/mapping.ts` | **Fold** — project the new kinds into `ModelRecord`s; add `bk` |
| `apps/api/src/governance.ts` | **Fold** — extend `ModelEditKind`/`DIRS`/`idField`/`applyEdits`/`currentIds` |
| `packages/engine/contracts/bdm/*.yaml`, `registry.lock.json` | **SKIP ours** (capital-markets/synthetic). Instead add `bk: true` to *your* business keys and **regenerate the lock** |
| `packages/engine/contracts/{mappings,dq,extracts,transformations,refmaps}/*` | **Author your own** for the lending domain — ours are synthetic examples to copy the shape from |
| `docs/platform/12`, `docs/platform/13`, `docs/DEAL-Control-Tower-Master-Requirements.md` | **Copy** (rename to your tool name) |
| `apps/web/erd/**` | **Re-apply the logic** — you moved ERD server-side; port the algorithm/UX (see Track 2). Do **not** re-introduce the standalone package |
| `apps/web/app/globals.css`, `components/Badges.tsx` | **Apply** the Confluence theme tokens + badge lozenges (merge with your theme) |
| `apps/web/app/page.tsx`, `model/page.tsx`, `models/[kind]/[id]/page.tsx` | **Adapt** — ERD deep-links, compact embed, transformation/refmap detail renderers, onto your (diverged) pages |

## 4. Track 1 — backend & asset model (cherry-pick + fold)

```bash
git checkout -b feat/asset-kinds
git cherry-pick 58c1acc            # from ref/main
```
Expect conflicts where you've edited the same engine/api files. Resolve by **keeping your
file and folding in the additive blocks** (new interfaces, new `ModelKind` members, new
ternary branches, new `buildModels`/`applyEdits` cases, `bk?` fields).

Then, because your domain differs, **do not keep our contracts or lock**:
```bash
git checkout --ours packages/engine/contracts/bdm packages/engine/contracts/registry.lock.json
# (or `git rm` our synthetic mappings/dq/extracts/transformations/refmaps if they were added)
```
Instead:
1. Add `bk: true` to your own business-key fields in your BDM contracts.
2. Author your own `contracts/{mappings,dq,extracts,transformations,refmaps}/*.yaml`
   (copy the shape from ours; use the schemas in `docs/platform/12` & `13`).
3. Regenerate the lock, typecheck, and run your gates:
   ```bash
   npm run generate && npm run typecheck && npm run check   # your equivalents
   ```
Governance for the new kinds works via the extended `applyEdits`/`DIRS`/`idField`; verify a
ChangeSet on a new kind produces the right semver diff.

## 5. Track 2 — ERD + theme (re-apply to your server-side ERD)

Your ERD is server-side (`apps/api/src/erd.ts` + `model/page.tsx`), so port the *logic*
from the baseline ERD module (`apps/web/erd/src/*`) into your implementation:

| Improvement | Baseline source (reference) |
|---|---|
| ELK layered + ORTHOGONAL routing (obstacle-avoiding) | `erd/src/elk-layout.ts` |
| Floating-edge geometry (fallback) | `erd/src/floating.ts`, `RelationshipEdge.tsx` |
| Canonical field ordering (PK→BK→…→flags) | `erd/src/data/toGraph.ts` (`fieldOrder`) |
| PK (blue) / business-key (green) row shading + corporate node theme | `erd/src/EntityNode.tsx`, `theme.ts` |
| Cardinality labels (`1`—`0..*`), offset off node | `RelationshipEdge.tsx` |
| Recenter/ego-fit on expand; size-aware layout (no overlap); deep-link focus; compact embed | `erd/src/ErdExplorer.tsx` |

Theme: fold the token values from `apps/web/app/globals.css` (white surfaces, corporate
blue accent `#0052cc`, neutral borders) and the badge lozenge styles from
`components/Badges.tsx` into your theme. Wire ERD deep-links + the compact embed into your
catalog and model-detail pages (adapt the patterns from our `page.tsx` / `model/page.tsx` /
`models/[kind]/[id]/page.tsx`).

## 6. Verify

```bash
npm run typecheck        # all packages green
npm run generate && npm run check   # contracts ↔ generated agree; registry-consistency + gates pass
# governance smoke: propose a ChangeSet on a new kind → correct semver diff + gates
# run app: model catalog shows new kinds; ERD renders orthogonal routing + PK/BK shading
```

## 7. Conflict cheat-sheet

| File | Resolution |
|---|---|
| `engine/**`, `api/mapping.ts`, `api/governance.ts` | Keep **yours**; fold in our additive blocks (new kinds, `bk`, new cases) |
| `contracts/bdm/*`, `registry.lock.json` | Keep **yours** (lending domain); add `bk` + regenerate lock |
| `globals.css`, `Badges.tsx` | Merge — take our token values/lozenges into your theme |
| `apps/web/erd/*` | **Ignore as a package** — re-apply the logic server-side per Track 2 |
| web pages | Merge carefully — both sides changed them; keep your review/mapping surfaces, add our ERD deep-link/embed + detail renderers |

## 8. Paste-ready integration prompt

Paste this into a Claude Code session **inside your corporate repo**:

```
You are in our corporate "Model & Metadata Management Tool" repo — a diverged fork of the
`data-mesh-reference` baseline (lending/finance domain; ERD relocated server-side with the
standalone apps/web/erd package removed; review/mapping surfaces added; re-branded). Do NOT
restore "DEAL Control Tower" naming or the capital-markets domain; keep our domain, naming,
and review/mapping surfaces intact.

Task: integrate the latest baseline changes (commits 58c1acc and 8e2f047) from the
data-mesh-reference repo into this repo, following its docs/handover/INTEGRATION-HANDOVER.md.

Steps:
1. git remote add ref https://github.com/brettontaylor/data-mesh-reference.git && git fetch ref
   Read ref/main docs/handover/INTEGRATION-HANDOVER.md and docs/platform/12 & 13.

2. TRACK 1 — backend/asset model (portable). On a new branch, cherry-pick 58c1acc. Resolve
   conflicts by KEEPING our files and folding in only the ADDITIVE blocks:
   - engine types: new interfaces (Mapping, Transformation, RefMap, DqRuleSet, Extract +
     nested), ModelKind += mapping|dq|extract|transformation|refmap, Contract arrays, and a
     `bk?` (business key) flag on Field
   - engine load.ts: parse the new contract dirs (both loaders)
   - engine surface.ts/registry.ts: new surfaces + severity branches + buildModels loops
   - projection & sdk: extend ModelKind; add `bk?` to field records
   - api/mapping.ts: project the new kinds into ModelRecords; add bk
   - api/governance.ts: extend ModelEditKind/DIRS/idField/applyEdits/currentIds
   SKIP the baseline's synthetic contracts and lock (its bdm/*.yaml capital-markets, its
   registry.lock.json, and its synthetic mappings/dq/extracts/transformations/refmaps). Keep
   OUR lending-domain contracts. Then: add `bk: true` to our business-key fields; author our
   own contracts/{mappings,dq,extracts,transformations,refmaps}/*.yaml using the schemas in
   docs/platform/12 & 13; regenerate the registry lock. Typecheck + run our gates until green.

3. TRACK 2 — ERD + theme (re-apply; do NOT reintroduce the standalone erd package). Port the
   ERD logic into our SERVER-SIDE ERD, using these baseline files as reference:
   - apps/web/erd/src/elk-layout.ts  → ELK layered + ORTHOGONAL (obstacle-avoiding) routing
   - apps/web/erd/src/floating.ts, RelationshipEdge.tsx → fallback geometry + cardinality (1—0..*)
   - apps/web/erd/src/data/toGraph.ts (fieldOrder) → canonical field ordering
   - apps/web/erd/src/EntityNode.tsx, theme.ts → PK (blue)/business-key (green) shading + node theme
   - apps/web/erd/src/ErdExplorer.tsx → recenter/ego-fit on expand, size-aware layout (no
     overlap), deep-link focus, compact embed
   Fold the Confluence theme tokens from apps/web/app/globals.css and badge lozenges from
   components/Badges.tsx into our theme. Add ERD deep-links + a compact entity-focused embed
   on the model-detail page, and transformation/refmap detail renderers, adapting our pages.

4. Verify: typecheck all packages; run generate + check (contracts↔generated agree, gates
   pass); propose a ChangeSet on a new asset kind and confirm the semver diff + gates; run
   the app and confirm the new kinds appear in the catalog and the ERD shows orthogonal
   routing with PK/BK shading.

Report: what you folded, what you skipped (the synthetic contracts), and how you resolved
conflicts. Keep changes additive; don't revert our domain or review surfaces.
```
