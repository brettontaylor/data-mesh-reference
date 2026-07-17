// Two-tier change framework.
//
//   Tier 1 — minor changes:      approved within the owning domain
//                                (change:approve + domain membership).
//   Tier 2 — impactful/breaking: chief data architect / ARB sign-off
//                                (change:signoff), enterprise-wide.
//
// The tier is classified automatically at proposal time by diffing each edit
// against the current contract. Classification is conservative: when in doubt,
// escalate to tier 2 — a CDA can always delegate down, but a silently-merged
// breaking change is unrecoverable.
import { dqRuleUsage, type Contract, type Entity, type Field } from "@dct/engine";
import type { ChangeTier, ModelEdit } from "./repo";

export interface TierVerdict {
  tier: ChangeTier;
  reasons: string[]; // present when tier 2 — why it escalated
  domains: string[]; // owning domains of the touched assets (tier-1 routing)
}

/* --------------------------------------------------------- domain routing */

/** Owning domain per asset — mirrors apps/api mapping.ts (bdmDomain et al.). */
export function domainOf(c: Contract, kind: ModelEdit["kind"], id: string): string {
  const bdmDomain = (e: Entity | undefined): string | undefined =>
    e ? (e.group === "reference" ? "reference" : "trading") : undefined;
  const byBdm = (bdmId: string | undefined) =>
    bdmDomain(c.entities.find((e) => e.entity === bdmId));

  switch (kind) {
    case "bdm":
      return bdmDomain(c.entities.find((e) => e.entity === id)) ?? "platform";
    case "pdm":
      return byBdm(c.pdms.find((p) => p.pdm === id)?.bdm) ?? "platform";
    case "semantic":
      return "analytics";
    case "mapping": {
      const m = c.mappings.find((x) => x.mapping === id);
      return byBdm(m?.to.id) ?? byBdm(m?.from.id) ?? "platform";
    }
    case "dq":
      return byBdm(c.dqRuleSets.find((d) => d.dqRuleSet === id)?.target.id) ?? "governance";
    case "dqrule":
      return "governance"; // the rules library is owned by data governance
    case "extract":
      return "consumption";
    case "transformation":
      return byBdm(c.transformations.find((t) => t.transformation === id)?.sources[0]?.entity) ?? "consumption";
    case "refmap":
      return "reference";
    case "domain":
      return id; // a domain belongs to itself
    case "product":
      return c.products.find((p) => p.product === id)?.domain ?? "platform";
  }
}

/* ------------------------------------------------------- tier classifier */

const major = (v: unknown): number => Number(String(v ?? "0").split(".")[0]) || 0;

export function classifyChange(c: Contract, edits: ModelEdit[]): TierVerdict {
  const reasons: string[] = [];
  const domains = new Set<string>();

  for (const e of edits) {
    const label = `${e.kind}/${e.id}`;
    domains.add(domainOf(c, e.kind, e.id));

    // -- deletions are always impactful --------------------------------
    if (e.action === "delete") {
      reasons.push(`${label}: asset retirement (delete) is consumer-impacting`);
      continue;
    }

    const existing = findExisting(c, e);

    // -- new first-class models are architectural ----------------------
    if (!existing && (e.kind === "bdm" || e.kind === "pdm")) {
      reasons.push(`${label}: introduces a new ${e.kind.toUpperCase()} (architectural change)`);
    }

    // -- extracts are published consumer contracts ---------------------
    if (e.kind === "extract" && existing) {
      reasons.push(`${label}: modifies a published consumer extract contract`);
    }

    // -- library DQ rules cascade: changing one changes EVERY application
    if (e.kind === "dqrule" && existing) {
      const usage = dqRuleUsage(c, e.id);
      if (usage.length > 0)
        reasons.push(
          `${label}: modifies a DQ library rule applied by ${usage.length} binding(s) ` +
            `across rule set(s) ${[...new Set(usage.map((u) => u.ruleSet))].join(", ")}`,
        );
    }

    if (existing) {
      // -- major version bump = declared breaking ----------------------
      if (major(e.spec.version) > major(existing.version)) {
        reasons.push(`${label}: major version bump (${existing.version} → ${e.spec.version})`);
      }
      // -- lifecycle regressions ---------------------------------------
      if (
        (e.spec.status === "deprecated" || e.spec.status === "retired") &&
        existing.status !== e.spec.status
      ) {
        reasons.push(`${label}: status change to ${e.spec.status}`);
      }
      // -- BDM structural diffs ----------------------------------------
      if (e.kind === "bdm") {
        reasons.push(...bdmStructuralDiffs(label, existing as unknown as Entity, e.spec));
      }
    }
  }

  return {
    tier: reasons.length > 0 ? 2 : 1,
    reasons,
    domains: [...domains].sort(),
  };
}

function findExisting(
  c: Contract,
  e: ModelEdit,
): { version?: unknown; status?: unknown } | undefined {
  switch (e.kind) {
    case "bdm": return c.entities.find((x) => x.entity === e.id);
    case "pdm": return c.pdms.find((x) => x.pdm === e.id);
    case "semantic": return c.semanticModels.find((x) => x.semanticModel === e.id);
    case "mapping": return c.mappings.find((x) => x.mapping === e.id);
    case "dq": return c.dqRuleSets.find((x) => x.dqRuleSet === e.id);
    case "dqrule": return c.dqRules.find((x) => x.rule === e.id);
    case "domain": return c.domains.find((x) => x.domain === e.id);
    case "product": return c.products.find((x) => x.product === e.id);
    case "extract": return c.extracts.find((x) => x.extract === e.id);
    case "transformation": return c.transformations.find((x) => x.transformation === e.id);
    case "refmap": return c.refMaps.find((x) => x.refmap === e.id);
  }
}

const TIER_RANK = { public: 0, internal: 1, confidential: 2, restricted: 3 } as const;
type Tier = keyof typeof TIER_RANK;

/** Field-level breaking changes on a BDM: removals, type changes, key changes,
 *  classification downgrades, PII/MNPI flag changes. Additive nullable fields
 *  and description edits stay tier 1. */
function bdmStructuralDiffs(
  label: string,
  existing: Entity,
  spec: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const next = (spec.fields ?? []) as Field[];
  const nextByName = new Map(next.map((f) => [f.name, f]));

  for (const f of existing.fields) {
    const n = nextByName.get(f.name);
    if (!n) {
      out.push(`${label}: removes field '${f.name}'`);
      continue;
    }
    if (n.type !== f.type)
      out.push(`${label}: changes type of '${f.name}' (${f.type} → ${n.type})`);
    if (!!n.pk !== !!f.pk || !!n.bk !== !!f.bk)
      out.push(`${label}: changes primary/business key on '${f.name}'`);
    if (
      TIER_RANK[(n.classification ?? "internal") as Tier] <
      TIER_RANK[(f.classification ?? "internal") as Tier]
    )
      out.push(
        `${label}: downgrades classification of '${f.name}' (${f.classification} → ${n.classification})`,
      );
    if (!!n.pii !== !!f.pii || !!n.mnpi !== !!f.mnpi)
      out.push(`${label}: changes PII/MNPI flags on '${f.name}'`);
  }
  return out;
}
