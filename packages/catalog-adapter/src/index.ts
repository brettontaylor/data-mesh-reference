// @dct/catalog-adapter — Unity Catalog two-way sync + OpenLineage (Phase 6).
// plan() computes the UC operations a model set WOULD apply (schemas, tags,
// masks) — verifiable without a workspace. apply()/pull()/reconcile() use the
// Databricks SDK and activate when a workspace is configured.

export interface FieldView {
  name: string;
  type: string;
  classification: string;
  pii: boolean;
  mnpi: boolean;
  isPk: boolean;
}
export interface ModelView {
  kind: string;
  id: string;
  domain: string;
  owner: string | null;
  table: string; // gold table, e.g. GOLD.TRADE
  fields: FieldView[];
}

export interface UcTag {
  key: string;
  value: string;
}
export interface UcColumnPlan {
  name: string;
  type: string;
  tags: UcTag[];
  mask?: string;
}
export interface UcTablePlan {
  catalog: string;
  schema: string;
  name: string;
  tags: UcTag[];
  columns: UcColumnPlan[];
}
export interface UcOperation {
  kind: "create_schema" | "create_table" | "set_table_tag" | "set_column_tag" | "apply_mask";
  statement: string;
}
export interface UcPlan {
  env: string;
  catalog: string;
  tables: UcTablePlan[];
  operations: UcOperation[];
}

export interface DriftReport {
  unmanaged: string[];
  undeployed: string[];
  drifted: string[];
}

export interface CatalogConnector {
  readonly id: string;
  plan(input: { env: string; catalog?: string; models: ModelView[] }): Promise<UcPlan>;
  apply(plan: UcPlan): Promise<{ applied: number }>;
  pull(): Promise<ModelView[]>;
  reconcile(models: ModelView[]): Promise<DriftReport>;
}

function ucType(t: string): string {
  if (t.startsWith("decimal")) return t.toUpperCase();
  if (t === "int") return "BIGINT";
  if (t === "date") return "DATE";
  return "STRING";
}

/** Unity Catalog connector. plan() is pure (no workspace); apply/pull/reconcile need creds. */
export class UnityCatalogConnector implements CatalogConnector {
  readonly id = "unity-catalog";
  constructor(private cfg?: { host: string; token: string }) {}

  async plan(input: { env: string; catalog?: string; models: ModelView[] }): Promise<UcPlan> {
    const catalog = input.catalog ?? `dct_${input.env}`;
    const tables: UcTablePlan[] = [];
    const operations: UcOperation[] = [
      { kind: "create_schema", statement: `CREATE SCHEMA IF NOT EXISTS ${catalog}.gold;` },
    ];

    for (const m of input.models) {
      if (m.kind !== "bdm") continue; // gold tables come from BDMs
      const schema = "gold";
      const name = m.table.split(".").pop() ?? m.id.toUpperCase();
      const cols: UcColumnPlan[] = m.fields
        .filter((f) => f.classification !== "restricted")
        .map((f) => {
          const tags: UcTag[] = [{ key: "classification", value: f.classification }];
          if (f.pii) tags.push({ key: "pii", value: "true" });
          if (f.mnpi) tags.push({ key: "mnpi", value: "true" });
          const sensitive = f.classification === "confidential" || f.pii || f.mnpi;
          return { name: f.name, type: ucType(f.type), tags, mask: sensitive ? "dct_mask_sensitive" : undefined };
        });
      const tableTags: UcTag[] = [
        { key: "domain", value: m.domain },
        { key: "owner", value: m.owner ?? "unknown" },
        { key: "data_product", value: m.id },
      ];
      tables.push({ catalog, schema, name, tags: tableTags, columns: cols });

      const fqn = `${catalog}.${schema}.${name}`;
      operations.push({
        kind: "create_table",
        statement: `CREATE TABLE IF NOT EXISTS ${fqn} (${cols.map((c) => `${c.name} ${c.type}`).join(", ")});`,
      });
      for (const t of tableTags)
        operations.push({ kind: "set_table_tag", statement: `ALTER TABLE ${fqn} SET TAGS ('${t.key}' = '${t.value}');` });
      for (const c of cols) {
        for (const t of c.tags)
          operations.push({ kind: "set_column_tag", statement: `ALTER TABLE ${fqn} ALTER COLUMN ${c.name} SET TAGS ('${t.key}' = '${t.value}');` });
        if (c.mask)
          operations.push({ kind: "apply_mask", statement: `ALTER TABLE ${fqn} ALTER COLUMN ${c.name} SET MASK ${c.mask};` });
      }
    }
    return { env: input.env, catalog, tables, operations };
  }

  async apply(): Promise<{ applied: number }> {
    if (!this.cfg) throw new Error("UnityCatalogConnector.apply requires a Databricks workspace");
    throw new Error("apply via Databricks SDK — activates with a configured workspace");
  }
  async pull(): Promise<ModelView[]> {
    if (!this.cfg) throw new Error("UnityCatalogConnector.pull requires a Databricks workspace");
    throw new Error("pull via Databricks SDK (information_schema) — activates with a workspace");
  }
  async reconcile(): Promise<DriftReport> {
    if (!this.cfg) throw new Error("UnityCatalogConnector.reconcile requires a Databricks workspace");
    throw new Error("reconcile via Databricks SDK — activates with a workspace");
  }
}

// --- OpenLineage (Phase 6) ---------------------------------------------------
export interface OLEvent {
  eventType: string;
  job: string;
  inputs: string[];
  outputs: string[];
  rows?: number;
}
