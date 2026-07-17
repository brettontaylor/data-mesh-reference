// Access management — the registry + validation surface behind the Access panel.
//
// Local/dev: users come from the demo persona registry below (the same set the
// UI persona switcher offers). Deployed: swap `listUsers()` for the corporate
// IdP group feed (SCIM/OIDC claims → roles/domains); the shapes stay identical.
import {
  capabilitiesFor,
  clearanceFor,
  can,
  inDomain,
  type Capability,
  type Principal,
  type Role,
} from "@dct/auth";
import type { Contract } from "@dct/engine";

export const ALL_ROLES: Role[] = [
  "viewer",
  "modeler",
  "steward",
  "domain_owner",
  "platform_engineer",
  "governance",
  "chief_data_architect",
  "architecture_review_board",
  "admin",
];

export const ALL_CAPABILITIES: Capability[] = [
  "catalog:read",
  "model:propose",
  "change:approve",
  "change:signoff",
  "change:merge",
  "pipeline:deploy",
  "governance:admin",
  "audit:read",
  "admin",
];

export interface UserRecord {
  sub: string;
  label: string;
  roles: Role[];
  domains: string[];
}

/** Demo persona registry — mirrors the UI switcher. IdP feed in production. */
export const USERS: UserRecord[] = [
  { sub: "viewer", label: "Viewer (read-only)", roles: ["viewer"], domains: ["*"] },
  { sub: "alice", label: "Alice — Modeler", roles: ["modeler"], domains: ["*"] },
  { sub: "bob", label: "Bob — Steward (reference)", roles: ["steward"], domains: ["reference"] },
  { sub: "frank", label: "Frank — Steward (trading)", roles: ["steward"], domains: ["trading"] },
  { sub: "carol", label: "Carol — Domain Owner", roles: ["domain_owner"], domains: ["reference", "trading"] },
  { sub: "dana", label: "Dana — Chief Data Architect", roles: ["chief_data_architect"], domains: ["*"] },
  { sub: "pat", label: "Pat — Platform Engineer", roles: ["platform_engineer"], domains: ["*"] },
];

export function toPrincipal(u: UserRecord): Principal {
  return {
    sub: u.sub,
    kind: "user",
    roles: u.roles,
    domains: u.domains,
    clearance: clearanceFor(u.roles),
  };
}

/** The full panel payload: workflow RBAC + data clearance + domain routing. */
export function accessOverview(c: Contract) {
  return {
    // workflow roles → capabilities + implied data clearance
    roles: ALL_ROLES.map((role) => ({
      role,
      capabilities: [...capabilitiesFor([role])],
      clearance: clearanceFor([role]),
    })),
    capabilities: ALL_CAPABILITIES,
    // registered users (demo personas locally; IdP feed when deployed)
    users: USERS.map((u) => ({
      ...u,
      capabilities: [...capabilitiesFor(u.roles)],
      clearance: clearanceFor(u.roles),
    })),
    // data-clearance roles from the governed access model (contracts/access.yaml)
    dataAccessModel: c.access,
    // two-tier approval policy, stated as data so the panel can render it
    approvalPolicy: {
      tier1: {
        label: "Tier 1 — minor change",
        requires: "change:approve",
        routing: "approver must be in every owning domain of the changeset",
      },
      tier2: {
        label: "Tier 2 — impactful/breaking change",
        requires: "change:signoff",
        routing: "chief data architect / architecture review board (enterprise-wide)",
      },
      merge: { requires: "change:merge" },
      segregationOfDuties: "author can never approve, sign off, or reject their own changeset",
    },
  };
}

/** Interactive validator: can `sub` exercise `capability` (in `domain`)? */
export function checkAccess(
  sub: string,
  capability: Capability,
  domain?: string,
): { allowed: boolean; reasons: string[] } {
  const u = USERS.find((x) => x.sub === sub);
  if (!u) return { allowed: false, reasons: [`unknown user '${sub}'`] };
  const p = toPrincipal(u);
  const reasons: string[] = [];

  const hasCap = can(p, capability);
  reasons.push(
    hasCap
      ? `roles [${u.roles.join(", ")}] grant ${capability}`
      : `roles [${u.roles.join(", ")}] do NOT grant ${capability}`,
  );

  let domainOk = true;
  if (domain) {
    domainOk = inDomain(p, domain);
    reasons.push(
      domainOk
        ? `domain scope [${u.domains.join(", ")}] covers '${domain}'`
        : `domain scope [${u.domains.join(", ")}] does NOT cover '${domain}'`,
    );
  }

  return { allowed: hasCap && domainOk, reasons };
}
