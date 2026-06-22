// Client-side "view as role" masking — the public/private ERD view, expressed in
// DCT's classification model (tier + PII + MNPI). Mirrors the API's access engine
// so the diagram dims/strikes fields a given role may not see.
import { asTier, type Tier } from "./types";

export interface RoleView {
  id: string;
  label: string;
  maxTier: Tier;
  pii: boolean;
  mnpi: boolean;
}

export const ROLE_VIEWS: RoleView[] = [
  { id: "public", label: "Public", maxTier: "public", pii: false, mnpi: false },
  { id: "analyst", label: "Analyst", maxTier: "internal", pii: false, mnpi: false },
  { id: "trader", label: "Trader", maxTier: "confidential", pii: false, mnpi: true },
  { id: "risk", label: "Risk", maxTier: "confidential", pii: true, mnpi: true },
  { id: "compliance", label: "Compliance", maxTier: "restricted", pii: true, mnpi: true },
];

const RANK: Record<Tier, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

export function fieldVisible(
  f: { classification: string; pii: boolean; mnpi: boolean },
  role: RoleView,
): boolean {
  const tier = asTier(f.classification);
  if (RANK[tier] > RANK[role.maxTier]) return false;
  if (f.pii && !role.pii) return false;
  if (f.mnpi && !role.mnpi) return false;
  return true;
}
