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
  bk?: boolean; // natural / business key (distinct from the surrogate pk)
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

export type ModelKind =
  | "bdm" | "pdm" | "semantic" | "mapping" | "dq" | "extract" | "transformation" | "refmap";
export type Complexity = "simple" | "medium" | "complex";
export type ModelStatus = "draft" | "active" | "deprecated";

export interface AssetRef {
  kind: string; // bdm | pdm | semantic | source | extract …
  id: string;
}

/** A field-level source→target transformation between two assets. */
export interface MappingRule {
  target: string;
  sources?: string[];
  logic?: string; // expression or transform type: IDENTITY, DERIVE, LOOKUP, SCD2_START…
  description?: string;
}
export interface Mapping {
  mapping: string; // id
  from: AssetRef;
  to: AssetRef;
  version: string;
  status?: ModelStatus;
  owner?: string;
  rules: MappingRule[];
}

export type DqRuleType =
  | "not_null" | "unique" | "referential" | "range" | "regex" | "accepted_values" | "freshness";
export interface DqRule {
  field?: string;
  entity?: string;
  type: DqRuleType;
  ref?: string; // for referential (e.g. "currency.currency_code")
  params?: Record<string, unknown>;
  severity: "error" | "warn";
  description?: string;
}
export interface DqRuleSet {
  dqRuleSet: string; // id
  target: AssetRef;
  version: string;
  status?: ModelStatus;
  owner?: string;
  rules: DqRule[];
}

/** A published downstream extract/view contract for a consumer. */
export interface ExtractColumn {
  name: string;
  from: string; // "asset.field"
  classification?: Classification;
  description?: string;
}
export interface Extract {
  extract: string; // id
  consumer: string;
  version: string;
  status?: ModelStatus;
  owner?: string;
  from: AssetRef[];
  columns: ExtractColumn[];
  grain?: string;
  filters?: string;
  delivery?: { format?: string; cadence?: string; destination?: string };
}

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

// ---- Silver→Gold transformations (graded) + reusable reference maps ----

export interface TransformationSource {
  alias: string;
  entity: string; // silver BDM id
  join?: string; // bespoke join clause text
}
export type TransformFieldLogic =
  | "DIRECT" | "LITERAL" | "AUTO_SURROGATE" | "SCD2_START" | "SCD2_END"
  | "DIM_LOOKUP" | "REFMAP_LOOKUP" | "KEY_RESOLUTION" | string; // or a free expression
export interface TransformationField {
  target: string; // gold field / DimID
  from?: string; // "silver_entity.attribute" or expression
  logic?: TransformFieldLogic;
  lookupDim?: string; // Dim/PDM id for DimID resolution
  refmap?: string; // refmap id used
  join?: string; // join / refmap key logic
  bronze?: string; // "BRONZE_TABLE.COLUMN" lineage tail
  complexity?: Complexity;
  description?: string;
}
export interface UnionBranch {
  branch: string;
  filter?: string;
  columns?: Record<string, string>;
}
export interface Subquery {
  alias: string;
  sql: string;
}
export interface KeyResolutionRule {
  when: string; // e.g. "asset_class = BOND"
  dim: string;
  dimId: string;
  alias?: string;
}
export interface Transformation {
  transformation: string; // id
  layer: "silver_to_gold";
  complexity?: Complexity;
  target: AssetRef; // GOLD (pdm)
  version: string;
  status?: ModelStatus;
  owner?: string;
  sources: TransformationSource[];
  assembly?: { union?: UnionBranch[]; subqueries?: Subquery[] };
  keyResolution?: KeyResolutionRule[];
  uses?: string[]; // referenced refmap ids
  fields: TransformationField[];
}

export interface RefMapEntry {
  from: string;
  to: string;
  description?: string;
}
export interface RefMap {
  refmap: string; // id
  version: string;
  status?: ModelStatus;
  owner?: string;
  description?: string;
  keyType?: string; // e.g. "ISO currency code → CurrencyDimID"
  source?: string;
  entries?: RefMapEntry[]; // optional enumerated entries
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
  mappings: Mapping[];
  dqRuleSets: DqRuleSet[];
  extracts: Extract[];
  transformations: Transformation[];
  refMaps: RefMap[];
  access: AccessModel;
}

export const LAYERS = ["bronze", "silver", "gold"] as const;
export type Layer = (typeof LAYERS)[number];
