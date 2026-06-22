# Interactive ERD — Analysis, Audit & Integration Plan

**Target:** add a robust, WineGraph-grade interactive ERD to the DEAL Control Tower web app, packaged as a **self-contained, drop-in module** with minimal, clearly-documented touch points into the host app — so it re-integrates cleanly into the diverged bank fork.

**Status:** **P1 BUILT & verified** (see addendum at the end). Phases P2–P4 remain planned.

---

## 1. Executive summary

The DCT web app defines an "Interactive ERD" in its requirements (FR-UI-003, `docs/platform/07-ui-ux.md`, jira `Interactive ERD`) but does not yet implement it. The good news from the audit:

1. **The data is already there.** The API publishes `isPk` and `fkRef` on every field (`apps/api/src/mapping.ts`), plus `classification`, `pii`, `mnpi`, `domain`, and `dependsOn` on every model. The `@dct/sdk` `models()` / `registry()` methods already return the full schema. **No API or contract changes are required.**
2. **Same stack as WineGraph.** Both are Next.js 16.2.9 / React 19.2.4 / Tailwind v4 (app-router, TS strict). WineGraph's ERD components are portable with light adaptation.
3. **One design change vs WineGraph.** WineGraph renders from a *hardcoded* wine spec (`web/lib/spec.ts`) with *hardcoded* layout geography (`LAYOUT_GEOGRAPHY`). DCT must be **data-driven**: consume the live model list and **auto-lay-out** the graph (layered, grouped by `domain`). This is what makes the ERD render your bank's actual BDM/PDM graph automatically.

**Net effect:** because the ERD reads the live API, when your fork renames `trade`→`loan`, `position`→`facility`, etc., the diagram updates itself. No spec to maintain.

---

## 2. Audit findings (three codebases)

### 2.1 WineGraph ERD — the featureset bar (gold standard)

| Aspect | Finding |
|---|---|
| Files | `web/components/model/ModelExplorer.tsx`, `web/components/model/EntityNode.tsx`, `web/lib/model-graph.ts` (projection), `web/lib/spec.ts` (hardcoded domain spec) |
| Library | **`@xyflow/react` (React Flow) v12.11.0** — DOM nodes + SVG edges; `Background`, `Controls`, `MiniMap`, `useNodesState/useEdgesState` |
| Layout | Custom **hardcoded geography** (7 lanes terroir→demand × 3 bands) — wine-specific, the main thing we must replace |
| Data | Graph structure from static `spec.ts`; live row counts from Postgres `public_entity`/`public_edge` |
| Features present | expand/collapse nodes, attribute lists, PK badge (🔑), FK marker (⛓ + `→ target`), relationship edges w/ arrowheads, edge-type labels, sensitivity-dashed edges, hover tooltips, focus dropdown (search), zoom/pan, minimap, **explore/ego mode** (focal + 1-hop, others dimmed), highlight neighbors, click-FK-to-traverse, **fullscreen**, tier legend, responsive |
| Features absent | image export, dark mode, global collapse-all, cardinality (1:N) glyphs |
| Coupling | Low for the components (ModelExplorer takes only `counts`); **high** for `spec.ts` (wine entities) + `LAYOUT_GEOGRAPHY` (wine lanes) + color palettes/fonts |

### 2.2 semantic-quay `/developers/model` — the thin genericized port

| Aspect | Finding |
|---|---|
| Files | `app/developers/model/page.tsx` (custom SVG, no graph lib); `app/developers/_reference/{index.ts,catalog.json,access.json}`; `components/{ClassificationBadge,RoleSelector,TagBadge}.tsx` |
| Library | **None** — bespoke cubic-Bézier SVG over a flex-wrap layout |
| Features present | expand/collapse (incl. expand-all/collapse-all), attribute lists, PK/FK labels, FK→target tooltip, Bézier FK edges, hover-highlight neighbors (others fade), **live attribute-level role masking** (strike-through masked fields), clearance UI, responsive |
| Features absent | layout engine, search, zoom/pan, drag, cardinality, deep-link, export, dark mode |
| Worth stealing | The **role × attribute masking** model (`SchemaField` + `decide()`), and `references: "entity.field"` FK convention — already aligned with DCT's `fkRef` |

### 2.3 DCT web app — the integration target

| Aspect | Finding |
|---|---|
| Stack | Next.js 16.2.9, React 19.2.4, Tailwind v4, TS strict, app-router; pages SSR `force-dynamic` |
| Routes | `/` (catalog), `/registry`, `/pipelines`, `/lineage`, `/access`, `/models/[kind]/[id]` |
| Graph precedent | `apps/web/app/lineage/page.tsx` renders relationships as **DOM boxes only** (no graph lib). Confirms there's no incumbent graph renderer to reuse — we add one. |
| Model data | `@dct/sdk` `SdkModel.fields[]` carries `isPk`, `fkRef` (`"entity.field"`\|null), `classification`, `pii`, `mnpi`; model carries `domain`, `version`, `status`, `dependsOn`. Endpoints: `GET /api/v1/models[?kind=bdm&domain=…]`, `/api/v1/models/:kind/:id`, `/api/v1/registry`, `/api/v1/domains`. |
| Contracts | `packages/engine/contracts/bdm/*.yaml` declare `pk: true` and `fk: { entity, field }` per field (your fork already has facility/loan/gl_journal in this shape). |
| Design tokens | `--color-ink #0d1b2a`, `--color-paper #f6f4ef`, `--color-paper-soft #efece3`, `--color-accent #15756b` (teal), `--color-brass #b5893f`, `--color-muted`, `--color-line`. Badges in `apps/web/components/Badges.tsx`. |
| Dev/build | `apps/web` runs on `:4500`, talks to API via `DCT_API_URL` (default `:4400`); `next.config.ts` already `transpilePackages: ["@dct/sdk"]`. |

---

## 3. Feature parity plan

| Capability | WineGraph | DCT ERD (planned) |
|---|---|---|
| Expand/collapse entity → fields | ✅ | ✅ port |
| PK badge / FK marker + target | ✅ | ✅ port (from `isPk`/`fkRef`) |
| Relationship edges + arrowheads | ✅ | ✅ from `fkRef` (entity→entity) |
| Classification/PII/MNPI on fields | partial (sensitivity) | ✅ **upgrade** — reuse DCT tier+PII+MNPI badges |
| Auto-layout | ❌ hardcoded geography | ✅ **dagre layered**, grouped by `domain` |
| Domain grouping/clustering | implicit lanes | ✅ explicit domain swimlanes/clusters |
| Search / focus entity | ✅ dropdown | ✅ dropdown + text filter |
| Explore / ego (1-hop) mode | ✅ | ✅ port |
| Highlight neighbors on hover | ✅ | ✅ port |
| Click FK → traverse | ✅ | ✅ port |
| Zoom / pan / minimap / fullscreen | ✅ | ✅ port (React Flow built-ins) |
| Toggle PDM bindings / layers | ❌ | ✅ **new** — toggle BDM-only ↔ show PDM physical tables + BDM→PDM links |
| Cardinality (1:N) glyphs | ❌ | ✅ **new** — infer from PK vs FK side |
| Deep-link to entity (`?focus=`) | partial | ✅ **new** — URL state |
| Export PNG/SVG | ❌ | ✅ **new** — `toPng` (html-to-image) |
| Access-aware masking by role | ❌ (WG) / ✅ (SQ) | ✅ **optional tier-2** — reuse `/access` engine |
| Dark mode | ❌ | ⚠️ optional (tokens exist; low priority) |

---

## 4. Target architecture

```
DCT API  ──/api/v1/models──►  @dct/sdk  ──►  erd/data/toGraph.ts  ──►  erd/ErdExplorer.tsx
(isPk, fkRef, domain,            (SdkModel[])    (pure: models→nodes+edges,    (React Flow + dagre
 classification, pii, mnpi)                       dagre layout, ego network)    + EntityNode + UI)
```

- **Pure mapping layer** (`toGraph.ts`) replaces WineGraph's `spec.ts` + `model-graph.ts`. Input: `SdkModel[]`. Output: typed `{ nodes, edges }` for React Flow. Unit-testable, no React.
- **Auto-layout** (dagre) replaces `LAYOUT_GEOGRAPHY`. Rank direction LR; cluster by `model.domain`. No domain knowledge baked in.
- **Components** (`ErdExplorer.tsx`, `EntityNode.tsx`) adapted from WineGraph but re-themed to DCT tokens and fed by the mapper.
- **Host page** is a thin shell that fetches and renders — all real logic stays in the module folder.

### 4.1 Module public surface (what the host imports)

```ts
// erd/index.ts
export { ErdExplorer } from "./ErdExplorer";       // <ErdExplorer models={SdkModel[]} role?={string} />
export { toGraph } from "./data/toGraph";          // pure: (models, opts) => { nodes, edges }
export type { ErdNode, ErdEdge, ErdOptions } from "./data/types";
```

One component, one prop (`models`), optional `role`. That's the entire contract with the host app.

---

## 5. Standalone folder (the segregated module)

Recommended home: **`apps/web/erd/`** — a single self-contained folder. (Promotable later to a `packages/erd` workspace package with no code changes; see §8.)

```
apps/web/erd/
├── README.md                 # what it is + the integration checklist (mirrors §6)
├── index.ts                  # public exports
├── ErdExplorer.tsx           # main client component (React Flow canvas + toolbar + modes)
├── EntityNode.tsx            # custom React Flow node (header, fields, PK/FK + classification badges)
├── RelationshipEdge.tsx      # custom edge (arrowhead, cardinality glyph, dashed for restricted)
├── toolbar/
│   ├── FocusPicker.tsx       # search/focus dropdown + text filter
│   ├── LayerToggles.tsx      # BDM-only ↔ +PDM, +semantic; show/hide masked fields
│   └── ExportButton.tsx      # PNG/SVG export
├── data/
│   ├── types.ts              # ErdNode, ErdEdge, ErdOptions, FieldView
│   ├── toGraph.ts            # PURE: SdkModel[] -> {nodes,edges}; ego network; cardinality
│   └── layout.ts             # dagre layered layout + domain clustering
├── theme.ts                  # maps DCT CSS tokens -> node/edge colors (single place to re-skin)
└── __tests__/
    └── toGraph.test.ts       # pure-logic unit tests (PK/FK edges, ego, cardinality)
```

Everything ERD lives here. The only things *outside* this folder are the 4 host edits in §6.

---

## 6. Integration into the bank fork (host touch points)

Exactly four edits to the host app — small, stable, easy to re-apply after a merge:

1. **Add the dependency** (one package + layout + export helper):
   ```
   @xyflow/react   ^12     # graph canvas (the WineGraph choice)
   dagre           ^0.8    # auto-layout (+ @types/dagre)
   html-to-image   ^1      # PNG/SVG export
   ```
   ⚠️ **Firewall:** these must resolve from your internal Artifactory mirror (see `deploy/CORPORATE-SETUP` / the proxy+CA guidance). Pin versions; they're small and dependency-light.

2. **Drop in the folder:** copy `apps/web/erd/` into the fork (unchanged).

3. **Add the route shell** — `apps/web/app/model/page.tsx`:
   ```tsx
   import { dct } from "../lib/client";
   import { ErdExplorer } from "../../erd";
   export const dynamic = "force-dynamic";
   export default async function ModelPage() {
     const { models } = await dct.models({ kind: "bdm" }); // or registry() for all kinds
     return (
       <main className="mx-auto max-w-6xl px-6 py-10">
         <p className="eyebrow">Data model</p>
         <h1 className="mt-2 text-2xl font-semibold text-ink">Interactive ERD</h1>
         <div className="mt-6"><ErdExplorer models={models} /></div>
       </main>
     );
   }
   ```

4. **Add the nav link** in `apps/web/app/layout.tsx` (one `<Link href="/model">Data model</Link>` beside the existing nav).

Optional (tier-2): pass `role` to `<ErdExplorer role={...} />` to enable live attribute masking via the `/access` engine.

**Run / verify:**
```
DCT_API_URL=http://localhost:4400 pnpm --filter @dct/web dev   # http://localhost:4500/model
pnpm --filter @dct/web typecheck
```

---

## 7. Why it auto-adapts to your domain

WineGraph hardcoded its 30 wine entities and their lane geography. The DCT module derives **everything** at runtime from `dct.models()`:

- **Nodes** = the BDMs the API returns (your `facility`, `loan`, `gl_journal`, …).
- **Edges** = every field whose `fkRef` points at another entity.
- **Layout** = dagre over those edges, clustered by each model's `domain` (banking / finance / reference — matching your remap).
- **Badges** = each field's `classification` + `pii`/`mnpi`.

So when your second-wave domain remap merges, the ERD reflects it on next load — **no spec edits, no layout edits.** This is the single biggest reason to go data-driven rather than copy WineGraph's `spec.ts`.

---

## 8. Decisions & trade-offs

- **Folder vs workspace package.** Recommend the self-contained `apps/web/erd/` folder for lowest integration friction in a diverged fork (one copy + 4 edits, no pnpm-workspace/transpile wiring). If you later want to share it (CLI docs, a second app), promote to `packages/erd` (`@dct/erd`): move the folder, add to workspace, add to `transpilePackages`. The module code doesn't change.
- **React Flow vs zero-dep SVG.** You asked for the *robust* WineGraph featureset (zoom/pan/minimap/ego/fullscreen) — that's React Flow. The semantic-quay zero-dep SVG approach is lighter but can't reach that bar. Given the firewall, the cost is "get 3 small packages into Artifactory once." Recommend React Flow.
- **dagre vs elk.** dagre is smaller and sufficient for layered ERD; elkjs is heavier (WASM) — skip unless you need orthogonal routing later.
- **Layout grouping.** Use `model.domain` for clustering rather than any hardcoded geography, so it stays domain-neutral.

---

## 9. Phasing (suggested)

- **P1 — Core ERD (MVP):** mapper + dagre layout + EntityNode (expand, PK/FK + classification badges) + edges + zoom/pan/minimap/fullscreen + focus picker. Renders live BDMs. *Deliverable: `/model` works.*
- **P2 — Navigation depth:** explore/ego mode, highlight neighbors, click-FK-to-traverse, deep-link `?focus=`, cardinality glyphs.
- **P3 — Layers & export:** BDM↔PDM↔semantic layer toggles (show physical bindings + BDM→PDM links), PNG/SVG export, legend.
- **P4 — Access-aware (optional):** role selector + live attribute masking reusing the `/access` decision engine.

P1 is the bulk of the value and is self-contained.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Firewall blocks `@xyflow/react`/`dagre` install | Vendor via internal Artifactory mirror; pin versions; they're small. Falls under the existing corporate-setup TLS/registry guidance. |
| Large model sets → cluttered graph | Default to BDM-only + focus/ego mode; PDM/semantic behind layer toggles; dagre ranks keep it readable. |
| Fork divergence breaks the 4 host edits | All logic is inside `apps/web/erd/`; the 4 edits are tiny and listed in the module README for fast re-apply. |
| React 19 / React Flow 12 compat | React Flow 12 supports React 19; pin the tested version in the module README. |
| Self-referential / composite FKs | Mapper handles self-edges and multiple FKs per entity; unit-tested in `toGraph.test.ts`. |

---

## 11. Verification

- `pnpm --filter @dct/web typecheck` clean.
- Unit tests: `toGraph` produces N nodes for N BDMs, one edge per `fkRef`, correct ego network, correct cardinality.
- Manual: `/model` renders the live BDM graph; expand a node shows fields with PK/FK + classification badges; click an FK focuses the target; export downloads a PNG.
- Zero-IP: module ships with **no** sample domain content — it renders whatever the host API returns. Nothing Mizuho-specific in the public repo.
```

---

## 12. Addendum — what P1 actually shipped (built & verified)

Implemented as a **pre-bundled, zero-host-dependency** drop-in at `apps/web/erd/`
(decision: pre-bundle into repo). The host gained `/model` with a nav link and a
3-line tsconfig exclude — **no new entries in `apps/web/package.json`**.

**Verified locally:** module typecheck clean · `toGraph` unit tests 5/5 · host
`pnpm --filter @dct/web typecheck` clean · `next build` clean (`/model` in route tree) ·
runtime smoke test against the live API renders all 5 seed BDMs (counterparty,
currency, instrument, position, trade) with the full toolbar/legend and **zero
runtime errors**.

**Two implementation changes vs the original §6 dependency list:**

1. **No `dagre`.** It's CommonJS; bundling it injected an esbuild `require` interop
   shim that Turbopack rejects at runtime (`dynamic usage of require is not
   supported`). Replaced with a ~40-line dependency-free **layered layout**
   (`src/layout.ts`) — which is exactly the semantic-geography concept (rank = FK
   depth, domain-clustered, optional pin map). Lighter and pure-ESM.
2. **No `html-to-image` in P1.** Also CJS; PNG export deferred to P3 (will use a
   client-only image path). Removing it kept the bundle pure ESM.

**One bundling note for future rebuilds:** zustand's `use-sync-external-store` shim
does a CJS `require("react")`. Since React is external (shared with the host), the
tsup config maps that require to the host's ESM React via a `banner` shim. Build with
`platform: "browser"` + `splitting: false`. Net artifact: a single `dist/erd.js`
(~205 KB) with React Flow + layout + CSS inlined, `react`/`react-dom` external.

**P1 feature set:** expand/collapse nodes; themed PK/FK + classification/PII/MNPI
treatment; FK-click traversal; crow's-foot cardinality; classification-tinted/dashed
edges; semantic layered layout; zoom/pan/minimap/fullscreen; focus/ego mode; and the
**"View as" role masking** (public→compliance) — the public/private view in DCT's tier
model. Integration checklist lives in `apps/web/erd/README.md`.
