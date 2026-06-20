// The access-control decision engine. Pure and shared — the same logic the
// site uses, so the demo and the toolkit agree exactly.
import type { Classification, Field, Role } from "./types";

const TIER_ORDER: Classification[] = [
  "public",
  "internal",
  "confidential",
  "restricted",
];

export function tierRank(c: Classification): number {
  return TIER_ORDER.indexOf(c);
}

export type AccessReason = "tier" | "pii" | "mnpi";

export interface AccessDecision {
  visible: boolean;
  reasons: AccessReason[]; // why it was masked (empty when visible)
}

/** Decide whether `role` may see attribute `field`. */
export function decide(
  role: Pick<Role, "maxTier" | "pii" | "mnpi">,
  field: Pick<Field, "classification" | "pii" | "mnpi">,
): AccessDecision {
  const reasons: AccessReason[] = [];
  if (tierRank(field.classification) > tierRank(role.maxTier)) reasons.push("tier");
  if (field.pii && !role.pii) reasons.push("pii");
  if (field.mnpi && !role.mnpi) reasons.push("mnpi");
  return { visible: reasons.length === 0, reasons };
}

export const MASK = "•••";
