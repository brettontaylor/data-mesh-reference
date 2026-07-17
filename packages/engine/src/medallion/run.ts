// Local medallion runner — executes bronze -> silver -> gold on the synthetic
// CSV inputs, in-process, so the reference is runnable without any cloud.
// This mirrors what the generated Databricks pipelines do at scale.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, sourceById } from "../framework/load";
import { resolveDqRule } from "../framework/dq";
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

export interface DqResult {
  rule: string; // library rule id or "inline:<type>"
  label: string;
  scope: "column" | "table";
  field?: string;
  severity: "error" | "warn";
  status: "pass" | "fail" | "skipped";
  violations: number;
  detail?: string;
}

export interface LayerStats {
  entity: string;
  bronze: number;
  silver: number;
  gold: number;
  droppedNoPk: number;
  droppedDup: number;
  /** applied DQ rules (library + inline) evaluated against the gold rows */
  dq?: DqResult[];
}

function runEntity(
  c: Contract,
  e: Entity,
  goldByEntity?: Map<string, Record<string, unknown>[]>,
): LayerStats | null {
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
  goldByEntity?.set(e.entity, gold);

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
  const goldByEntity = new Map<string, Record<string, unknown>[]>();
  for (const e of c.entities) {
    const s = runEntity(c, e, goldByEntity);
    if (s) stats.push(s);
  }
  // DQ pass — after all entities loaded, so referential checks can see peers.
  for (const s of stats) {
    const rows = goldByEntity.get(s.entity) ?? [];
    const dq = runDqForEntity(c, s.entity, rows, goldByEntity);
    if (dq.length > 0) s.dq = dq;
  }
  return stats;
}

/* ------------------------------------------------- DQ rule execution ---- */

/** Evaluate every rule applied to `entity` (via its rule sets) on the gold
 *  rows. Library applications resolve through the generic rules library;
 *  legacy inline rules run with identical semantics. */
function runDqForEntity(
  c: Contract,
  entity: string,
  rows: Record<string, unknown>[],
  goldByEntity: Map<string, Record<string, unknown>[]>,
): DqResult[] {
  const results: DqResult[] = [];
  const val = (r: Record<string, unknown>, f: string) => {
    const v = r[f];
    return v === null || v === undefined || v === "" ? null : String(v);
  };

  for (const rs of c.dqRuleSets) {
    if (!(rs.target.kind === "bdm" && rs.target.id === entity)) continue;
    for (const rule of rs.rules) {
      const res = resolveDqRule(c, rule);
      if (!res) continue; // unresolved: the governance check reports it
      const base: Omit<DqResult, "status" | "violations"> = {
        rule: res.id,
        label: res.label + (res.field ? ` (${res.field})` : ""),
        scope: res.scope,
        field: res.field,
        severity: res.severity,
      };
      let violations = 0;
      let status: DqResult["status"] = "pass";
      let detail: string | undefined;

      switch (res.check) {
        case "not_null":
          violations = rows.filter((r) => val(r, res.field!) === null).length;
          break;
        case "unique": {
          const seen = new Set<string>();
          for (const r of rows) {
            const v = val(r, res.field!);
            if (v === null) continue;
            if (seen.has(v)) violations++;
            seen.add(v);
          }
          break;
        }
        case "range": {
          const min = res.params.min as number | undefined;
          const max = res.params.max as number | undefined;
          for (const r of rows) {
            const v = val(r, res.field!);
            if (v === null) continue;
            const n = Number(v);
            if (Number.isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max))
              violations++;
          }
          break;
        }
        case "regex": {
          const re = new RegExp(String(res.params.pattern ?? ".*"));
          violations = rows.filter((r) => {
            const v = val(r, res.field!);
            return v !== null && !re.test(v);
          }).length;
          break;
        }
        case "accepted_values": {
          const allowed = new Set(((res.params.values as unknown[]) ?? []).map(String));
          violations = rows.filter((r) => {
            const v = val(r, res.field!);
            return v !== null && !allowed.has(v);
          }).length;
          break;
        }
        case "referential": {
          const ref = String(res.ref ?? "");
          const [refEntity, refField] = ref.split(".");
          const peer = refEntity ? goldByEntity.get(refEntity) : undefined;
          if (!peer || !refField) {
            status = "skipped";
            detail = `reference "${ref}" not loaded`;
            break;
          }
          const keys = new Set(peer.map((r) => val(r, refField)).filter((v) => v !== null));
          violations = rows.filter((r) => {
            const v = val(r, res.field!);
            return v !== null && !keys.has(v);
          }).length;
          break;
        }
        case "row_count_min": {
          const min = Number(res.params.minRows ?? 0);
          if (rows.length < min) {
            violations = 1;
            detail = `${rows.length} rows < required ${min}`;
          }
          break;
        }
        case "freshness":
          // Wall-clock SLA — meaningful in warehouse pipelines, not against
          // static synthetic fixtures. Reported, not silently dropped.
          status = "skipped";
          detail = "freshness evaluated in warehouse pipelines only";
          break;
      }

      if (status !== "skipped" && violations > 0) status = "fail";
      results.push({ ...base, status, violations, detail });
    }
  }
  return results;
}
