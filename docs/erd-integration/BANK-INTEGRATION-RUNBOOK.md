# Bank Integration Runbook — Interactive ERD (`/model`)

How to bring the interactive ERD into a **spun-off / diverged fork** of this repo
(your in-bank DEAL Control Tower), based on commit **`699de6c`** ("feat(web):
interactive ERD module (P1)"). Doc-only follow-up: `d0875f7`.

This is written for an **air-gapped environment**. The module is **pre-bundled**, so
the default path needs **no npm registry access and adds zero dependencies** to the
host app. You only need a connected machine if you choose to *rebuild* the bundle.

---

## 0. TL;DR

1. Copy the folder **`apps/web/erd/`** into your fork (it carries its own pre-built
   `dist/`).
2. Add one new file **`apps/web/app/model/page.tsx`**.
3. Apply **two tiny manual edits**: a nav link in `apps/web/app/layout.tsx`, and 3 lines
   in `apps/web/tsconfig.json`.
4. **Force-add** `apps/web/erd/dist/` (your root `.gitignore` ignores `dist/`).
5. Build & run the web app as usual → visit `/model`.

No `package.json`, `next.config`, or `pnpm-workspace.yaml` changes. No new host deps.

---

## 1. Prerequisites & assumptions

| Requirement | Why |
|---|---|
| Fork's web app is **Next.js (app router) + React 18 or 19** | React Flow 12 (bundled) supports React 18/19. React 17 will not work. |
| Host provides `react` / `react-dom` | The bundle leaves these external and shares the host's instance. |
| Fork still exposes model metadata via an SDK/API with `isPk`, `fkRef`, `classification`, `pii`, `mnpi` per field | The ERD is data-driven off this shape (see §6 if your fork renamed these). |
| `pnpm-workspace.yaml` globs `apps/*` (not `apps/**`) | So `apps/web/erd` is **not** treated as a workspace member and its build-only deps are never installed (firewall-safe). **Verify this — see §5.3.** |

---

## 2. Changelog — what to pick up from `699de6c`

24 files. Grouped by how you bring each one in:

### 2a. Copy as-is — the whole module folder `apps/web/erd/`
This is a self-contained drop-in. Copy the entire folder. Contents:

| Path | Type | Notes |
|---|---|---|
| `apps/web/erd/dist/erd.js` | **artifact** | Pre-bundled (React Flow + layout + CSS inlined; React external). **The host imports this.** Must be committed (see §4). |
| `apps/web/erd/dist/erd.d.ts` | **artifact** | Types for the bundle. |
| `apps/web/erd/index.tsx` | host entry | `"use client"` wrapper re-exporting `dist`. **Host imports this.** |
| `apps/web/erd/README.md` | docs | Integration checklist + rebuild steps. |
| `apps/web/erd/.gitignore` | config | Ignores `node_modules`, `src/generated`; keeps `dist/`. |
| `apps/web/erd/package.json` | build-only | Graph deps for *rebuilds only*. **Not** a workspace member. |
| `apps/web/erd/package-lock.json` | build-only | Reproducible rebuilds. |
| `apps/web/erd/tsconfig.json` | build-only | Module typecheck. |
| `apps/web/erd/tsup.config.ts` | build-only | Bundler config (platform browser, React-require banner, single file). |
| `apps/web/erd/scripts/inline-css.mjs` | build-only | Inlines React Flow CSS at build time. |
| `apps/web/erd/src/index.ts` | source | Module entry. |
| `apps/web/erd/src/ErdExplorer.tsx` | source | Main component (canvas, toolbar, modes). |
| `apps/web/erd/src/EntityNode.tsx` | source | Entity node (PK/FK/classification treatment). |
| `apps/web/erd/src/RelationshipEdge.tsx` | source | Edge (cardinality, tint/dash). |
| `apps/web/erd/src/layout.ts` | source | Dependency-free semantic layered layout. |
| `apps/web/erd/src/theme.ts` | source | Maps DCT CSS tokens → ERD colors. |
| `apps/web/erd/src/data/types.ts` | source | `SourceModel`/`SourceField` (the data contract). |
| `apps/web/erd/src/data/toGraph.ts` | source | Pure mapper: models → nodes/edges. |
| `apps/web/erd/src/data/access.ts` | source | "View as" role masking. |
| `apps/web/erd/src/__tests__/toGraph.test.ts` | source | Unit tests. |

> **NOT in the commit (do not look for them):** `apps/web/erd/node_modules/` and
> `apps/web/erd/src/generated/xyflowCss.ts` are gitignored. The CSS is already inlined
> in `dist/erd.js`; `generated/` is only re-created if you rebuild.

### 2b. New host file — copy as-is
| Path | Type |
|---|---|
| `apps/web/app/model/page.tsx` | **new route** — the `/model` page shell (server component, fetches models, renders `<ErdExplorer>`) |

### 2c. Manual merges — apply by hand (your fork's versions have diverged)
| Path | Change |
|---|---|
| `apps/web/app/layout.tsx` | add ONE nav `<Link>` (see §3, step 3) |
| `apps/web/tsconfig.json` | add THREE entries to `exclude` (see §3, step 4) |

### 2d. Optional — documentation
| Path | Type |
|---|---|
| `docs/erd-integration/ERD-INTEGRATION-PLAN.md` | analysis + plan (optional) |
| `docs/erd-integration/BANK-INTEGRATION-RUNBOOK.md` | this file (optional) |

---

## 3. Step-by-step integration (manual / air-gapped path)

> Use this path when the fork does not share git history with this repo, or you are
> transferring a bundle across the firewall. (If your fork *does* share history and you
> can fetch this repo, `git cherry-pick 699de6c` does steps 1–4 automatically — then
> resolve the layout.tsx / tsconfig.json merges by hand and skip to §5.)

### Step 1 — Copy the module folder
Copy `apps/web/erd/` from this repo into the same path in your fork. Include `dist/`.
Exclude `node_modules/` and `src/generated/` if present (they're regenerated).

### Step 2 — Add the route
Create `apps/web/app/model/page.tsx` with exactly this content:

```tsx
import { dct } from "../lib/client";
import { ErdExplorer } from "../../erd";

export const dynamic = "force-dynamic";

export default async function ModelPage() {
  const { models } = await dct.models({ kind: "bdm" });
  return (
    <>
      <p className="eyebrow">Data model</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Interactive ERD</h1>
      <p className="mt-2 text-sm text-muted">
        {models.length} business models · click an entity to expand its fields · click a{" "}
        <span className="text-accent">FK→</span> to traverse · &ldquo;View as&rdquo; masks attributes by clearance.
      </p>
      <div className="mt-6">
        <ErdExplorer models={models} />
      </div>
    </>
  );
}
```

> If your fork's API client import path or method differ, adjust **only this file** —
> see §6. The `<ErdExplorer>` takes a plain array, so anything that yields the right
> field shape works.

### Step 3 — Add the nav link (`apps/web/app/layout.tsx`)
Insert one line into the `<nav>` (placement is cosmetic):

```diff
               <Link href="/registry" className="hover:text-ink">Registry</Link>
+              <Link href="/model" className="hover:text-ink">Data model</Link>
               <Link href="/pipelines" className="hover:text-ink">Pipelines</Link>
```

### Step 4 — Exclude the module source from the host tsconfig (`apps/web/tsconfig.json`)
So the host build never needs the graph deps installed:

```diff
   "exclude": [
-    "node_modules"
+    "node_modules",
+    "erd/src",
+    "erd/node_modules",
+    "erd/tsup.config.ts"
   ]
```

> If your fork's tsconfig already has an `exclude` with other entries, just **add** the
> three `erd/...` lines — don't replace the array.

---

## 4. Commit the artifact (important)

Your root `.gitignore` ignores `dist/`, so `git add` will skip the pre-built bundle.
Force-add it (it's the thing the host actually imports):

```bash
git add apps/web/erd apps/web/app/model/page.tsx apps/web/app/layout.tsx apps/web/tsconfig.json
git add -f apps/web/erd/dist/erd.js apps/web/erd/dist/erd.d.ts
git commit -m "feat(web): integrate interactive ERD (/model) from data-mesh-reference 699de6c"
```

---

## 5. Build, verify, run (inside the bank)

### 5.1 Build order
The module needs **no build** — `dist/` is committed. Just build the host app:

```bash
pnpm install                                   # unchanged; will NOT pull ERD deps (see 5.3)
pnpm --filter @dct/web typecheck               # expect clean
pnpm --filter @dct/web build                   # expect /model in the route tree
```

### 5.2 Run / smoke test
```bash
# API (or point at your running control-plane API)
pnpm --filter @dct/api start                   # :4400
# Web
DCT_API_URL=http://localhost:4400 pnpm --filter @dct/web dev   # :4500
```
Open **http://localhost:4500/model** and confirm: entities render, expand shows
PK/FK/classification, clicking an FK focuses the target, "View as" masks fields,
zoom/pan/minimap/fullscreen work.

### 5.3 Firewall-safety check (do this once)
Confirm the module's build-only deps will **not** be installed by the host:

```bash
grep -A3 'packages:' pnpm-workspace.yaml       # should be "apps/*" and "packages/*"
```
- If it says `apps/*` → `apps/web/erd` is **not** a workspace member. ✅ Nothing to do.
- If it globs `apps/**` (or similar deep glob) → it would try to install
  `apps/web/erd`'s graph deps and hit the firewall. Fix by narrowing the glob or
  excluding it, e.g. add `- "!apps/web/erd"` to `pnpm-workspace.yaml`.

---

## 6. If your fork has diverged (adaptation points)

The ERD is intentionally decoupled. There are exactly **three** things that can differ
in a diverged fork, and where to fix each:

1. **API client / fetch** — `apps/web/app/model/page.tsx` only.
   The module takes `models: SourceModel[]`. If your fork's client isn't
   `dct.models({ kind: "bdm" })`, fetch however you do and pass the array. To include
   PDM/semantic/source too, use your "registry"/all-models call (the toolbar's
   **BDM / All** toggle then filters client-side).

2. **Field shape** — if your fork renamed the per-field metadata, map it in `page.tsx`
   before passing in. The module needs this exact shape (`SourceModel`/`SourceField`,
   see `apps/web/erd/src/data/types.ts`):
   ```ts
   { kind, id, domain, version, status, fields: [
     { name, type, classification, pii, mnpi, isPk, fkRef /* "entity.field" | null */ }
   ] }
   ```
   Example adapter:
   ```ts
   const models = raw.map(m => ({
     kind: m.kind, id: m.id, domain: m.domain, version: m.version, status: m.status,
     fields: m.fields.map(f => ({
       name: f.name, type: f.type, classification: f.classification,
       pii: !!f.pii, mnpi: !!f.mnpi, isPk: !!f.primaryKey, // <- your name
       fkRef: f.references ?? null,                          // <- your name
     })),
   }));
   ```

3. **Design tokens** — `apps/web/erd/src/theme.ts` references DCT CSS variables
   (`--color-ink`, `--color-accent`, `--color-brass`, …). If your fork renamed tokens,
   edit `theme.ts` and **rebuild** (§7). Missing tokens fall back to sane defaults.

Roles for the "View as" masking live in `apps/web/erd/src/data/access.ts` — edit +
rebuild to match your role/clearance model.

Nothing else is domain-coupled: entity names, FK edges, layout ranks, and domain
clustering are all derived at runtime from whatever the API returns. Your
`facility`/`loan`/`gl_journal` remap needs **no code change**.

---

## 7. Rebuilding the bundle (only if you changed `src/`)

Required only after editing `theme.ts`, `access.ts`, or any `src/` file. **Do this on an
internet-connected machine** (or wire the internal Artifactory mirror + corporate CA —
see the corporate-setup guidance), then carry the new `dist/` back in.

```bash
cd apps/web/erd
npm ci            # or: npm install   (installs build-only deps: React Flow, tsup, …)
npm run typecheck
npm test          # toGraph unit tests
npm run build     # regenerates src/generated/xyflowCss.ts + dist/erd.js + erd.d.ts
git add -f dist/erd.js dist/erd.d.ts
git commit -m "chore(erd): rebuild bundle"
```

The build is already configured for the tricky bits (no action needed, just FYI):
`tsup.config.ts` sets `platform: "browser"` + `splitting: false` and injects a small
`require("react")` → host-ESM-React banner (needed because zustand's
`use-sync-external-store` shim does a CJS `require("react")`). Do **not** add `dagre` or
`html-to-image` back — both are CommonJS and reintroduce a `require` shim that Next's
Turbopack rejects at runtime; the layout is dependency-free by design and PNG export is
intentionally out of scope.

---

## 8. Rollback

The change is additive and isolated:
```bash
git rm -r apps/web/erd apps/web/app/model
git checkout -- apps/web/app/layout.tsx apps/web/tsconfig.json   # revert the 2 edits
```
No other code depends on the module.

---

## 9. Zero-IP note

The module ships **no sample/domain content** — it renders whatever your API returns.
Nothing employer-specific is in these files. Safe to keep generic in any shared repo.
