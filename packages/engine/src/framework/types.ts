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
  | "not_null" | "unique" | "referential" | "range" | "regex" | "accepted_values"
  | "freshness" | "row_count_min";

/** Parameter declaration on a library rule (see DqRuleDef). */
export interface DqParamDecl {
  name: string;
  type: "number" | "string" | "list";
  required?: boolean;
  default?: unknown;
  description?: string;
}

/** A GENERIC data-quality rule in the governed rules library (kind "dqrule").
 *  Defined once — parameterized, column- or table-scoped — then APPLIED by
 *  rule sets via `use:` bindings. The `check` primitive is what the runner
 *  executes; `expression` is the illustrative SQL template that warehouse
 *  generators may render. */
export interface DqRuleDef {
  rule: string; // id
  label?: string;
  scope: "column" | "table";
  check: DqRuleType; // evaluator primitive
  severity: "error" | "warn"; // default; applications may override
  version: string;
  status?: ModelStatus;
  owner?: string;
  description?: string;
  params?: DqParamDecl[];
  expression?: string; // e.g. "{{column}} BETWEEN {{min}} AND {{max}}"
}

/** One rule inside a rule set — EITHER an application of a library rule
 *  (`use:` + bindings) or a legacy inline rule (`type:` + severity). */
export interface DqRule {
  /** library application: id of a DqRuleDef */
  use?: string;
  field?: string; // column binding (required for column-scoped rules)
  entity?: string;
  /** inline rule (legacy): the primitive, when `use` is absent */
  type?: DqRuleType;
  ref?: string; // for referential (e.g. "currency.currency_code")
  params?: Record<string, unknown>; // merged over the library declarations
  severity?: "error" | "warn"; // defaults to the library rule's severity
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

/** A fully resolved rule application (library defaults + overrides merged). */
export interface ResolvedDqRule {
  id: string; // library rule id, or "inline:<type>"
  label: string;
  scope: "column" | "table";
  check: DqRuleType;
  field?: string;
  ref?: string;
  params: Record<string, unknown>;
  severity: "error" | "warn";
  source: "library" | "inline";
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
/** A domain — the top-level governed grouping. Domains own products, which in
 *  turn own the BDMs/PDMs/mappings/models that realize them. Domains also carry
 *  the access boundary (approval routing is per-domain). Independently
 *  versioned and maker/checker'd like every governed asset. */
export interface Domain {
  domain: string; // id (matches the derived domain string on assets)
  label?: string;
  description?: string;
  owner?: string;
  version: string;
  status?: ModelStatus;
}

/** A data product — a governed, independently versioned bundle of assets
 *  owned by a domain. Product versions move on their OWN semver line: any
 *  merged change to a member asset increments the product (minor for tier-1
 *  changes, major for tier-2/breaking) and triggers a full product re-run. */
export interface Product {
  product: string; // id
  label?: string;
  domain: string; // owning domain (routing)
  owner?: string;
  version: string; // semver, independent of member BDM/PDM versions
  status?: ModelStatus;
  description?: string;
  includes: AssetRef[]; // member assets ({kind, id})
}

export interface Contract {
  spec: Spec;
  entities: Entity[]; // BDMs
  pdms: Pdm[];
  semanticModels: SemanticModel[];
  sources: Source[];
  mappings: Mapping[];
  dqRuleSets: DqRuleSet[];
  dqRules: DqRuleDef[]; // the generic DQ rules library
  extracts: Extract[];
  transformations: Transformation[];
  refMaps: RefMap[];
  domains: Domain[];
  products: Product[];
  access: AccessModel;
}

export const LAYERS = ["bronze", "silver", "gold"] as const;
export type Layer = (typeof LAYERS)[number];
