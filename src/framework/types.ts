// Contract model — the typed shape of the governed metadata spec.
// These types mirror the YAML in /contracts and are the in-memory source of
// truth every generator reads from.

export type Classification = "public" | "internal" | "confidential" | "restricted";

export type EntityGroup = "reference" | "transaction" | "position";

export interface ForeignKey {
  entity: string;
  field: string;
}

export interface Field {
  name: string;
  type: string; // logical type, e.g. "string", "int", "decimal(18,2)", "date"
  classification: Classification;
  description?: string;
  pk?: boolean;
  fk?: ForeignKey;
  facet?: boolean; // exposed as a filterable facet / dimension
  // Orthogonal handling tags layered on top of the sensitivity tier.
  pii?: boolean; // personally identifiable information
  mnpi?: boolean; // material non-public information
}

export interface Metric {
  name: string;
  agg: "sum" | "count" | "avg" | "min" | "max";
  field: string;
  description?: string;
}

export type ModelKind = "bdm" | "pdm" | "semantic";
export type ModelStatus = "draft" | "active" | "deprecated";

/** A Business Data Model — the versioned business entity, sourced upstream. */
export interface Entity {
  entity: string;
  label: string;
  group: EntityGroup;
  grain: string;
  owner: string;
  source: string; // id of the source that feeds it
  fields: Field[];
  metrics?: Metric[];
  dimensions?: string[];
  // Model control
  version: string; // semver, governed independently
  status?: ModelStatus;
  upstream?: string; // originating upstream system (product/ref data)
}

/** A Physical Data Model — physical binding for a BDM, versioned independently. */
export interface Pdm {
  pdm: string; // id
  bdm: string; // referenced BDM entity id
  version: string;
  status?: ModelStatus;
  owner?: string;
  source: string; // upstream feed id
  physical: {
    table: string;
    loadStrategy: "full" | "incremental";
    partitionBy?: string;
    uniqueKey: string;
  };
}

export interface SemanticDimRef {
  entity: string;
  field: string;
}
export interface SemanticMeasureRef {
  entity: string;
  metric: string;
}

/** A Semantic (consumption) Model — versioned, composed over BDMs/PDMs. */
export interface SemanticModel {
  semanticModel: string; // id
  version: string;
  status?: ModelStatus;
  description?: string;
  owner?: string;
  sources: string[]; // entity ids consumed
  dimensions: SemanticDimRef[];
  measures: SemanticMeasureRef[];
}

/** A registry record for any model class. */
export interface RegistryEntry {
  id: string;
  kind: ModelKind;
  version: string;
  status: ModelStatus;
  dependsOn: string[];
  signature: string; // content signature (structural hash)
}

export interface Source {
  source: string;
  kind: string; // csv, jdbc, api, ...
  label: string;
  description?: string;
  cadenceDays: number | null;
  classification: Classification;
  produces: string[]; // entity ids
  inputs?: Record<string, string>; // entity id -> local input path (illustrative)
}

export interface Spec {
  version: string;
  name: string;
  description: string;
  classifications: Classification[];
  mostOpenTier: Classification;
}

/** A role / clearance in the access-control model. */
export interface Role {
  role: string;
  label: string;
  description?: string;
  maxTier: Classification; // highest sensitivity tier this role may see
  pii: boolean; // may see PII attributes
  mnpi: boolean; // may see MNPI attributes
}

export interface AccessModel {
  roles: Role[];
  defaultRole: string;
}

/** The fully-loaded contract set every generator and check consumes. */
export interface Contract {
  spec: Spec;
  entities: Entity[]; // BDMs
  pdms: Pdm[];
  semanticModels: SemanticModel[];
  sources: Source[];
  access: AccessModel;
}

export const LAYERS = ["bronze", "silver", "gold"] as const;
export type Layer = (typeof LAYERS)[number];
