// Projection record types — the read-model materialized from the Git models repo.
export type ModelKind = "bdm" | "pdm" | "semantic" | "source";

export interface DomainRecord {
  id: string;
  name: string;
  modelCount: number;
}

export interface FieldRecord {
  name: string;
  type: string;
  classification: string;
  pii: boolean;
  mnpi: boolean;
  isPk: boolean;
  fkRef: string | null;
}

export interface ModelRecord {
  kind: ModelKind;
  id: string;
  domain: string;
  version: string;
  status: string;
  owner: string | null;
  description: string | null;
  upstream: string | null;
  signature: string;
  tags: string[];
  dependsOn: string[];
  /** flattened fields (BDMs); empty for others */
  fields: FieldRecord[];
  /** kind-specific detail (physical binding, semantic dims/measures, etc.) */
  detail: Record<string, unknown>;
  /** full parsed spec */
  spec: Record<string, unknown>;
}

export interface ProjectionSnapshot {
  sourceSha: string;
  domains: DomainRecord[];
  models: ModelRecord[];
}

export interface ModelFilter {
  kind?: ModelKind;
  domain?: string;
  status?: string;
  q?: string;
}

export interface ProjectionMeta {
  sourceSha?: string;
  reconciledAt?: string;
  modelCount: number;
}
