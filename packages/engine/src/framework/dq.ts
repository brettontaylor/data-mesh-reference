// DQ rules library — resolution of rule applications.
//
// A rule set entry is either an APPLICATION of a generic library rule
// (`use: <rule-id>` + column/param bindings) or a legacy INLINE rule
// (`type: <primitive>`). This module merges library defaults with the
// application's overrides into one executable ResolvedDqRule — the single
// shape the governance checks, the medallion runner, and the control-plane
// app all consume.
import type { Contract, DqRule, DqRuleDef, ResolvedDqRule } from "./types";

export function dqRuleById(c: Contract, id: string): DqRuleDef | undefined {
  return c.dqRules.find((r) => r.rule === id);
}

/** Rule sets (and bindings) that apply a given library rule. */
export function dqRuleUsage(
  c: Contract,
  ruleId: string,
): { ruleSet: string; target: string; field?: string }[] {
  const out: { ruleSet: string; target: string; field?: string }[] = [];
  for (const rs of c.dqRuleSets) {
    for (const r of rs.rules) {
      if (r.use === ruleId)
        out.push({
          ruleSet: rs.dqRuleSet,
          target: `${rs.target.kind}/${rs.target.id}`,
          field: r.field,
        });
    }
  }
  return out;
}

/**
 * Resolve one rule-set entry. Returns null when a `use:` reference does not
 * resolve — the governance check reports that as an error; the runner skips.
 */
export function resolveDqRule(c: Contract, r: DqRule): ResolvedDqRule | null {
  if (r.use) {
    const def = dqRuleById(c, r.use);
    if (!def) return null;
    // Library defaults, overlaid with the application's params.
    const params: Record<string, unknown> = {};
    for (const p of def.params ?? []) {
      if (p.default !== undefined) params[p.name] = p.default;
    }
    Object.assign(params, r.params ?? {});
    return {
      id: def.rule,
      label: def.label ?? def.rule,
      scope: def.scope,
      check: def.check,
      field: r.field,
      ref: r.ref ?? (typeof params.ref === "string" ? params.ref : undefined),
      params,
      severity: r.severity ?? def.severity,
      source: "library",
    };
  }
  if (!r.type) return null;
  return {
    id: `inline:${r.type}`,
    label: r.type,
    scope: r.field ? "column" : "table",
    check: r.type,
    field: r.field,
    ref: r.ref,
    params: r.params ?? {},
    severity: r.severity ?? "error",
    source: "inline",
  };
}

/** Missing required params for a resolved library application. */
export function missingDqParams(def: DqRuleDef, r: DqRule): string[] {
  const supplied = new Set([
    ...Object.keys(r.params ?? {}),
    ...(def.params ?? []).filter((p) => p.default !== undefined).map((p) => p.name),
  ]);
  return (def.params ?? [])
    .filter((p) => p.required && !supplied.has(p.name))
    .map((p) => p.name);
}
