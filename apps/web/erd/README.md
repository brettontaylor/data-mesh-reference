# DCT ERD module (`apps/web/erd`)

A self-contained, **pre-bundled** interactive ERD for the DEAL Control Tower web app.
It is **data-driven**: it renders whatever models the control-plane API returns
(`dct.models()` / `registry()`), reading `isPk` / `fkRef` / `classification` / `pii` /
`mnpi` / `domain` off each field. There is **no spec to maintain** — rename or add a
BDM in your fork and the diagram tracks it on next load.

## Why "pre-bundled"

`dist/erd.js` is committed with React Flow, the layered-layout engine, and React
Flow's CSS **inlined** (only `react` / `react-dom` are left external, shared with the
host). So integrating into an air-gapped fork needs **no registry access and adds zero
npm dependencies** to the host app.

```
erd/
├── dist/erd.js        ← committed pre-built artifact the host imports (do not edit)
├── dist/erd.d.ts      ← committed types
├── index.tsx          ← "use client" wrapper re-exporting dist  ← host imports THIS
├── src/               ← source (maintainers only; excluded from the host build)
├── package.json       ← build-only deps (NOT a pnpm workspace member)
└── tsup.config.ts
```

## Integrate into the host app — 4 edits

1. **Copy** this `erd/` folder into `apps/web/`.
2. **Add a route** — `apps/web/app/model/page.tsx`:
   ```tsx
   import { dct } from "../lib/client";
   import { ErdExplorer } from "../../erd";
   export const dynamic = "force-dynamic";
   export default async function ModelPage() {
     const { models } = await dct.models({ kind: "bdm" });
     return <div className="mt-6"><ErdExplorer models={models} /></div>;
   }
   ```
3. **Add a nav link** in `apps/web/app/layout.tsx`:
   `<Link href="/model" className="hover:text-ink">Data model</Link>`
4. **Exclude the source** from the host tsconfig so it never needs the graph deps:
   ```jsonc
   // apps/web/tsconfig.json
   "exclude": ["node_modules", "erd/src", "erd/node_modules", "erd/tsup.config.ts"]
   ```

That's it — no `package.json`, `next.config`, or `pnpm-workspace.yaml` changes. The
host's `pnpm install` ignores `erd/` entirely (it is not a workspace member).

Run / verify:
```
DCT_API_URL=http://localhost:4400 pnpm --filter @dct/web dev   # http://localhost:4500/model
pnpm --filter @dct/web build
```

## Features (P1)

- Entity nodes: click to expand → fields with **PK** (brass) / **FK→target** (teal,
  click to traverse) pills + classification dot + PII/MNPI tags. Themed via DCT tokens.
- Edges drawn from FK→referenced PK, with crow's-foot cardinality (`∗` many → `1` one)
  and dashed/tinted by classification (restricted = dashed red).
- Semantic layered layout (left→right = FK/dependency depth, clustered by domain).
- Zoom / pan / minimap / fullscreen, focus picker (explore/ego mode, dims non-neighbours).
- **"View as" role masking** (public → compliance): fields above clearance are struck
  through — the public/private view, in DCT's tier + PII/MNPI model.

Not yet (planned): PNG/SVG export (needs a client-only image lib), domain swimlane
backgrounds, deep-link `?focus=`.

## Rebuild (maintainers, on an internet-connected machine)

```
cd apps/web/erd
npm install          # installs build-only deps (React Flow, etc.)
npm run typecheck
npm test             # pure toGraph unit tests
npm run build        # inlines CSS + bundles -> dist/  (commit the result)
```

To re-style, edit `src/theme.ts` (all colors reference DCT CSS tokens) and rebuild.
To pin entities to specific lanes, pass a `pin` map to `layout()` in `ErdExplorer`.
