"use client";
// Host entry for the ERD module. This thin "use client" wrapper establishes the
// client boundary and re-exports the PRE-BUNDLED artifact in ./dist — which already
// contains React Flow, dagre and html-to-image inlined. The host app therefore needs
// NO additional npm dependencies (react/react-dom are provided by the host).
//
// To rebuild after editing ./src (on an internet-connected machine):
//   cd apps/web/erd && npm install && npm run build
export { ErdExplorer } from "./dist/erd.js";
export type { ErdExplorerProps, SourceModel, SourceField } from "./dist/erd.js";
