// @dct/sdk — typed client for the DEAL Control Tower read/publication API.
// Self-contained (no workspace types) so external consumers can use it directly.

export type ModelKind = "bdm" | "pdm" | "semantic" | "source";

export interface SdkField {
  name: string;
  type: string;
  classification: string;
  pii: boolean;
  mnpi: boolean;
  isPk: boolean;
  fkRef: string | null;
}

export interface SdkModel {
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
  fields: SdkField[];
  detail: Record<string, unknown>;
  spec: Record<string, unknown>;
}

export interface SdkDomain {
  id: string;
  name: string;
  modelCount: number;
}

export interface SdkRole {
  role: string;
  label: string;
  description?: string;
  maxTier: string;
  pii: boolean;
  mnpi: boolean;
}

export interface SdkAccess {
  defaultRole: string;
  tiers: string[];
  roles: SdkRole[];
}

export interface ModelQuery {
  kind?: ModelKind;
  domain?: string;
  status?: string;
  q?: string;
}

export interface DctClientOptions {
  baseUrl: string;
  token?: string; // OIDC bearer or API key (Phase 3+)
  fetchImpl?: typeof fetch;
}

export class DctClient {
  private baseUrl: string;
  private token?: string;
  private f: typeof fetch;

  constructor(opts: DctClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.f = opts.fetchImpl ?? fetch;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.f(`${this.baseUrl}${path}`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
      cache: "no-store" as RequestCache,
    });
    if (!res.ok) throw new Error(`DCT ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  domains() {
    return this.get<{ domains: SdkDomain[] }>("/api/v1/domains").then((r) => r.domains);
  }

  models(query: ModelQuery = {}) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null) as [string, string][],
    ).toString();
    return this.get<{ count: number; models: SdkModel[] }>(
      `/api/v1/models${qs ? `?${qs}` : ""}`,
    );
  }

  model(kind: ModelKind, id: string) {
    return this.get<SdkModel>(`/api/v1/models/${kind}/${id}`);
  }

  registry() {
    return this.get<{ counts: Record<string, number>; count: number; models: SdkModel[] }>(
      "/api/v1/registry",
    );
  }

  search(q: string) {
    return this.get<{ q: string; results: SdkModel[] }>(
      `/api/v1/search?q=${encodeURIComponent(q)}`,
    );
  }

  access() {
    return this.get<SdkAccess>("/api/v1/access");
  }

  schema(kind: ModelKind, id: string) {
    return this.get<Record<string, unknown>>(`/api/v1/models/${kind}/${id}/schema.json`);
  }

  pipelines() {
    return this.get<{ pipelines: SdkPipeline[] }>("/api/v1/pipelines").then((r) => r.pipelines);
  }

  pipelineRuns(id: string) {
    return this.get<{ runs: SdkPipelineRun[] }>(`/api/v1/pipelines/${id}/runs`).then((r) => r.runs);
  }

  lineage() {
    return this.get<SdkLineageGraph>("/api/v1/lineage");
  }
  lineageNode(urn: string, direction: "upstream" | "downstream" = "upstream") {
    return this.get<{ root: string; direction: string; nodes: string[]; edges: SdkLineageEdge[] }>(
      `/api/v1/lineage/node?urn=${encodeURIComponent(urn)}&direction=${direction}`,
    );
  }
  ucPlan(env = "dev") {
    return this.get<SdkUcPlan>(`/api/v1/uc/plan?env=${env}`);
  }
}

export interface SdkLineageEdge {
  from: string;
  to: string;
  observed?: boolean;
}
export interface SdkLineageGraph {
  nodes: string[];
  edges: SdkLineageEdge[];
}
export interface SdkUcPlan {
  env: string;
  catalog: string;
  tables: { catalog: string; schema: string; name: string; columns: unknown[] }[];
  operations: { kind: string; statement: string }[];
}

export interface SdkPipeline {
  id: string;
  domain: string;
  engine: string;
  cadenceDays: number | null;
  produces: string[];
}

export interface SdkPipelineRun {
  id: string;
  pipelineId: string;
  env: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  metrics: { rowsIn?: number; rowsOut?: number; durationMs?: number };
  lineageEvents: number;
  triggeredBy: string;
}
