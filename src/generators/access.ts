// Generate the published access policy: the roles, and a precomputed
// visibility matrix (role × entity.field → visible/masked + reason). This is the
// machine-readable contract the API and semantic layer enforce.
import { decide } from "../framework/access";
import type { Contract } from "../framework/types";
import type { GeneratedFile } from "./databricks";

export function generateAccess(c: Contract): GeneratedFile[] {
  const matrix: Record<string, Record<string, { visible: boolean; reasons: string[] }>> = {};

  for (const role of c.access.roles) {
    const perField: Record<string, { visible: boolean; reasons: string[] }> = {};
    for (const e of c.entities) {
      for (const f of e.fields) {
        const d = decide(role, f);
        perField[`${e.entity}.${f.name}`] = { visible: d.visible, reasons: d.reasons };
      }
    }
    matrix[role.role] = perField;
  }

  const policy = {
    version: c.spec.version,
    model: "attribute-level access control (sensitivity tier + PII + MNPI)",
    defaultRole: c.access.defaultRole,
    roles: c.access.roles,
    tiers: c.spec.classifications,
    matrix,
  };

  return [{ path: "access/policy.json", content: JSON.stringify(policy, null, 2) }];
}
