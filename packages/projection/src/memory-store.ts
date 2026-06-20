import type { Store } from "./store";
import { matchesFilter } from "./store";
import type {
  AccessPolicyRecord,
  DomainRecord,
  ModelFilter,
  ModelRecord,
  ProjectionMeta,
  ProjectionSnapshot,
} from "./types";

const EMPTY_ACCESS: AccessPolicyRecord = { defaultRole: "", tiers: [], roles: [] };

/** In-memory projection store — the default. Rebuilt from Git on every reconcile. */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private models = new Map<string, ModelRecord>();
  private domains: DomainRecord[] = [];
  private access: AccessPolicyRecord = EMPTY_ACCESS;
  private sourceSha?: string;
  private reconciledAt?: string;

  private key(kind: string, id: string) {
    return `${kind}:${id}`;
  }

  async init(): Promise<void> {}

  async applySnapshot(s: ProjectionSnapshot): Promise<void> {
    this.models = new Map(s.models.map((m) => [this.key(m.kind, m.id), m]));
    this.domains = s.domains;
    this.access = s.access;
    this.sourceSha = s.sourceSha;
    this.reconciledAt = new Date().toISOString();
  }

  async getAccess(): Promise<AccessPolicyRecord> {
    return this.access;
  }

  async listDomains(): Promise<DomainRecord[]> {
    return [...this.domains].sort((a, b) => a.id.localeCompare(b.id));
  }

  async listModels(filter?: ModelFilter): Promise<ModelRecord[]> {
    return [...this.models.values()]
      .filter((m) => matchesFilter(m, filter))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }

  async getModel(kind: string, id: string): Promise<ModelRecord | undefined> {
    return this.models.get(this.key(kind, id));
  }

  async search(q: string): Promise<ModelRecord[]> {
    return this.listModels({ q });
  }

  async meta(): Promise<ProjectionMeta> {
    return {
      sourceSha: this.sourceSha,
      reconciledAt: this.reconciledAt,
      modelCount: this.models.size,
    };
  }

  async close(): Promise<void> {}
}
