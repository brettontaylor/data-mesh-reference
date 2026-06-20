// Generate Snowflake serving-layer DDL from the contract's gold model, with
// classification carried through to column comments, masking policies, and roles.
import type { Contract, Entity, Field } from "../framework/types";
import type { GeneratedFile } from "./databricks";

function sfType(t: string): string {
  if (t.startsWith("decimal")) return t.toUpperCase().replace("DECIMAL", "NUMBER");
  if (t === "int") return "NUMBER(38,0)";
  if (t === "date") return "DATE";
  return "VARCHAR";
}

function columnDDL(f: Field): string {
  const pk = f.pk ? " PRIMARY KEY" : "";
  return `    ${f.name.padEnd(20)} ${sfType(f.type)}${pk} COMMENT '${f.classification}: ${(f.description ?? "").replace(/'/g, "''")}'`;
}

function tableDDL(e: Entity): string {
  // Gold serving excludes restricted columns entirely (defense in depth);
  // confidential columns are masked by policy below.
  const cols = e.fields.filter((f) => f.classification !== "restricted");
  return `-- ${e.label} (${e.grain})
CREATE OR REPLACE TABLE GOLD.${e.entity.toUpperCase()} (
${cols.map(columnDDL).join(",\n")}
) COMMENT = 'data-product: ${e.entity}; owner: ${e.owner}';
`;
}

export function generateSnowflake(c: Contract): GeneratedFile[] {
  const roles = `-- Roles: progressive sensitivity access.
CREATE ROLE IF NOT EXISTS DM_ANALYST;     -- public + internal
CREATE ROLE IF NOT EXISTS DM_RISK;        -- + confidential
CREATE ROLE IF NOT EXISTS DM_ADMIN;       -- all
`;

  // One masking policy per sensitive tier; applied to confidential columns.
  const maskingPolicy = `-- Masking: confidential values are visible only to DM_RISK / DM_ADMIN.
CREATE MASKING POLICY IF NOT EXISTS MASK_CONFIDENTIAL AS (val STRING) RETURNS STRING ->
  CASE WHEN CURRENT_ROLE() IN ('DM_RISK','DM_ADMIN') THEN val ELSE '***MASKED***' END;
`;

  const tables = c.entities.map(tableDDL).join("\n");

  const applies = c.entities
    .flatMap((e) =>
      e.fields
        .filter((f) => f.classification === "confidential")
        .map(
          (f) =>
            `ALTER TABLE GOLD.${e.entity.toUpperCase()} MODIFY COLUMN ${f.name} SET MASKING POLICY MASK_CONFIDENTIAL;`,
        ),
    )
    .join("\n");

  const content = `-- AUTO-GENERATED from /contracts — DO NOT EDIT BY HAND. Regenerate: npm run generate
-- Snowflake serving layer for "${c.spec.name}" v${c.spec.version}
CREATE SCHEMA IF NOT EXISTS GOLD;

${roles}
${maskingPolicy}
${tables}
-- Apply masking policies to confidential columns
${applies}
`;

  return [{ path: "snowflake/serving.sql", content }];
}
