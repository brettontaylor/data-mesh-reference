import type {
  DomainRecord,
  ModelFilter,
  ModelRecord,
  ProjectionMeta,
  ProjectionSnapshot,
} from "./types";

/**
 * The projection persistence boundary. Two implementations:
 *  - MemoryStore   (default; zero-dependency; dev/CI/demo)
 *  - PostgresStore (production; durable; used when DATABASE_URL is set)
 *
 * The projection is rebuildable from Git, so applySnapshot replaces it wholesale
 * (idempotent). For very large estates this becomes chunked/diff-based (Phase 8).
 */
export interface Store {
  readonly kind: "memory" | "postgres";
  init(): Promise<void>;
  applySnapshot(snapshot: ProjectionSnapshot): Promise<void>;
  listDomains(): Promise<DomainRecord[]>;
  listModels(filter?: ModelFilter): Promise<ModelRecord[]>;
  getModel(kind: string, id: string): Promise<ModelRecord | undefined>;
  search(q: string): Promise<ModelRecord[]>;
  meta(): Promise<ProjectionMeta>;
  close(): Promise<void>;
}

export function matchesFilter(m: ModelRecord, f?: ModelFilter): boolean {
  if (!f) return true;
  if (f.kind && m.kind !== f.kind) return false;
  if (f.domain && m.domain !== f.domain) return false;
  if (f.status && m.status !== f.status) return false;
  if (f.q) {
    const hay = `${m.id} ${m.description ?? ""} ${m.tags.join(" ")}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}
