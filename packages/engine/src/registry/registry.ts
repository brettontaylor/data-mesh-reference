// The model registry: enumerate every model (BDM/PDM/semantic), and govern
// semantic versioning against a committed lockfile (contracts/registry.lock.json).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../framework/load";
import type { Contract, ModelKind } from "../framework/types";
import {
  bdmSurface,
  pdmSurface,
  semanticSurface,
  mappingSurface,
  dqSurface,
  extractSurface,
  transformationSurface,
  refmapSurface,
  hashSurface,
  severity,
  type Surface,
} from "./surface";
import { bumpKind, levelRank, nextVersion, parseSemver, type Level } from "../framework/version";

const LOCK = join(ROOT, "contracts", "registry.lock.json");

export interface Model {
  id: string;
  kind: ModelKind;
  version: string;
  status: string;
  dependsOn: string[];
  surface: Surface;
}

export function buildModels(c: Contract): Model[] {
  const models: Model[] = [];
  for (const e of c.entities)
    models.push({
      id: e.entity,
      kind: "bdm",
      version: e.version,
      status: e.status ?? "active",
      dependsOn: [`source:${e.source}`],
      surface: bdmSurface(e),
    });
  for (const p of c.pdms)
    models.push({
      id: p.pdm,
      kind: "pdm",
      version: p.version,
      status: p.status ?? "active",
      dependsOn: [`bdm:${p.bdm}`, `source:${p.source}`],
      surface: pdmSurface(p),
    });
  for (const s of c.semanticModels)
    models.push({
      id: s.semanticModel,
      kind: "semantic",
      version: s.version,
      status: s.status ?? "active",
      dependsOn: s.sources.map((x) => `bdm:${x}`),
      surface: semanticSurface(s),
    });
  for (const m of c.mappings ?? [])
    models.push({
      id: m.mapping,
      kind: "mapping",
      version: m.version,
      status: m.status ?? "active",
      dependsOn: [`${m.from.kind}:${m.from.id}`, `${m.to.kind}:${m.to.id}`],
      surface: mappingSurface(m),
    });
  for (const d of c.dqRuleSets ?? [])
    models.push({
      id: d.dqRuleSet,
      kind: "dq",
      version: d.version,
      status: d.status ?? "active",
      dependsOn: [`${d.target.kind}:${d.target.id}`],
      surface: dqSurface(d),
    });
  for (const e of c.extracts ?? [])
    models.push({
      id: e.extract,
      kind: "extract",
      version: e.version,
      status: e.status ?? "active",
      dependsOn: e.from.map((f) => `${f.kind}:${f.id}`),
      surface: extractSurface(e),
    });
  for (const t of c.transformations ?? [])
    models.push({
      id: t.transformation,
      kind: "transformation",
      version: t.version,
      status: t.status ?? "active",
      dependsOn: [
        `${t.target.kind}:${t.target.id}`,
        ...t.sources.map((s) => `bdm:${s.entity}`),
        ...(t.uses ?? []).map((u) => `refmap:${u}`),
      ],
      surface: transformationSurface(t),
    });
  for (const r of c.refMaps ?? [])
    models.push({
      id: r.refmap,
      kind: "refmap",
      version: r.version,
      status: r.status ?? "active",
      dependsOn: [],
      surface: refmapSurface(r),
    });
  return models;
}

interface LockEntry {
  version: string;
  surface: Surface;
  signature: string;
}
interface Lock {
  models: Record<string, LockEntry>;
}

export function loadLock(): Lock {
  if (!existsSync(LOCK)) return { models: {} };
  return JSON.parse(readFileSync(LOCK, "utf8")) as Lock;
}

export function writeLock(c: Contract): number {
  const lock: Lock = { models: {} };
  for (const m of buildModels(c))
    lock.models[m.id] = {
      version: m.version,
      surface: m.surface,
      signature: hashSurface(m.surface),
    };
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n", "utf8");
  return Object.keys(lock.models).length;
}

export interface VersionIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

/** Enforce that content changes are matched by an adequate semver bump. */
export function checkVersions(c: Contract): VersionIssue[] {
  const issues: VersionIssue[] = [];
  const lock = loadLock();
  const models = buildModels(c);
  const ids = new Set(models.map((m) => m.id));

  for (const id of Object.keys(lock.models))
    if (!ids.has(id))
      issues.push({
        level: "warn",
        code: "MODEL_REMOVED",
        message: `model "${id}" was registered but is no longer present (deprecate instead of removing).`,
      });

  for (const m of models) {
    if (!parseSemver(m.version)) {
      issues.push({
        level: "error",
        code: "BAD_SEMVER",
        message: `${m.kind} "${m.id}" has invalid version "${m.version}".`,
      });
      continue;
    }
    const prev = lock.models[m.id];
    if (!prev) continue; // new model — will be recorded on `register`

    const required = severity(prev.surface, m.surface);
    const bump = bumpKind(prev.version, m.version);
    if (bump === "decrease") {
      issues.push({
        level: "error",
        code: "VERSION_DECREASE",
        message: `${m.kind} "${m.id}" version went backwards: ${prev.version} → ${m.version}.`,
      });
      continue;
    }
    if (required === "none") continue;
    if (bump === "none") {
      issues.push({
        level: "error",
        code: "VERSION_NOT_BUMPED",
        message: `${m.kind} "${m.id}" has a ${required} change but version is unchanged (${m.version}). Bump to >= ${nextVersion(prev.version, required)}.`,
      });
    } else if (bump !== "invalid" && levelRank(bump) < levelRank(required)) {
      issues.push({
        level: "error",
        code: "VERSION_UNDER_BUMPED",
        message: `${m.kind} "${m.id}" has a ${required} change but was only bumped "${bump}" (${prev.version} → ${m.version}). Need >= ${nextVersion(prev.version, required)}.`,
      });
    }
  }
  return issues;
}

/** Per-model status vs lock — for `dmref models`. */
export function statusVsLock(
  c: Contract,
): { id: string; kind: ModelKind; version: string; locked: string | null; change: Level | "new" }[] {
  const lock = loadLock();
  return buildModels(c).map((m) => {
    const prev = lock.models[m.id];
    const change: Level | "new" = prev ? severity(prev.surface, m.surface) : "new";
    return { id: m.id, kind: m.kind, version: m.version, locked: prev?.version ?? null, change };
  });
}
