// Governance gates. These are the invariants that keep the spec, pipelines,
// semantic models, and warehouse from drifting — the propagation chain's CI.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, entityById, pkOf } from "../framework/load";
import type { Contract } from "../framework/types";

export interface Issue {
  level: "error" | "warn";
  code: string;
  message: string;
}

/** Static checks — run on the contract alone (no generated output needed). */
export function checkContract(c: Contract): Issue[] {
  const issues: Issue[] = [];
  const valid = new Set(c.spec.classifications);

  // 1. Classification coverage — every field carries a known tier. No default.
  for (const e of c.entities) {
    for (const f of e.fields) {
      if (!f.classification) {
        issues.push({
          level: "error",
          code: "CLASSIFICATION_MISSING",
          message: `${e.entity}.${f.name} has no classification (no permissive default is allowed).`,
        });
      } else if (!valid.has(f.classification)) {
        issues.push({
          level: "error",
          code: "CLASSIFICATION_UNKNOWN",
          message: `${e.entity}.${f.name} has unknown classification "${f.classification}".`,
        });
      }
    }
  }

  // 2. Primary key — every entity has exactly one PK.
  for (const e of c.entities) {
    const pks = e.fields.filter((f) => f.pk);
    if (pks.length !== 1) {
      issues.push({
        level: "error",
        code: "PK_CARDINALITY",
        message: `${e.entity} must declare exactly one primary key (found ${pks.length}).`,
      });
    }
  }

  // 3. Registry consistency — entity.source and source.produces agree both ways.
  for (const e of c.entities) {
    const src = c.sources.find((s) => s.source === e.source);
    if (!src) {
      issues.push({
        level: "error",
        code: "SOURCE_UNDEFINED",
        message: `${e.entity} references source "${e.source}" which is not defined.`,
      });
    } else if (!src.produces.includes(e.entity)) {
      issues.push({
        level: "error",
        code: "REGISTRY_INCONSISTENT",
        message: `source "${src.source}" does not list "${e.entity}" in produces, but the entity points to it.`,
      });
    }
  }
  for (const s of c.sources) {
    for (const ent of s.produces) {
      if (!entityById(c, ent)) {
        issues.push({
          level: "error",
          code: "PRODUCES_UNKNOWN",
          message: `source "${s.source}" produces unknown entity "${ent}".`,
        });
      }
    }
  }

  // 4. Foreign-key integrity.
  for (const e of c.entities) {
    for (const f of e.fields) {
      if (!f.fk) continue;
      const target = entityById(c, f.fk.entity);
      if (!target) {
        issues.push({
          level: "error",
          code: "FK_ENTITY_UNKNOWN",
          message: `${e.entity}.${f.name} → ${f.fk.entity}.${f.fk.field}: target entity not found.`,
        });
      } else if (!target.fields.some((tf) => tf.name === f.fk!.field)) {
        issues.push({
          level: "error",
          code: "FK_FIELD_UNKNOWN",
          message: `${e.entity}.${f.name} → ${f.fk.entity}.${f.fk.field}: target field not found.`,
        });
      }
    }
  }

  // 5. Sensitivity leakage — a restricted field must not be a public dimension.
  for (const e of c.entities) {
    for (const dim of e.dimensions ?? []) {
      const f = e.fields.find((x) => x.name === dim);
      if (f && f.classification === "restricted") {
        issues.push({
          level: "error",
          code: "RESTRICTED_DIMENSION",
          message: `${e.entity}.${dim} is restricted and must not be exposed as a semantic dimension.`,
        });
      }
    }
  }

  // 6. PII / MNPI must not sit in the most-open tier — a tagged attribute that is
  // also "public" would be visible to everyone, defeating the tag.
  for (const e of c.entities) {
    for (const f of e.fields) {
      if ((f.pii || f.mnpi) && f.classification === c.spec.mostOpenTier) {
        const tag = f.pii ? "PII" : "MNPI";
        issues.push({
          level: "error",
          code: "TAGGED_FIELD_PUBLIC",
          message: `${e.entity}.${f.name} is ${tag} but classified "${f.classification}" — tagged attributes must not be in the most-open tier.`,
        });
      }
    }
  }

  // 7. Access model — defaultRole must exist; tiers must be known.
  if (!c.access.roles.some((r) => r.role === c.access.defaultRole)) {
    issues.push({
      level: "error",
      code: "DEFAULT_ROLE_UNKNOWN",
      message: `access defaultRole "${c.access.defaultRole}" is not a defined role.`,
    });
  }
  for (const r of c.access.roles) {
    if (!valid.has(r.maxTier)) {
      issues.push({
        level: "error",
        code: "ROLE_TIER_UNKNOWN",
        message: `role "${r.role}" has unknown maxTier "${r.maxTier}".`,
      });
    }
  }

  return issues;
}

/** Propagation completeness — every entity reached every generated surface. */
export function checkPropagation(c: Contract): Issue[] {
  const issues: Issue[] = [];
  const gen = join(ROOT, "generated");
  if (!existsSync(gen)) {
    return [
      {
        level: "warn",
        code: "NOT_GENERATED",
        message: "generated/ not found — run `npm run generate` to verify propagation.",
      },
    ];
  }
  const surfaces = (e: string) => [
    join(gen, "databricks", `${e}_pipeline.py`),
    join(gen, "cube", `${e}.yml`),
    join(gen, "catalog", `${e}.json`),
  ];
  for (const e of c.entities) {
    for (const path of surfaces(e.entity)) {
      if (!existsSync(path)) {
        issues.push({
          level: "error",
          code: "PROPAGATION_INCOMPLETE",
          message: `${e.entity}: missing generated artifact ${path.replace(ROOT, ".")} — regenerate.`,
        });
      }
    }
  }
  // Single-file surfaces.
  for (const single of ["snowflake/serving.sql", "access/policy.json"]) {
    if (!existsSync(join(gen, single))) {
      issues.push({
        level: "error",
        code: "PROPAGATION_INCOMPLETE",
        message: `missing generated/${single} — regenerate.`,
      });
    }
  }
  return issues;
}

export function pkName(c: Contract, entity: string): string {
  const e = entityById(c, entity);
  const pk = e && pkOf(e);
  return pk?.name ?? "id";
}
