// Local medallion runner — executes bronze -> silver -> gold on the synthetic
// CSV inputs, in-process, so the reference is runnable without any cloud.
// This mirrors what the generated Databricks pipelines do at scale.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, sourceById } from "../framework/load";
import type { Contract, Entity } from "../framework/types";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

// Minimal CSV splitter with quote support (enough for the synthetic data).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface LayerStats {
  entity: string;
  bronze: number;
  silver: number;
  gold: number;
  droppedNoPk: number;
  droppedDup: number;
}

function runEntity(c: Contract, e: Entity): LayerStats | null {
  const src = sourceById(c, e.source);
  const input = src?.inputs?.[e.entity];
  if (!input) return null;
  const path = join(ROOT, input);
  if (!existsSync(path)) {
    console.warn(`  ! ${e.entity}: input not found (${input}) — skipped`);
    return null;
  }

  // BRONZE — raw rows + ingest metadata.
  const bronze: Row[] = parseCsv(readFileSync(path, "utf8")).map((r) => ({
    ...r,
    _source: src!.source,
  }));

  // SILVER — drop rows missing PK, dedup on PK (last-wins).
  const pk = e.fields.find((f) => f.pk)!.name;
  let droppedNoPk = 0;
  const byPk = new Map<string, Row>();
  for (const r of bronze) {
    if (!r[pk]) {
      droppedNoPk++;
      continue;
    }
    byPk.set(r[pk]!, r);
  }
  const silver = [...byPk.values()];
  const droppedDup = bronze.length - droppedNoPk - silver.length;

  // GOLD — project to non-restricted contract fields.
  const goldCols = e.fields.filter((f) => f.classification !== "restricted").map((f) => f.name);
  const gold = silver.map((r) => Object.fromEntries(goldCols.map((col) => [col, r[col] ?? null])));

  // Write layer outputs for inspection.
  const writeJson = (layer: string, rows: unknown[]) => {
    const out = join(ROOT, "generated", "medallion", `${e.entity}_${layer}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
  };
  writeJson("bronze", bronze);
  writeJson("silver", silver);
  writeJson("gold", gold);

  return {
    entity: e.entity,
    bronze: bronze.length,
    silver: silver.length,
    gold: gold.length,
    droppedNoPk,
    droppedDup,
  };
}

export function runMedallion(c: Contract): LayerStats[] {
  const stats: LayerStats[] = [];
  for (const e of c.entities) {
    const s = runEntity(c, e);
    if (s) stats.push(s);
  }
  return stats;
}
