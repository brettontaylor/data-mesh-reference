// Automatic semantic versioning — "real working change increments".
//
// The proposer never hand-picks a version. At proposal (and live in the
// editor via /api/validate) the server diffs each edit against the current
// contract and computes the required bump with the ENGINE's own semver
// machinery (nextVersion/bumpKind — the same rules `pnpm check` enforces
// against registry.lock.json):
//
//   major — structural/breaking (any tier-2 structural reason on the asset)
//   minor — additive or behavioural change (new fields, rule/logic changes)
//   patch — cosmetic only (description, label, docs)
//   none  — identical spec (no-op edit)
//
// New assets start at 1.0.0 (or the proposer's valid initial version).
import {
  nextVersion,
  parseSemver,
  type Contract,
  type Level,
} from "@dct/engine";
import type { ModelEdit } from "./repo";
import { classifyChange } from "./tiering";

export interface VersionPlan {
  kind: ModelEdit["kind"];
  id: string;
  current?: string; // absent for new assets
  next: string;
  level: Level | "initial" | "delete";
  note: string;
}

/** Keys ignored when deciding "cosmetic vs behavioural". */
const COSMETIC_KEYS = new Set(["description", "label"]);

const ID_KEYS: Record<ModelEdit["kind"], string> = {
  bdm: "entity",
  pdm: "pdm",
  semantic: "semanticModel",
  mapping: "mapping",
  dq: "dqRuleSet",
  dqrule: "rule",
  extract: "extract",
  transformation: "transformation",
  refmap: "refmap",
  domain: "domain",
  product: "product",
};

function findExisting(c: Contract, e: ModelEdit): Record<string, unknown> | undefined {
  const lists: Record<ModelEdit["kind"], Record<string, unknown>[]> = {
    bdm: c.entities as unknown as Record<string, unknown>[],
    pdm: c.pdms as unknown as Record<string, unknown>[],
    semantic: c.semanticModels as unknown as Record<string, unknown>[],
    mapping: c.mappings as unknown as Record<string, unknown>[],
    dq: c.dqRuleSets as unknown as Record<string, unknown>[],
    dqrule: c.dqRules as unknown as Record<string, unknown>[],
    extract: c.extracts as unknown as Record<string, unknown>[],
    transformation: c.transformations as unknown as Record<string, unknown>[],
    refmap: c.refMaps as unknown as Record<string, unknown>[],
    domain: c.domains as unknown as Record<string, unknown>[],
    product: c.products as unknown as Record<string, unknown>[],
  };
  return lists[e.kind].find((x) => x[ID_KEYS[e.kind]] === e.id);
}

/** Deep-equal ignoring key order; cosmetic keys stripped when asked. */
function stripped(v: unknown, dropCosmetic: boolean): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const entries = Object.entries(x as Record<string, unknown>)
        .filter(([k]) => !(dropCosmetic && COSMETIC_KEYS.has(k)))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, norm(val)]);
      return Object.fromEntries(entries);
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

/**
 * Compute the version plan for a set of edits and REWRITE each edit's
 * spec.version to the computed next version. Returns the plan (one entry per
 * edit). Mutates `edits` in place — call before persisting the changeset.
 */
export function applyVersionPlan(c: Contract, edits: ModelEdit[]): VersionPlan[] {
  const plans: VersionPlan[] = [];

  for (const e of edits) {
    const existing = findExisting(c, e);

    if (e.action === "delete") {
      plans.push({
        kind: e.kind,
        id: e.id,
        current: existing?.version ? String(existing.version) : undefined,
        next: existing?.version ? String(existing.version) : "0.0.0",
        level: "delete",
        note: `${e.kind}/${e.id}: retired (no further versions)`,
      });
      continue;
    }

    if (!existing) {
      const initial = parseSemver(String(e.spec.version ?? "")) ? String(e.spec.version) : "1.0.0";
      e.spec.version = initial;
      plans.push({
        kind: e.kind,
        id: e.id,
        next: initial,
        level: "initial",
        note: `${e.kind}/${e.id}: new asset starts at ${initial}`,
      });
      continue;
    }

    const current = String(existing.version ?? "0.1.0");

    // Level: major if this single edit carries structural (tier-2) reasons;
    // else minor if anything non-cosmetic changed; else patch if only
    // cosmetic keys changed; else none.
    const structural = classifyChange(c, [e]).reasons.length > 0;
    // Compare with the proposer's version field neutralized — the server owns it.
    const specForDiff = { ...e.spec, version: current };
    let level: Level;
    if (structural) level = "major";
    else if (stripped(specForDiff, true) !== stripped({ ...existing }, true)) level = "minor";
    else if (stripped(specForDiff, false) !== stripped({ ...existing }, false)) level = "patch";
    else level = "none";

    const next = level === "none" ? current : nextVersion(current, level);
    e.spec.version = next; // server-computed — proposer input is overridden
    plans.push({
      kind: e.kind,
      id: e.id,
      current,
      next,
      level,
      note:
        level === "none"
          ? `${e.kind}/${e.id}: no changes detected — stays at ${current}`
          : `${e.kind}/${e.id}: ${current} → ${next} (${level}${structural ? " — structural/breaking" : level === "patch" ? " — cosmetic only" : " — additive/behavioural"})`,
    });
  }

  return plans;
}
