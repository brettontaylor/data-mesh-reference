import * as react from 'react';

type Tier = "public" | "internal" | "confidential" | "restricted";
/** The subset of a DCT SdkModel/SdkField the ERD needs. Structurally compatible
 *  with @dct/sdk, so the host can pass SdkModel[] directly — no coupling. */
interface SourceField {
    name: string;
    type: string;
    classification: string;
    pii: boolean;
    mnpi: boolean;
    isPk: boolean;
    fkRef: string | null;
}
interface SourceModel {
    kind: string;
    id: string;
    domain: string;
    version: string;
    status: string;
    owner?: string | null;
    dependsOn?: string[];
    fields: SourceField[];
}
interface FieldView extends SourceField {
    fkTarget: string | null;
}
interface EntityData {
    id: string;
    kind: string;
    domain: string;
    version: string;
    status: string;
    fields: FieldView[];
    tierCounts: Record<Tier, number>;
}
interface EdgeSpec {
    id: string;
    source: string;
    target: string;
    sourceField: string;
    targetField: string;
    tier: Tier;
    selfRef: boolean;
}
interface GraphModel {
    nodes: {
        id: string;
        data: EntityData;
    }[];
    edges: EdgeSpec[];
}
interface ToGraphOptions {
    kinds?: string[];
}

interface ErdExplorerProps {
    models: SourceModel[];
    /** Initial model kinds to show. Default: BDMs only. */
    kinds?: string[];
    /** CSS height of the canvas. Default 70vh. */
    height?: string;
}
declare function ErdExplorer(props: ErdExplorerProps): react.JSX.Element;

declare function toGraph(models: SourceModel[], opts?: ToGraphOptions): GraphModel;
/** 1-hop neighbourhood of an entity (for explore/ego mode). */
declare function egoNetwork(graph: GraphModel, focusId: string): Set<string>;

interface RoleView {
    id: string;
    label: string;
    maxTier: Tier;
    pii: boolean;
    mnpi: boolean;
}
declare const ROLE_VIEWS: RoleView[];
declare function fieldVisible(f: {
    classification: string;
    pii: boolean;
    mnpi: boolean;
}, role: RoleView): boolean;

export { type EdgeSpec, type EntityData, ErdExplorer, type ErdExplorerProps, type FieldView, type GraphModel, ROLE_VIEWS, type RoleView, type SourceField, type SourceModel, type Tier, egoNetwork, fieldVisible, toGraph };
