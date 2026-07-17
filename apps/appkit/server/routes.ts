// REST surface mounted onto the AppKit Express server via appkit.server.extend().
// Mirrors the shape of the apps/api control-plane routes so a future
// consolidation is mechanical.
import type { Application, Request, Response } from "express";
import express from "express";
import { resolvePrincipal, type AuthConfig, type Principal } from "@dct/auth";
import { HttpError, type AppServices, type AssetKind, ASSET_KINDS } from "./services";

const AUTH: AuthConfig = {
  devAuth: process.env.DEV_AUTH !== "false",
  oidcIssuer: process.env.OIDC_ISSUER,
};

/** Anonymous read-only principal (dev-auth mode) — same policy as apps/api. */
const ANON_VIEWER: Principal = {
  sub: "anonymous",
  kind: "user",
  roles: ["viewer"],
  domains: ["*"],
  clearance: { maxTier: "public", pii: false, mnpi: false },
};

/**
 * Resolve the caller. Order:
 *  1. dev-auth headers (x-dct-user / x-dct-roles) — local development
 *  2. Databricks Apps forwarded identity (x-forwarded-email / x-forwarded-user)
 *     — deployed; roles come from x-dct-roles if the reverse proxy adds them,
 *     otherwise the configurable APP_DEFAULT_ROLES (default: modeler).
 *  3. anonymous viewer (dev-auth only)
 */
function principalOf(req: Request): Principal | null {
  const direct = resolvePrincipal(req.headers, AUTH);
  if (direct) return direct;
  const fwd = req.headers["x-forwarded-email"] ?? req.headers["x-forwarded-user"];
  if (fwd) {
    const sub = Array.isArray(fwd) ? fwd[0]! : fwd;
    const roles = (process.env.APP_DEFAULT_ROLES ?? "modeler")
      .split(",")
      .map((r) => r.trim());
    return resolvePrincipal(
      { "x-dct-user": sub, "x-dct-roles": roles.join(",") },
      { devAuth: true },
    );
  }
  return AUTH.devAuth ? ANON_VIEWER : null;
}

type Handler = (req: Request, p: Principal) => unknown | Promise<unknown>;

export function mountRoutes(app: Application, services: AppServices, mode: "local" | "databricks"): void {
  app.use(express.json({ limit: "1mb" }));

  const route =
    (fn: Handler) =>
    async (req: Request, res: Response): Promise<void> => {
      try {
        const p = principalOf(req);
        if (!p) {
          res.status(401).json({ error: "authentication required" });
          return;
        }
        res.json(await fn(req, p));
      } catch (e) {
        if (e instanceof HttpError) {
          res.status(e.statusCode).json({ error: e.message });
        } else {
          console.error("[dct-appkit] route error:", e);
          res.status(500).json({ error: "internal error" });
        }
      }
    };

  app.get("/api/meta", route((_req, p) => ({ ...services.meta(mode), principal: { sub: p.sub, roles: p.roles } })));

  app.get(
    "/api/assets",
    route((req) => {
      const kind = req.query.kind as AssetKind | undefined;
      if (kind && !ASSET_KINDS.includes(kind)) throw new HttpError(400, `unknown kind ${kind}`);
      return services.listAssets(kind, req.query.q as string | undefined);
    }),
  );
  app.get(
    "/api/assets/:kind/:id",
    route((req) => services.getAsset(req.params.kind as AssetKind, req.params.id as string)),
  );

  app.get("/api/changesets", route(() => services.listChangesets()));
  app.post("/api/changesets", route((req, p) => services.propose(p, req.body)));
  app.post(
    "/api/changesets/:id/approve",
    route((req, p) => services.decide(p, req.params.id as string, "approve")),
  );
  app.post(
    "/api/changesets/:id/reject",
    route((req, p) => services.decide(p, req.params.id as string, "reject")),
  );
  app.post(
    "/api/changesets/:id/merge",
    route((req, p) => services.merge(p, req.params.id as string)),
  );
  app.post(
    "/api/changesets/:id/withdraw",
    route((req, p) => services.withdraw(p, req.params.id as string)),
  );

  app.get("/api/access", route(() => services.access()));
  app.get(
    "/api/access/check",
    route((req) =>
      services.accessCheck(
        String(req.query.sub ?? ""),
        String(req.query.capability ?? ""),
        req.query.domain ? String(req.query.domain) : undefined,
      ),
    ),
  );

  app.get("/api/runs", route(() => services.listRuns()));
  app.post("/api/runs", route((_req, p) => services.triggerRun(p)));

  app.get("/api/products", route(() => services.listProducts()));
  app.post("/api/validate", route((req) => services.validate(req.body)));
  app.get("/api/dq", route(() => services.dqLibrary()));
  app.get("/api/mappings", route(() => services.mappingDocuments()));
  app.get("/api/erd", route(() => services.erdModels()));
  app.get("/api/registry", route(() => services.registry()));
  app.get("/api/domains", route(() => services.domainsOverview()));
  app.get("/api/catalog", route(() => services.catalog()));

  app.get("/api/migration", route(() => services.migration()));
}
