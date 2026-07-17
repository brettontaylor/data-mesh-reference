// Generate Lakebase-ready Postgres DDL from the contract's gold model — the
// OLTP serving copy used when a Delta/UC table migrates to Lakebase (Databricks
// Apps). Idempotent by construction: CREATE SCHEMA / TABLE IF NOT EXISTS, and
// COMMENT ON statements simply overwrite. Every column carries its
// classification in a COMMENT ON COLUMN; PII/MNPI columns additionally get
// masked-view guidance whose allowed roles are computed by the same access
// engine the API, semantic layer, and Snowflake masking policies use.
//
// Contract (logical) type -> Postgres type:
//   decimal(p,s) -> numeric(p,s)   (bare "decimal" -> numeric(38,9))
//   int          -> integer
//   bigint       -> bigint
//   date         -> date
//   timestamp    -> timestamptz
//   boolean      -> boolean
//   string       -> text           (also the fallback for unknown types)
import { decide } from "../framework/access";
import type { Contract, Entity, Field } from "../framework/types";
import type { GeneratedFile } from "./databricks";

// Lakebase serves the gold layer only — same organization as the Snowflake
// serving generator (bronze/silver stay in Delta; Postgres is the OLTP copy).
const SCHEMA = "gold";

function pgType(t: string): string {
  const dec = /^decimal\((\d+),\s*(\d+)\)$/.exec(t);
  if (dec) return `numeric(${dec[1]},${dec[2]})`;
  if (t === "decimal") return "numeric(38,9)";
  if (t === "int") return "integer";
  if (t === "bigint") return "bigint";
  if (t === "date") return "date";
  if (t === "timestamp") return "timestamptz";
  if (t === "boolean") return "boolean";
  return "text";
}

const esc = (s: string) => s.replace(/'/g, "''");

function tagComment(f: Field): string {
  const tags: string[] = [f.classification];
  if (f.pii) tags.push("PII");
  if (f.mnpi) tags.push("MNPI");
  return tags.join("/");
}

// Restricted columns are excluded from the serving copy entirely (defense in
// depth, matching the Snowflake gold serving layer); confidential / PII / MNPI
// columns are served but flagged for masked-view exposure.
function servedFields(e: Entity): Field[] {
  return e.fields.filter((f) => f.classification !== "restricted");
}

function columnDDL(f: Field): string {
  // Business keys are NOT NULL so the UNIQUE constraint below is meaningful.
  const constraint = f.pk ? " PRIMARY KEY" : f.bk ? " NOT NULL" : "";
  return `    ${f.name.padEnd(20)} ${pgType(f.type)}${constraint}`;
}

function tableDDL(e: Entity): string {
  const cols = servedFields(e);
  const dropped = e.fields.filter((f) => f.classification === "restricted").map((f) => f.name);
  const note = dropped.length
    ? `-- restricted columns excluded from serving: ${dropped.join(", ")}\n`
    : "";
  const lines = cols.map(columnDDL);
  // Business key (natural key) -> UNIQUE constraint, distinct from the surrogate PK.
  const bks = cols.filter((f) => f.bk);
  if (bks.length) {
    lines.push(
      `    CONSTRAINT ${e.entity}_business_key UNIQUE (${bks.map((f) => f.name).join(", ")})`,
    );
  }
  return `-- ${e.label} (${e.grain})
${note}CREATE TABLE IF NOT EXISTS ${SCHEMA}.${e.entity} (
${lines.join(",\n")}
);
COMMENT ON TABLE ${SCHEMA}.${e.entity} IS 'data-product: ${e.entity}; owner: ${e.owner}';
`;
}

function columnComments(e: Entity, c: Contract): string {
  const out: string[] = [];
  for (const f of servedFields(e)) {
    let text = `${tagComment(f)}: ${f.description ?? ""}`;
    if (f.pii || f.mnpi) {
      // Postgres has no native masking policy — the migration guide serves
      // these through a masked view; record who may see them unmasked.
      const allowed = c.access.roles.filter((r) => decide(r, f).visible).map((r) => r.role);
      text += ` Serve via masked view; unmasked only for roles: ${allowed.join(", ") || "none"}.`;
    }
    out.push(`COMMENT ON COLUMN ${SCHEMA}.${e.entity}.${f.name} IS '${esc(text)}';`);
  }
  return out.join("\n");
}

function entityBlock(e: Entity, c: Contract): string {
  return `${tableDDL(e)}${columnComments(e, c)}\n`;
}

function entityFile(e: Entity, c: Contract): string {
  return `-- AUTO-GENERATED from contracts/bdm/${e.entity}.yaml — DO NOT EDIT BY HAND.
-- Regenerate with: npm run generate
-- Lakebase (Postgres) serving DDL for "${e.label}" — apply standalone or via postgres/schema.sql.
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};

${entityBlock(e, c)}`;
}

export function generatePostgres(c: Contract): GeneratedFile[] {
  const files: GeneratedFile[] = c.entities.map((e) => ({
    path: `postgres/tables/${e.entity}.sql`,
    content: entityFile(e, c),
  }));

  const content = `-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Lakebase (Postgres) serving layer for "${c.spec.name}" v${c.spec.version}
-- Idempotent: safe to re-apply. Classification is carried in column comments;
-- PII/MNPI columns are exposed through masked views (see column comments).
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};

${c.entities.map((e) => entityBlock(e, c)).join("\n")}`;
  files.push({ path: "postgres/schema.sql", content });

  // Machine-readable manifest — what the migration tooling diffs against.
  const manifest = {
    generated_from: "contracts/",
    target: "lakebase-postgres",
    schema: SCHEMA,
    tables: c.entities.map((e) => ({
      entity: e.entity,
      table: `${SCHEMA}.${e.entity}`,
      layer: "gold",
      columns: servedFields(e).map((f) => ({
        name: f.name,
        pgType: pgType(f.type),
        classification: f.classification,
        nullable: !(f.pk || f.bk),
      })),
    })),
  };
  files.push({
    path: "postgres/manifest.json",
    content: JSON.stringify(manifest, null, 2),
  });
  return files;
}
