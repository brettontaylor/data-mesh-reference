// App OLTP repository — changesets (maker/checker workflow state) and
// pipeline runs. Two backends behind one interface:
//
//   SqlRepo    — Lakebase Postgres (deployed; the appkit lakebase plugin) or
//                any Postgres via DATABASE_URL (local). Schema: schema.sql.
//   MemoryRepo — zero-infra local dev / CI. Same semantics, process-lifetime.
//
// This split mirrors @dct/projection's PostgresStore/MemoryStore pattern.
// SoR discipline: governed asset *definitions* live in the contracts (git);
// only workflow state (proposals, decisions, run history) lives here.
import type { LayerStats, Issue } from "@dct/engine";

export type ChangesetStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "merged"
  | "withdrawn";

/** 1 = minor (domain approval) · 2 = impactful/breaking (CDA/ARB sign-off). */
export type ChangeTier = 1 | 2;

export interface ModelEdit {
  kind:
    | "bdm"
    | "pdm"
    | "semantic"
    | "mapping"
    | "dq"
    | "dqrule" // generic DQ rules library entry
    | "extract"
    | "transformation"
    | "refmap"
    | "domain" // top-level governed grouping
    | "product"; // governed asset bundle within a domain
  id: string;
  /** upsert (default) creates or updates; delete retires the asset. */
  action?: "upsert" | "delete";
  spec: Record<string, unknown>;
}

export interface Changeset {
  id: string;
  title: string;
  status: ChangesetStatus;
  author: string;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
  edits: ModelEdit[];
  /** governance issues found at proposal time (empty = clean) */
  issues: Issue[];
  /** two-tier framework: computed at proposal time, immutable after */
  tier: ChangeTier;
  tierReasons: string[];
  /** owning domains of the touched assets — tier-1 approval routes here */
  domains: string[];
  /** auto-semver: server-computed version increments, one note per edit */
  versionNotes: string[];
}

export interface PipelineRun {
  id: string;
  pipeline: string; // e.g. "medallion"
  status: "succeeded" | "failed";
  triggeredBy: string;
  startedAt: string;
  durationMs: number;
  stats: LayerStats[];
  gates: { contract: Issue[]; propagation: Issue[] };
  /** what caused the run: a human, or a product version increment on merge */
  trigger: "manual" | "product-increment";
  /** product versions this run executed for (product-increment runs) */
  products: { product: string; version: string }[];
}

export interface Repo {
  readonly kind: "memory" | "postgres";
  init(): Promise<void>;
  insertChangeset(c: Changeset): Promise<void>;
  listChangesets(): Promise<Changeset[]>;
  getChangeset(id: string): Promise<Changeset | undefined>;
  setChangesetStatus(
    id: string,
    status: ChangesetStatus,
    decidedBy: string,
    decidedAt: string,
  ): Promise<void>;
  insertRun(r: PipelineRun): Promise<void>;
  listRuns(): Promise<PipelineRun[]>;
}

/* ------------------------------------------------------------------ */

export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;
  private changesets = new Map<string, Changeset>();
  private runs: PipelineRun[] = [];

  async init(): Promise<void> {}

  async insertChangeset(c: Changeset): Promise<void> {
    this.changesets.set(c.id, c);
  }
  async listChangesets(): Promise<Changeset[]> {
    return [...this.changesets.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  async getChangeset(id: string): Promise<Changeset | undefined> {
    return this.changesets.get(id);
  }
  async setChangesetStatus(
    id: string,
    status: ChangesetStatus,
    decidedBy: string,
    decidedAt: string,
  ): Promise<void> {
    const c = this.changesets.get(id);
    if (c) Object.assign(c, { status, decidedBy, decidedAt });
  }
  async insertRun(r: PipelineRun): Promise<void> {
    this.runs.unshift(r);
  }
  async listRuns(): Promise<PipelineRun[]> {
    return [...this.runs];
  }
}

/* ------------------------------------------------------------------ */

/** Anything that can run parameterized SQL — pg.Pool or the appkit lakebase plugin. */
export interface SqlExecutor {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export class SqlRepo implements Repo {
  readonly kind = "postgres" as const;
  constructor(private readonly db: SqlExecutor) {}

  async init(): Promise<void> {
    // Idempotent bootstrap — full DDL lives in server/schema.sql (kept in sync).
    await this.db.query(`CREATE SCHEMA IF NOT EXISTS dct_app`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dct_app.changeset (
        id           text PRIMARY KEY,
        title        text NOT NULL,
        status       text NOT NULL,
        author       text NOT NULL,
        decided_by   text,
        created_at   timestamptz NOT NULL,
        decided_at   timestamptz,
        edits        jsonb NOT NULL DEFAULT '[]',
        issues       jsonb NOT NULL DEFAULT '[]',
        tier         integer NOT NULL DEFAULT 1,
        tier_reasons jsonb NOT NULL DEFAULT '[]',
        domains      jsonb NOT NULL DEFAULT '[]',
        version_notes jsonb NOT NULL DEFAULT '[]'
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dct_app.pipeline_run (
        id           text PRIMARY KEY,
        pipeline     text NOT NULL,
        status       text NOT NULL,
        triggered_by text NOT NULL,
        started_at   timestamptz NOT NULL,
        duration_ms  integer NOT NULL,
        stats        jsonb NOT NULL DEFAULT '[]',
        gates        jsonb NOT NULL DEFAULT '{}',
        trigger      text NOT NULL DEFAULT 'manual',
        products     jsonb NOT NULL DEFAULT '[]'
      )`);
  }

  async insertChangeset(c: Changeset): Promise<void> {
    await this.db.query(
      `INSERT INTO dct_app.changeset
         (id, title, status, author, created_at, edits, issues, tier, tier_reasons, domains, version_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.id,
        c.title,
        c.status,
        c.author,
        c.createdAt,
        JSON.stringify(c.edits),
        JSON.stringify(c.issues),
        c.tier,
        JSON.stringify(c.tierReasons),
        JSON.stringify(c.domains),
        JSON.stringify(c.versionNotes),
      ],
    );
  }

  async listChangesets(): Promise<Changeset[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM dct_app.changeset ORDER BY created_at DESC`,
    );
    return rows.map(rowToChangeset);
  }

  async getChangeset(id: string): Promise<Changeset | undefined> {
    const { rows } = await this.db.query(
      `SELECT * FROM dct_app.changeset WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToChangeset(rows[0]) : undefined;
  }

  async setChangesetStatus(
    id: string,
    status: ChangesetStatus,
    decidedBy: string,
    decidedAt: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE dct_app.changeset SET status=$2, decided_by=$3, decided_at=$4 WHERE id=$1`,
      [id, status, decidedBy, decidedAt],
    );
  }

  async insertRun(r: PipelineRun): Promise<void> {
    await this.db.query(
      `INSERT INTO dct_app.pipeline_run
         (id, pipeline, status, triggered_by, started_at, duration_ms, stats, gates, trigger, products)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        r.id,
        r.pipeline,
        r.status,
        r.triggeredBy,
        r.startedAt,
        r.durationMs,
        JSON.stringify(r.stats),
        JSON.stringify(r.gates),
        r.trigger,
        JSON.stringify(r.products),
      ],
    );
  }

  async listRuns(): Promise<PipelineRun[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM dct_app.pipeline_run ORDER BY started_at DESC LIMIT 100`,
    );
    return rows.map(rowToRun);
  }
}

/* ------------------------------------------------------------------ */

const asJson = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T; // pg already parses jsonb
};

function rowToChangeset(r: Record<string, unknown>): Changeset {
  return {
    id: String(r.id),
    title: String(r.title),
    status: r.status as ChangesetStatus,
    author: String(r.author),
    decidedBy: r.decided_by ? String(r.decided_by) : undefined,
    createdAt: toIso(r.created_at),
    decidedAt: r.decided_at ? toIso(r.decided_at) : undefined,
    edits: asJson<ModelEdit[]>(r.edits, []),
    issues: asJson<Issue[]>(r.issues, []),
    tier: (Number(r.tier) === 2 ? 2 : 1) as ChangeTier,
    tierReasons: asJson<string[]>(r.tier_reasons, []),
    domains: asJson<string[]>(r.domains, []),
    versionNotes: asJson<string[]>(r.version_notes, []),
  };
}

function rowToRun(r: Record<string, unknown>): PipelineRun {
  return {
    id: String(r.id),
    pipeline: String(r.pipeline),
    status: r.status as PipelineRun["status"],
    triggeredBy: String(r.triggered_by),
    startedAt: toIso(r.started_at),
    durationMs: Number(r.duration_ms),
    stats: asJson<LayerStats[]>(r.stats, []),
    gates: asJson<PipelineRun["gates"]>(r.gates, { contract: [], propagation: [] }),
    trigger: (r.trigger === "product-increment" ? "product-increment" : "manual") as PipelineRun["trigger"],
    products: asJson<PipelineRun["products"]>(r.products, []),
  };
}

const toIso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);
