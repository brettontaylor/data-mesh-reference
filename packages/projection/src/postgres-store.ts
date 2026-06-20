import pg from "pg";
import type { Store } from "./store";
import type {
  AccessPolicyRecord,
  DomainRecord,
  ModelFilter,
  ModelRecord,
  ProjectionMeta,
  ProjectionSnapshot,
} from "./types";

// Idempotent DDL so the store self-bootstraps (minimal intervention). The
// canonical migration also lives in db/migrations/0001_init.sql.
const DDL = `
CREATE TABLE IF NOT EXISTS domain (
  id text PRIMARY KEY, name text NOT NULL, model_count int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS model (
  kind text NOT NULL, id text NOT NULL, domain text NOT NULL,
  version text NOT NULL, status text NOT NULL, owner text, description text,
  upstream text, signature text NOT NULL, tags text[] NOT NULL DEFAULT '{}',
  depends_on text[] NOT NULL DEFAULT '{}', fields jsonb NOT NULL DEFAULT '[]',
  detail jsonb NOT NULL DEFAULT '{}', spec jsonb NOT NULL,
  source_sha text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS model_domain_idx ON model (domain);
CREATE INDEX IF NOT EXISTS model_fts_idx ON model
  USING gin (to_tsvector('english', id || ' ' || coalesce(description,'')));
CREATE TABLE IF NOT EXISTS projection_meta (
  id int PRIMARY KEY DEFAULT 1, source_sha text, reconciled_at timestamptz,
  policy jsonb NOT NULL DEFAULT '{"defaultRole":"","tiers":[],"roles":[]}',
  CONSTRAINT single_row CHECK (id = 1)
);
`;

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(DDL);
  }

  async applySnapshot(s: ProjectionSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE model, domain");
      for (const d of s.domains) {
        await client.query(
          "INSERT INTO domain (id, name, model_count) VALUES ($1,$2,$3)",
          [d.id, d.name, d.modelCount],
        );
      }
      for (const m of s.models) {
        await client.query(
          `INSERT INTO model
             (kind,id,domain,version,status,owner,description,upstream,signature,
              tags,depends_on,fields,detail,spec,source_sha)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            m.kind, m.id, m.domain, m.version, m.status, m.owner, m.description,
            m.upstream, m.signature, m.tags, m.dependsOn,
            JSON.stringify(m.fields), JSON.stringify(m.detail),
            JSON.stringify(m.spec), s.sourceSha,
          ],
        );
      }
      await client.query(
        `INSERT INTO projection_meta (id, source_sha, reconciled_at, policy)
         VALUES (1,$1,now(),$2)
         ON CONFLICT (id) DO UPDATE SET source_sha=$1, reconciled_at=now(), policy=$2`,
        [s.sourceSha, JSON.stringify(s.access)],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private rowToModel(r: pg.QueryResultRow): ModelRecord {
    return {
      kind: r.kind, id: r.id, domain: r.domain, version: r.version,
      status: r.status, owner: r.owner, description: r.description,
      upstream: r.upstream, signature: r.signature, tags: r.tags,
      dependsOn: r.depends_on, fields: r.fields, detail: r.detail, spec: r.spec,
    };
  }

  async listDomains(): Promise<DomainRecord[]> {
    const { rows } = await this.pool.query("SELECT * FROM domain ORDER BY id");
    return rows.map((r) => ({ id: r.id, name: r.name, modelCount: r.model_count }));
  }

  async listModels(f?: ModelFilter): Promise<ModelRecord[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (f?.kind) { args.push(f.kind); where.push(`kind = $${args.length}`); }
    if (f?.domain) { args.push(f.domain); where.push(`domain = $${args.length}`); }
    if (f?.status) { args.push(f.status); where.push(`status = $${args.length}`); }
    if (f?.q) { args.push(`%${f.q}%`); where.push(`(id ILIKE $${args.length} OR description ILIKE $${args.length})`); }
    const sql = `SELECT * FROM model ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY kind, id`;
    const { rows } = await this.pool.query(sql, args);
    return rows.map((r) => this.rowToModel(r));
  }

  async getModel(kind: string, id: string): Promise<ModelRecord | undefined> {
    const { rows } = await this.pool.query("SELECT * FROM model WHERE kind=$1 AND id=$2", [kind, id]);
    return rows[0] ? this.rowToModel(rows[0]) : undefined;
  }

  async search(q: string): Promise<ModelRecord[]> {
    return this.listModels({ q });
  }

  async getAccess(): Promise<AccessPolicyRecord> {
    const { rows } = await this.pool.query("SELECT policy FROM projection_meta WHERE id=1");
    return rows[0]?.policy ?? { defaultRole: "", tiers: [], roles: [] };
  }

  async meta(): Promise<ProjectionMeta> {
    const { rows } = await this.pool.query("SELECT * FROM projection_meta WHERE id=1");
    const { rows: c } = await this.pool.query("SELECT count(*)::int AS n FROM model");
    return {
      sourceSha: rows[0]?.source_sha,
      reconciledAt: rows[0]?.reconciled_at?.toISOString?.() ?? rows[0]?.reconciled_at,
      modelCount: c[0]?.n ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
