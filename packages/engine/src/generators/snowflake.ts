// Generate Snowflake serving-layer DDL from the contract's gold model, with
// attribute-level access control: classification comments, plus a masking policy
// per sensitive column whose allowed roles are computed by the same access engine
// the API and semantic layer use.
import { decide } from "../framework/access";
import type { Contract, Entity, Field } from "./../framework/types";
import type { GeneratedFile } from "./databricks";

function sfType(t: string): string {
  if (t.startsWith("decimal")) return t.toUpperCase().replace("DECIMAL", "NUMBER");
  if (t === "int") return "NUMBER(38,0)";
  if (t === "date") return "DATE";
  return "VARCHAR";
}

const roleSql = (role: string) => `DM_${role.toUpperCase()}`;

function tagComment(f: Field): string {
  const tags: string[] = [f.classification];
  if (f.pii) tags.push("PII");
  if (f.mnpi) tags.push("MNPI");
  return tags.join("/");
}

function columnDDL(f: Field): string {
  const pk = f.pk ? " PRIMARY KEY" : "";
  return `    ${f.name.padEnd(20)} ${sfType(f.type)}${pk} COMMENT '${tagComment(f)}: ${(f.description ?? "").replace(/'/g, "''")}'`;
}

function tableDDL(e: Entity): string {
  // Restricted columns are excluded from gold serving entirely (defense in depth);
  // confidential / PII / MNPI columns are masked per-role by policy below.
  const cols = e.fields.filter((f) => f.classification !== "restricted");
  return `-- ${e.label} (${e.grain})
CREATE OR REPLACE TABLE GOLD.${e.entity.toUpperCase()} (
${cols.map(columnDDL).join(",\n")}
) COMMENT = 'data-product: ${e.entity}; owner: ${e.owner}';
`;
}

export function generateSnowflake(c: Contract): GeneratedFile[] {
  const roleDefs = c.access.roles
    .map((r) => `CREATE ROLE IF NOT EXISTS ${roleSql(r.role)};  -- ${r.label}: ${r.description ?? ""}`)
    .join("\n");

  const tables = c.entities.map(tableDDL).join("\n");

  // For each served, non-public column, compute which roles may see it and
  // emit a column-scoped masking policy.
  const policies: string[] = [];
  const applies: string[] = [];
  for (const e of c.entities) {
    for (const f of e.fields) {
      if (f.classification === "restricted") continue; // not served
      const allowed = c.access.roles.filter((r) => decide(r, f).visible).map((r) => roleSql(r.role));
      if (allowed.length === c.access.roles.length) continue; // visible to all → no policy
      const pol = `MASK_${e.entity.toUpperCase()}_${f.name.toUpperCase()}`;
      policies.push(
        `CREATE MASKING POLICY IF NOT EXISTS ${pol} AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN (${allowed.map((a) => `'${a}'`).join(", ")}) THEN val ELSE '***MASKED***' END;  -- ${tagComment(f)}`,
      );
      applies.push(
        `ALTER TABLE GOLD.${e.entity.toUpperCase()} MODIFY COLUMN ${f.name} SET MASKING POLICY ${pol};`,
      );
    }
  }

  const content = `-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Snowflake serving layer for "${c.spec.name}" v${c.spec.version}
-- Attribute-level access control: sensitivity tier + PII + MNPI, per role.
CREATE SCHEMA IF NOT EXISTS GOLD;

-- Roles / clearances
${roleDefs}

-- Per-attribute masking policies (allowed roles computed from the access model)
${policies.join("\n\n")}

${tables}
-- Apply masking policies
${applies.join("\n")}
`;

  return [{ path: "snowflake/serving.sql", content }];
}
