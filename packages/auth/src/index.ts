// @dct/auth — identity, RBAC, and ABAC clearance (Phase 3).
// Production: OIDC/SAML via the corporate IdP. Tested path here: a dev-auth mode
// (impersonation headers) so the whole governance loop is verifiable without an
// IdP. API keys / service principals supported too.

export type Capability =
  | "catalog:read"
  | "model:propose"
  | "change:approve"
  | "change:merge"
  | "pipeline:deploy"
  | "governance:admin"
  | "audit:read"
  | "admin";

export type Role =
  | "viewer"
  | "modeler"
  | "steward"
  | "domain_owner"
  | "platform_engineer"
  | "governance"
  | "admin";

export interface Clearance {
  maxTier: "public" | "internal" | "confidential" | "restricted";
  pii: boolean;
  mnpi: boolean;
}

export interface Principal {
  sub: string;
  kind: "user" | "service";
  roles: Role[];
  domains: string[]; // '*' = all
  clearance: Clearance;
}

const ROLE_CAPS: Record<Role, Capability[]> = {
  viewer: ["catalog:read"],
  modeler: ["catalog:read", "model:propose"],
  steward: ["catalog:read", "model:propose", "change:approve"],
  domain_owner: ["catalog:read", "model:propose", "change:approve", "change:merge"],
  platform_engineer: ["catalog:read", "pipeline:deploy"],
  governance: ["catalog:read", "change:approve", "governance:admin", "audit:read"],
  admin: [
    "catalog:read", "model:propose", "change:approve", "change:merge",
    "pipeline:deploy", "governance:admin", "audit:read", "admin",
  ],
};

const ROLE_CLEARANCE: Record<Role, Clearance> = {
  viewer: { maxTier: "internal", pii: false, mnpi: false },
  modeler: { maxTier: "internal", pii: false, mnpi: false },
  steward: { maxTier: "confidential", pii: true, mnpi: true },
  domain_owner: { maxTier: "confidential", pii: true, mnpi: true },
  platform_engineer: { maxTier: "confidential", pii: false, mnpi: true },
  governance: { maxTier: "restricted", pii: true, mnpi: true },
  admin: { maxTier: "restricted", pii: true, mnpi: true },
};

const TIER_RANK = { public: 0, internal: 1, confidential: 2, restricted: 3 } as const;

export function clearanceFor(roles: Role[]): Clearance {
  const c: Clearance = { maxTier: "public", pii: false, mnpi: false };
  for (const r of roles) {
    const rc = ROLE_CLEARANCE[r];
    if (!rc) continue;
    if (TIER_RANK[rc.maxTier] > TIER_RANK[c.maxTier]) c.maxTier = rc.maxTier;
    c.pii = c.pii || rc.pii;
    c.mnpi = c.mnpi || rc.mnpi;
  }
  return c;
}

export function capabilitiesFor(roles: Role[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const r of roles) for (const cap of ROLE_CAPS[r] ?? []) caps.add(cap);
  return caps;
}

export function can(principal: Principal, cap: Capability): boolean {
  return capabilitiesFor(principal.roles).has(cap);
}

export function inDomain(principal: Principal, domain: string): boolean {
  return principal.domains.includes("*") || principal.domains.includes(domain);
}

export interface AuthConfig {
  devAuth: boolean; // trust x-dct-* headers (local/CI only)
  apiKeys?: Record<string, Principal>;
  oidcIssuer?: string;
}

function parseRoles(csv: string | undefined): Role[] {
  return (csv ?? "viewer").split(",").map((s) => s.trim()).filter(Boolean) as Role[];
}

export function resolvePrincipal(
  headers: Record<string, string | string[] | undefined>,
  config: AuthConfig,
): Principal | null {
  const h = (k: string) => {
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };

  if (config.devAuth && h("x-dct-user")) {
    const roles = parseRoles(h("x-dct-roles"));
    return {
      sub: h("x-dct-user")!,
      kind: "user",
      roles,
      domains: (h("x-dct-domains") ?? "*").split(",").map((s) => s.trim()),
      clearance: clearanceFor(roles),
    };
  }

  const auth = h("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    if (config.apiKeys?.[token]) return config.apiKeys[token];
    // Production: verify JWT against config.oidcIssuer, map groups→roles. Needs an IdP.
  }
  return null;
}
