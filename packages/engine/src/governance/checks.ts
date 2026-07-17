// Governance gates. These are the invariants that keep the spec, pipelines,
// semantic models, and warehouse from drifting — the propagation chain's CI.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, entityById, pkOf } from "../framework/load";
import { parseSemver } from "../framework/version";
import { missingDqParams } from "../framework/dq";
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

  // 6b. PDM integrity — references resolve; uniqueKey is a real BDM field.
  for (const p of c.pdms) {
    const bdm = entityById(c, p.bdm);
    if (!bdm) {
      issues.push({
        level: "error",
        code: "PDM_BDM_UNKNOWN",
        message: `PDM "${p.pdm}" references unknown BDM "${p.bdm}".`,
      });
    } else if (!bdm.fields.some((f) => f.name === p.physical.uniqueKey)) {
      issues.push({
        level: "error",
        code: "PDM_KEY_UNKNOWN",
        message: `PDM "${p.pdm}" uniqueKey "${p.physical.uniqueKey}" is not a field of BDM "${p.bdm}".`,
      });
    }
    if (!c.sources.some((s) => s.source === p.source)) {
      issues.push({
        level: "error",
        code: "PDM_SOURCE_UNKNOWN",
        message: `PDM "${p.pdm}" references unknown source "${p.source}".`,
      });
    }
  }

  // 6c. Semantic-model integrity — sources, dimensions, and measures resolve.
  for (const sm of c.semanticModels) {
    for (const src of sm.sources)
      if (!entityById(c, src))
        issues.push({
          level: "error",
          code: "SEMANTIC_SOURCE_UNKNOWN",
          message: `semantic model "${sm.semanticModel}" references unknown entity "${src}".`,
        });
    for (const d of sm.dimensions) {
      const e = entityById(c, d.entity);
      if (!e || !e.fields.some((f) => f.name === d.field))
        issues.push({
          level: "error",
          code: "SEMANTIC_DIM_UNKNOWN",
          message: `semantic model "${sm.semanticModel}" dimension "${d.entity}.${d.field}" does not resolve.`,
        });
    }
    for (const m of sm.measures) {
      const e = entityById(c, m.entity);
      if (!e || !(e.metrics ?? []).some((mm) => mm.name === m.metric))
        issues.push({
          level: "error",
          code: "SEMANTIC_MEASURE_UNKNOWN",
          message: `semantic model "${sm.semanticModel}" measure "${m.entity}.${m.metric}" does not resolve.`,
        });
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

  // 7b. Domains — unique ids, valid independent semver.
  const seenDomains = new Set<string>();
  for (const d of c.domains) {
    if (seenDomains.has(d.domain))
      issues.push({
        level: "error",
        code: "DOMAIN_DUPLICATE",
        message: `domain "${d.domain}" is defined more than once.`,
      });
    seenDomains.add(d.domain);
    if (!parseSemver(d.version))
      issues.push({
        level: "error",
        code: "DOMAIN_VERSION_INVALID",
        message: `domain "${d.domain}" version "${d.version}" is not valid semver.`,
      });
  }

  // 8. Products — unique ids, valid independent semver, every member resolves,
  //    and (when domains are declared) the owning domain exists.
  const memberIds: Record<string, Set<string>> = {
    bdm: new Set(c.entities.map((e) => e.entity)),
    pdm: new Set(c.pdms.map((p) => p.pdm)),
    semantic: new Set(c.semanticModels.map((s) => s.semanticModel)),
    mapping: new Set(c.mappings.map((m) => m.mapping)),
    dq: new Set(c.dqRuleSets.map((d) => d.dqRuleSet)),
    extract: new Set(c.extracts.map((x) => x.extract)),
    transformation: new Set(c.transformations.map((t) => t.transformation)),
    refmap: new Set(c.refMaps.map((r) => r.refmap)),
  };
  const seenProducts = new Set<string>();
  for (const p of c.products) {
    if (seenProducts.has(p.product)) {
      issues.push({
        level: "error",
        code: "PRODUCT_DUPLICATE",
        message: `product "${p.product}" is defined more than once.`,
      });
    }
    seenProducts.add(p.product);
    if (!parseSemver(p.version)) {
      issues.push({
        level: "error",
        code: "PRODUCT_VERSION_INVALID",
        message: `product "${p.product}" version "${p.version}" is not valid semver.`,
      });
    }
    if (!p.includes || p.includes.length === 0) {
      issues.push({
        level: "error",
        code: "PRODUCT_EMPTY",
        message: `product "${p.product}" declares no member assets.`,
      });
    }
    if (c.domains.length > 0 && p.domain && !seenDomains.has(p.domain))
      issues.push({
        level: "error",
        code: "PRODUCT_DOMAIN_UNRESOLVED",
        message: `product "${p.product}" is in domain "${p.domain}" which is not defined.`,
      });
    for (const m of p.includes ?? []) {
      if (!memberIds[m.kind]?.has(m.id)) {
        issues.push({
          level: "error",
          code: "PRODUCT_MEMBER_UNRESOLVED",
          message: `product "${p.product}" member ${m.kind}/${m.id} does not resolve.`,
        });
      }
    }
  }

  // 9. DQ rules library — well-formed generic rules; every application binds
  //    correctly (rule resolves, scope matches the binding, required params
  //    supplied, bound column exists on the target BDM).
  const DQ_CHECKS = new Set([
    "not_null", "unique", "referential", "range", "regex", "accepted_values",
    "freshness", "row_count_min",
  ]);
  const seenDqRules = new Set<string>();
  for (const d of c.dqRules) {
    if (seenDqRules.has(d.rule)) {
      issues.push({
        level: "error",
        code: "DQRULE_DUPLICATE",
        message: `dq rule "${d.rule}" is defined more than once in the library.`,
      });
    }
    seenDqRules.add(d.rule);
    if (!parseSemver(d.version))
      issues.push({
        level: "error",
        code: "DQRULE_VERSION_INVALID",
        message: `dq rule "${d.rule}" version "${d.version}" is not valid semver.`,
      });
    if (d.scope !== "column" && d.scope !== "table")
      issues.push({
        level: "error",
        code: "DQRULE_SCOPE_INVALID",
        message: `dq rule "${d.rule}" scope must be column|table (got "${d.scope}").`,
      });
    if (!DQ_CHECKS.has(d.check))
      issues.push({
        level: "error",
        code: "DQRULE_CHECK_UNKNOWN",
        message: `dq rule "${d.rule}" check "${d.check}" is not a known primitive.`,
      });
  }
  for (const rs of c.dqRuleSets) {
    const target =
      rs.target.kind === "bdm" ? entityById(c, rs.target.id) : undefined;
    for (const [i, r] of rs.rules.entries()) {
      const where = `rule set "${rs.dqRuleSet}" rule #${i + 1}`;
      if (r.use && r.type) {
        issues.push({
          level: "error",
          code: "DQ_APPLICATION_AMBIGUOUS",
          message: `${where} sets both "use" (library) and "type" (inline) — pick one.`,
        });
        continue;
      }
      if (!r.use) {
        if (!r.type)
          issues.push({
            level: "error",
            code: "DQ_APPLICATION_EMPTY",
            message: `${where} has neither "use" nor "type".`,
          });
        continue; // inline rules keep their legacy semantics
      }
      const def = c.dqRules.find((d) => d.rule === r.use);
      if (!def) {
        issues.push({
          level: "error",
          code: "DQ_LIBRARY_RULE_UNRESOLVED",
          message: `${where} applies unknown library rule "${r.use}".`,
        });
        continue;
      }
      if (def.scope === "column" && !r.field)
        issues.push({
          level: "error",
          code: "DQ_BINDING_SCOPE",
          message: `${where} applies column-scoped "${def.rule}" without a field binding.`,
        });
      if (def.scope === "table" && r.field)
        issues.push({
          level: "error",
          code: "DQ_BINDING_SCOPE",
          message: `${where} applies table-scoped "${def.rule}" with a field binding.`,
        });
      if (target && r.field && !target.fields.some((f) => f.name === r.field))
        issues.push({
          level: "error",
          code: "DQ_BINDING_FIELD_UNKNOWN",
          message: `${where} binds field "${r.field}" which does not exist on ${rs.target.id}.`,
        });
      const missing = missingDqParams(def, r);
      if (missing.length > 0)
        issues.push({
          level: "error",
          code: "DQ_PARAMS_MISSING",
          message: `${where} ("${def.rule}") is missing required param(s): ${missing.join(", ")}.`,
        });
    }
  }

  // 10. Mapping documents — reference integrity for the governed
  //     bronze→silver (mapping) and silver→gold (transformation) docs.
  for (const m of c.mappings) {
    const from =
      m.from.kind === "source"
        ? c.sources.find((s) => s.source === m.from.id)
        : m.from.kind === "bdm"
          ? entityById(c, m.from.id)
          : undefined;
    if (!from)
      issues.push({
        level: "error",
        code: "MAPPING_FROM_UNRESOLVED",
        message: `mapping "${m.mapping}" from ${m.from.kind}/${m.from.id} does not resolve.`,
      });
    const toEntity = m.to.kind === "bdm" ? entityById(c, m.to.id) : undefined;
    if (m.to.kind === "bdm" && !toEntity)
      issues.push({
        level: "error",
        code: "MAPPING_TO_UNRESOLVED",
        message: `mapping "${m.mapping}" to ${m.to.kind}/${m.to.id} does not resolve.`,
      });
    if (toEntity) {
      for (const r of m.rules) {
        if (!toEntity.fields.some((f) => f.name === r.target))
          issues.push({
            level: "error",
            code: "MAPPING_TARGET_FIELD_UNKNOWN",
            message: `mapping "${m.mapping}" rule targets "${r.target}" which does not exist on ${m.to.id}.`,
          });
      }
    }
  }
  for (const t of c.transformations) {
    if (t.target.kind === "pdm" && !c.pdms.some((p) => p.pdm === t.target.id))
      issues.push({
        level: "error",
        code: "TRANSFORMATION_TARGET_UNRESOLVED",
        message: `transformation "${t.transformation}" target ${t.target.kind}/${t.target.id} does not resolve.`,
      });
    for (const s of t.sources) {
      if (!entityById(c, s.entity))
        issues.push({
          level: "error",
          code: "TRANSFORMATION_SOURCE_UNRESOLVED",
          message: `transformation "${t.transformation}" source "${s.entity}" is not a defined BDM.`,
        });
    }
    for (const rmId of t.uses ?? []) {
      if (!c.refMaps.some((r) => r.refmap === rmId))
        issues.push({
          level: "error",
          code: "TRANSFORMATION_REFMAP_UNRESOLVED",
          message: `transformation "${t.transformation}" uses refmap "${rmId}" which is not defined.`,
        });
    }
    for (const f of t.fields) {
      // `from` is "entity.field" — validate both halves when present.
      if (!f.from) continue;
      const [ent, fld] = f.from.split(".");
      const src = ent ? entityById(c, ent) : undefined;
      if (!src) {
        issues.push({
          level: "error",
          code: "TRANSFORMATION_FROM_UNRESOLVED",
          message: `transformation "${t.transformation}" field "${f.target}" reads from unknown entity "${ent}".`,
        });
      } else if (fld && !src.fields.some((x) => x.name === fld)) {
        issues.push({
          level: "error",
          code: "TRANSFORMATION_FROM_FIELD_UNKNOWN",
          message: `transformation "${t.transformation}" field "${f.target}" reads "${f.from}" but ${ent} has no field "${fld}".`,
        });
      }
      if (f.refmap && !c.refMaps.some((r) => r.refmap === f.refmap))
        issues.push({
          level: "error",
          code: "TRANSFORMATION_REFMAP_UNRESOLVED",
          message: `transformation "${t.transformation}" field "${f.target}" uses unknown refmap "${f.refmap}".`,
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
    join(gen, "postgres", "tables", `${e}.sql`),
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
  for (const single of [
    "snowflake/serving.sql",
    "postgres/schema.sql",
    "postgres/manifest.json",
    "access/policy.json",
    "registry/registry.json",
  ]) {
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
