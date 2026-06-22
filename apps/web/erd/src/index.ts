// Bundled module entry. Everything below is inlined into dist/erd.js (React Flow,
// dagre, html-to-image), with react/react-dom left external (provided by the host).
export { ErdExplorer, type ErdExplorerProps } from "./ErdExplorer";
export { toGraph, egoNetwork } from "./data/toGraph";
export { ROLE_VIEWS, fieldVisible, type RoleView } from "./data/access";
export type {
  SourceModel, SourceField, GraphModel, EntityData, EdgeSpec, FieldView, Tier,
} from "./data/types";
