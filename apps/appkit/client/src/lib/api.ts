// Typed API client for the DCT AppKit server.
// Injects dev-auth persona headers (x-dct-user / x-dct-roles) into every request.

export type AssetKind =
  | "bdm"
  | "pdm"
  | "semantic"
  | "mapping"
  | "dq"
  | "dqrule"
  | "extract"
  | "transformation"
  | "refmap"
  | "domain"
  | "product";

/** Asset kinds offered in the create/browse UIs (governed assets). */
export const ASSET_KINDS: AssetKind[] = [
  "bdm",
  "pdm",
  "semantic",
  "mapping",
  "dq",
  "dqrule",
  "extract",
  "transformation",
  "refmap",
];

/** All governed kinds incl. the org grouping kinds (registry / detail routing). */
export const ALL_KINDS: AssetKind[] = [...ASSET_KINDS, "domain", "product"];

export interface MetaProduct {
  product: string;
  version: string;
  domain: string;
}

export interface Meta {
  app: string;
  mode: "local" | "databricks";
  store: "memory" | "postgres";
  spec: { name: string; version: string };
  counts: Record<AssetKind, number>;
  products: MetaProduct[];
  principal: { sub: string; roles: string[] };
}

export interface AssetSummary {
  kind: AssetKind;
  id: string;
  version?: string;
  status?: string;
  owner?: string;
  label?: string;
}

/** Full spec payload — arbitrary YAML-derived JSON. */
export type AssetSpec = Record<string, unknown>;

export interface Issue {
  level: "error" | "warn";
  code: string;
  message: string;
}

export type EditAction = "upsert" | "delete";

export interface ChangesetEdit {
  kind: AssetKind;
  id: string;
  spec: AssetSpec;
  action?: EditAction;
}

export type ChangesetStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "merged"
  | "withdrawn";

export type ChangesetTier = 1 | 2;

export interface Changeset {
  id: string;
  title: string;
  status: ChangesetStatus;
  author: string;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
  edits: ChangesetEdit[];
  issues: Issue[];
  tier: ChangesetTier;
  tierReasons: string[];
  domains: string[];
  /** auto-semver: server-computed version increments, one note per edit */
  versionNotes: string[];
}

// ---------------------------------------------------------------------------
// Data products (independent versioning) + merge side-effects
// ---------------------------------------------------------------------------

export interface ProductMember {
  kind: AssetKind;
  id: string;
}

export interface Product {
  product: string;
  label?: string;
  domain: string;
  owner?: string;
  version: string;
  status?: string;
  description?: string;
  includes: ProductMember[];
  memberCount: number;
}

export interface ProductIncrement {
  product: string;
  from: string;
  to: string;
  level: string;
}

export type WritebackMode = "off" | "fs" | "git";

export interface WritebackResult {
  mode: WritebackMode;
  files: string[];
  commit?: string;
}

/** Merge response: the merged changeset plus product/writeback/run side-effects. */
export type MergeResult = Changeset & {
  productIncrements: ProductIncrement[];
  writeback: WritebackResult;
  /** id of the auto-triggered product-increment run, when one fired */
  run?: string;
};

// ---------------------------------------------------------------------------
// Live validation (in-editor rules enforcer)
// ---------------------------------------------------------------------------

export type VersionLevel =
  | "initial"
  | "delete"
  | "none"
  | "patch"
  | "minor"
  | "major";

export interface VersionPlanEntry {
  kind: AssetKind;
  id: string;
  /** absent for new assets */
  current?: string;
  next: string;
  level: VersionLevel;
  note: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: Issue[];
  tier: ChangesetTier;
  tierReasons: string[];
  domains: string[];
  versionPlan: VersionPlanEntry[];
}

// ---------------------------------------------------------------------------
// Data-quality rules library (asset kind `dqrule`) + applications + run results
// ---------------------------------------------------------------------------

export type DqScope = "column" | "table";
export type DqSeverity = "error" | "warn";

export interface DqParamDecl {
  name: string;
  type: "number" | "string" | "list";
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface DqUsage {
  ruleSet: string;
  target: string;
  field?: string;
}

export interface DqLibraryRule {
  rule: string;
  label?: string;
  scope: DqScope;
  check: string;
  severity: DqSeverity;
  version: string;
  status?: string;
  owner?: string;
  description?: string;
  params?: DqParamDecl[];
  expression?: string;
  usage: DqUsage[];
}

export interface DqResolvedRule {
  id: string;
  label: string;
  scope: DqScope;
  check: string;
  field?: string;
  ref?: string;
  params: Record<string, unknown>;
  severity: DqSeverity;
  source: "library" | "inline";
}

export interface DqApplication {
  ruleSet: string;
  target: string;
  /** null when the `use:` binding references an unknown library rule */
  resolved: DqResolvedRule | null;
}

export interface DqLibrary {
  library: DqLibraryRule[];
  applications: DqApplication[];
}

/** Per-rule execution result carried on a run's LayerStats (gold layer). */
export interface DqResult {
  rule: string;
  label: string;
  scope: DqScope;
  field?: string;
  severity: DqSeverity;
  status: "pass" | "fail" | "skipped";
  violations: number;
  detail?: string;
}

export interface LayerStats {
  entity: string;
  bronze: number;
  silver: number;
  gold: number;
  droppedNoPk: number;
  droppedDup: number;
  /** applied DQ rule results, executed at gold */
  dq?: DqResult[];
}

export type RunTrigger = "manual" | "product-increment";

export interface Run {
  id: string;
  pipeline: string;
  status: "succeeded" | "failed";
  triggeredBy: string;
  startedAt: string;
  durationMs: number;
  stats: LayerStats[];
  gates: { contract: Issue[]; propagation: Issue[] };
  /** what caused the run: a human, or a product version increment on merge */
  trigger: RunTrigger;
  /** product versions this run executed for (product-increment runs) */
  products: { product: string; version: string }[];
}

export interface MigrationColumn {
  name: string;
  pgType: string;
  classification: string;
  nullable: boolean;
}

export interface MigrationTable {
  entity: string;
  table: string;
  layer: string;
  columns: MigrationColumn[];
}

export interface Migration {
  generated: boolean;
  manifest: {
    generated_from: string;
    target: string;
    schema: string;
    tables: MigrationTable[];
  } | null;
  schemaSqlPath: string;
}

// ---------------------------------------------------------------------------
// Governed mapping documents (bronze→silver `mapping`, silver→gold `transformation`)
// ---------------------------------------------------------------------------

export interface MappingRule {
  target: string;
  sources?: string[];
  logic?: string;
  description?: string;
}

export interface MappingCoverage {
  targetFields: number;
  mapped: number;
  unmapped: string[];
}

export interface MappingDoc {
  mapping: string;
  from: { kind: string; id: string };
  to: { kind: string; id: string };
  version: string;
  status?: string;
  owner?: string;
  rules: MappingRule[];
  coverage?: MappingCoverage;
}

export interface TransformationSourceRef {
  alias: string;
  entity: string;
  join?: string;
}

export interface TransformationUnionBranch {
  branch: string;
  filter?: string;
  columns?: Record<string, string>;
}

export interface TransformationSubquery {
  alias: string;
  sql: string;
}

export interface TransformationAssembly {
  union?: TransformationUnionBranch[];
  subqueries?: TransformationSubquery[];
}

export interface TransformationKeyResolution {
  when: string;
  dim: string;
  dimId: string;
}

export interface TransformationField {
  target: string;
  from?: string;
  logic?: string;
  lookupDim?: string;
  refmap?: string;
  join?: string;
  /** bronze lineage tail — raw-layer column this gold field ultimately descends from */
  bronze?: string;
  complexity?: string;
  description?: string;
}

export type TransformationComplexity = "simple" | "medium" | "complex";

export interface TransformationDoc {
  transformation: string;
  layer: "silver_to_gold";
  complexity?: TransformationComplexity;
  target: { kind: string; id: string };
  version: string;
  status?: string;
  owner?: string;
  sources: TransformationSourceRef[];
  assembly?: TransformationAssembly;
  keyResolution?: TransformationKeyResolution[];
  uses?: string[];
  fields: TransformationField[];
  fieldCount: number;
  sourceEntities: string[];
  refmaps: string[];
}

export interface MappingDocuments {
  bronzeToSilver: MappingDoc[];
  silverToGold: TransformationDoc[];
}

// ---------------------------------------------------------------------------
// Access management
// ---------------------------------------------------------------------------

export interface Clearance {
  maxTier: string;
  pii: boolean;
  mnpi: boolean;
}

export interface AccessRole {
  role: string;
  capabilities: string[];
  clearance: Clearance;
}

export interface AccessUser {
  sub: string;
  label: string;
  roles: string[];
  domains: string[];
  capabilities: string[];
  clearance: Clearance;
}

export interface DataAccessRole {
  role: string;
  label: string;
  description: string;
  maxTier: string;
  pii: boolean;
  mnpi: boolean;
}

export interface DataAccessModel {
  defaultRole: string;
  roles: DataAccessRole[];
}

export interface ApprovalTierPolicy {
  label: string;
  requires: string;
  routing: string;
}

export interface ApprovalPolicy {
  tier1: ApprovalTierPolicy;
  tier2: ApprovalTierPolicy;
  merge: { requires: string };
  segregationOfDuties: string;
}

export interface AccessInfo {
  roles: AccessRole[];
  capabilities: string[];
  users: AccessUser[];
  dataAccessModel: DataAccessModel;
  approvalPolicy: ApprovalPolicy;
}

export interface AccessCheckResult {
  allowed: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Personas (dev-auth)
// ---------------------------------------------------------------------------

export interface Persona {
  key: string;
  label: string;
  sub: string;
  roles: string[];
  domains: string[];
}

export const PERSONAS: Persona[] = [
  { key: "viewer", label: "Viewer (read-only)", sub: "viewer", roles: ["viewer"], domains: ["*"] },
  { key: "alice", label: "Alice — Modeler", sub: "alice", roles: ["modeler"], domains: ["*"] },
  { key: "bob", label: "Bob — Steward (reference)", sub: "bob", roles: ["steward"], domains: ["reference"] },
  { key: "frank", label: "Frank — Steward (trading)", sub: "frank", roles: ["steward"], domains: ["trading"] },
  { key: "carol", label: "Carol — Domain Owner", sub: "carol", roles: ["domain_owner"], domains: ["reference", "trading"] },
  { key: "dana", label: "Dana — Chief Data Architect", sub: "dana", roles: ["chief_data_architect"], domains: ["*"] },
  { key: "pat", label: "Pat — Platform Engineer", sub: "pat", roles: ["platform_engineer"], domains: ["*"] },
];

const PERSONA_STORAGE_KEY = "dct.persona";

export function getPersonaKey(): string {
  const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
  if (stored && PERSONAS.some((p) => p.key === stored)) return stored;
  return PERSONAS[0].key;
}

export function setPersonaKey(key: string): void {
  localStorage.setItem(PERSONA_STORAGE_KEY, key);
}

export function getPersona(): Persona {
  const key = getPersonaKey();
  return PERSONAS.find((p) => p.key === key) ?? PERSONAS[0];
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const persona = getPersona();
  const headers: Record<string, string> = {
    "x-dct-user": persona.sub,
    "x-dct-roles": persona.roles.join(","),
    "x-dct-domains": persona.domains.join(","),
  };
  if (init?.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    if (
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      message = (data as { error: string }).error;
    }
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function getMeta(): Promise<Meta> {
  return request<Meta>("/api/meta");
}

export function listAssets(kind?: string, q?: string): Promise<AssetSummary[]> {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (q) params.set("q", q);
  const qs = params.toString();
  return request<AssetSummary[]>(`/api/assets${qs ? `?${qs}` : ""}`);
}

export function getAsset(kind: string, id: string): Promise<AssetSpec> {
  return request<AssetSpec>(
    `/api/assets/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
  );
}

export function listChangesets(): Promise<Changeset[]> {
  return request<Changeset[]>("/api/changesets");
}

export function createChangeset(body: {
  title: string;
  edits: ChangesetEdit[];
}): Promise<Changeset> {
  return request<Changeset>("/api/changesets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ChangesetAction = "approve" | "reject" | "merge";

export function decideChangeset(id: string, action: ChangesetAction): Promise<Changeset> {
  return request<Changeset>(
    `/api/changesets/${encodeURIComponent(id)}/${action}`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/** Merge with the full side-effect payload (product increments, write-back, auto-run). */
export function mergeChangeset(id: string): Promise<MergeResult> {
  return request<MergeResult>(
    `/api/changesets/${encodeURIComponent(id)}/merge`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function getProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products");
}

/** Models in the vendored ERD explorer's SourceModel shape. */
export function getErdModels(): Promise<{ models: import("../vendor/erd/erd").SourceModel[] }> {
  return request<{ models: import("../vendor/erd/erd").SourceModel[] }>("/api/erd");
}

// --- domains / registry / catalog (the org overlay) ------------------------

export interface RegistryRow {
  kind: string;
  id: string;
  label?: string;
  version?: string;
  status: string;
  owner?: string;
  domain: string;
  product?: string;
  dependsOn: string[];
}
export interface RegistryResponse {
  rows: RegistryRow[];
  domains: string[];
}
export function getRegistry(): Promise<RegistryResponse> {
  return request<RegistryResponse>("/api/registry");
}

export interface DomainProduct {
  product: string;
  label?: string;
  version: string;
  memberCount: number;
}
export interface DomainOverview {
  domain: string;
  label?: string;
  description?: string;
  owner?: string;
  version: string;
  status?: string;
  productCount: number;
  assetCount: number;
  products: DomainProduct[];
}
export function getDomains(): Promise<DomainOverview[]> {
  return request<DomainOverview[]>("/api/domains");
}

export type FlowStage = "bronze" | "silver" | "gold";
export interface FlowNode {
  id: string;
  kind: string;
  label: string;
  domain: string;
}
export interface Catalog {
  totals: { domains: number; products: number; assets: number; byKind: Record<string, number> };
  domains: DomainOverview[];
  flow: Record<FlowStage, FlowNode[]>;
}
export function getCatalog(): Promise<Catalog> {
  return request<Catalog>("/api/catalog");
}

/** Live validation — runs the proposal-time gates without persisting anything. */
export function validateEdits(edits: ChangesetEdit[]): Promise<ValidationResult> {
  return request<ValidationResult>("/api/validate", {
    method: "POST",
    body: JSON.stringify({ edits }),
  });
}

export function withdrawChangeset(id: string): Promise<Changeset> {
  return request<Changeset>(
    `/api/changesets/${encodeURIComponent(id)}/withdraw`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function getAccess(): Promise<AccessInfo> {
  return request<AccessInfo>("/api/access");
}

export function checkAccess(
  sub: string,
  capability: string,
  domain?: string,
): Promise<AccessCheckResult> {
  const params = new URLSearchParams({ sub, capability });
  if (domain) params.set("domain", domain);
  return request<AccessCheckResult>(`/api/access/check?${params.toString()}`);
}

export function listRuns(): Promise<Run[]> {
  return request<Run[]>("/api/runs");
}

export function triggerRun(): Promise<Run> {
  return request<Run>("/api/runs", { method: "POST", body: JSON.stringify({}) });
}

export function getMigration(): Promise<Migration> {
  return request<Migration>("/api/migration");
}

export function getDqLibrary(): Promise<DqLibrary> {
  return request<DqLibrary>("/api/dq");
}

export function getMappingDocuments(): Promise<MappingDocuments> {
  return request<MappingDocuments>("/api/mappings");
}
