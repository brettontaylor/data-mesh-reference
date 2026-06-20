// Generate Databricks medallion pipelines (PySpark / Delta Live Tables style)
// from the contract. One pipeline module per entity: bronze -> silver -> gold.
// Output is illustrative — it reads like real DLT but targets the synthetic feed.
import { sourceById } from "../framework/load";
import type { Contract, Entity } from "../framework/types";

export interface GeneratedFile {
  path: string; // relative to generated/
  content: string;
}

function pyHeader(e: Entity, c: Contract): string {
  const src = sourceById(c, e.source);
  return `# AUTO-GENERATED from contracts/bdm/${e.entity}.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : ${e.label} (${e.entity})
# Group  : ${e.group}
# Grain  : ${e.grain}
# Owner  : ${e.owner}
# Source : ${src?.label ?? e.source} (${src?.kind ?? "?"}; cadence ${src?.cadenceDays ?? "n/a"}d)
import dlt
from pyspark.sql import functions as F
`;
}

function bronze(e: Entity, c: Contract): string {
  const src = sourceById(c, e.source);
  const input = src?.inputs?.[e.entity] ?? `landing/${e.entity}`;
  return `
@dlt.table(
    name="bronze_${e.entity}",
    comment="Raw landed ${e.entity} from ${src?.source ?? "source"}. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "${src?.classification ?? "internal"}"},
)
def bronze_${e.entity}():
    return (
        spark.read.format("csv").option("header", True)
        .load("${input}")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("${src?.source ?? "source"}"))
    )
`;
}

function silver(e: Entity, c: Contract): string {
  const pk = e.fields.find((f) => f.pk)!;
  const casts = e.fields
    .map((f) => `        F.col("${f.name}").cast("${sparkType(f.type)}").alias("${f.name}"),`)
    .join("\n");
  return `
@dlt.table(
    name="silver_${e.entity}",
    comment="Conformed & deduplicated ${e.entity}, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "${pk.name} IS NOT NULL")
def silver_${e.entity}():
    return (
        dlt.read("bronze_${e.entity}").select(
${casts}
            F.col("_ingested_at"),
        ).dropDuplicates(["${pk.name}"])
    )
`;
}

function gold(e: Entity): string {
  // Gold = curated projection. Restricted columns are dropped from the broadly
  // shared gold mart; serving-layer masking handles fine-grained access.
  const goldCols = e.fields
    .filter((f) => f.classification !== "restricted")
    .map((f) => `"${f.name}"`)
    .join(", ");
  const dropped = e.fields
    .filter((f) => f.classification === "restricted")
    .map((f) => f.name);
  const note = dropped.length
    ? `    # restricted columns excluded from gold mart: ${dropped.join(", ")}\n`
    : "";
  return `
@dlt.table(
    name="gold_${e.entity}",
    comment="Curated ${e.entity} mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_${e.entity}():
${note}    return dlt.read("silver_${e.entity}").select(${goldCols})
`;
}

function sparkType(t: string): string {
  if (t.startsWith("decimal")) return t;
  if (t === "int") return "int";
  if (t === "date") return "date";
  return "string";
}

export function generateDatabricks(c: Contract): GeneratedFile[] {
  const files: GeneratedFile[] = c.entities.map((e) => ({
    path: `databricks/${e.entity}_pipeline.py`,
    content: pyHeader(e, c) + bronze(e, c) + silver(e, c) + gold(e) + "\n",
  }));

  // Workflow / schedule manifest, derived from source cadence.
  const tasks = c.entities.map((e) => {
    const src = sourceById(c, e.source);
    return {
      task_key: `${e.entity}_pipeline`,
      notebook: `databricks/${e.entity}_pipeline.py`,
      schedule_days: src?.cadenceDays ?? null,
    };
  });
  files.push({
    path: "databricks/_workflow.json",
    content: JSON.stringify(
      { name: c.spec.name, generated_from: "contracts/", tasks },
      null,
      2,
    ),
  });
  return files;
}
