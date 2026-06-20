// DEAL Control Tower — control-plane API.
// Phase 1: read surfaces. Phase 2: publication. Phase 3: auth (RBAC/ABAC).
// Phase 4: governance (ChangeSets, maker/checker + SoD, immutable audit).
import Fastify, { type FastifyRequest } from "fastify";
import { loadConfig, createLogger } from "@dct/shared";
import { createStore } from "@dct/projection";
import { MemoryAuditLog } from "@dct/audit";
import {
  resolvePrincipal,
  can,
  type AuthConfig,
  type Capability,
  type Principal,
} from "@dct/auth";
import { reconcile } from "./reconcile";
import { GovernanceService, httpErr, type ModelEdit } from "./governance";

const config = loadConfig();
const log = createLogger(config.logLevel);

// Dev-auth is on unless explicitly disabled (production sets DEV_AUTH=false + OIDC).
const authConfig: AuthConfig = {
  devAuth: process.env.DEV_AUTH !== "false",
  oidcIssuer: process.env.OIDC_ISSUER,
};
const ANON_VIEWER: Principal = {
  sub: "anonymous",
  kind: "user",
  roles: ["viewer"],
  domains: ["*"],
  clearance: { maxTier: "public", pii: false, mnpi: false },
};
const now = () => new Date().toISOString();

async function main() {
  const store = createStore(config.databaseUrl);
  await store.init();

  // Bootstrap: build the projection from Git on startup (minimal intervention).
  try {
    await reconcile(config, store, log);
  } catch (e) {
    log.error("initial reconcile failed", String(e));
  }

  const audit = new MemoryAuditLog();
  const governance = new GovernanceService(config, store, audit, now, log);

  const app = Fastify({ logger: false });

  // Resolve the principal for every request (dev-auth headers / API key / OIDC).
  // In dev-auth mode, an unauthenticated request is treated as an anonymous viewer
  // so read surfaces work; writes require real roles (via x-dct-* headers).
  app.decorateRequest("principal", null);
  app.addHook("onRequest", async (req) => {
    const resolved = resolvePrincipal(req.headers, authConfig);
    (req as FastifyRequest & { principal: Principal | null }).principal =
      resolved ?? (authConfig.devAuth ? ANON_VIEWER : null);
  });
  const principalOf = (req: FastifyRequest): Principal | null =>
    (req as FastifyRequest & { principal: Principal | null }).principal;
  const requireCap = (req: FastifyRequest, cap: Capability): Principal => {
    const p = principalOf(req);
    if (!p) throw httpErr(401, "authentication required");
    if (!can(p, cap)) throw httpErr(403, `capability ${cap} required`);
    return p;
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const code = err.statusCode ?? 500;
    if (code >= 500) log.error("request error", String(err));
    reply.code(code).send({ error: err.message, statusCode: code });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => {
    const meta = await store.meta();
    return { ready: meta.modelCount > 0, ...meta, store: store.kind };
  });
  app.get("/api/v1/version", async () => ({
    name: "deal-control-tower",
    api: "v1",
    store: store.kind,
    gitProvider: config.gitProvider,
  }));

  app.get("/api/v1/domains", async (req) => {
    requireCap(req, "catalog:read");
    return { domains: await store.listDomains() };
  });

  app.get("/api/v1/models", async (req) => {
    requireCap(req, "catalog:read");
    const q = req.query as Record<string, string | undefined>;
    const models = await store.listModels({
      kind: q.kind as never,
      domain: q.domain,
      status: q.status,
      q: q.q,
    });
    return { count: models.length, models };
  });

  app.get("/api/v1/models/:kind/:id", async (req, reply) => {
    requireCap(req, "catalog:read");
    const { kind, id } = req.params as { kind: string; id: string };
    const model = await store.getModel(kind, id);
    if (!model) return reply.code(404).send({ error: `unknown model ${kind}/${id}` });
    return model;
  });

  app.get("/api/v1/registry", async (req) => {
    requireCap(req, "catalog:read");
    const models = await store.listModels();
    const counts = models.reduce<Record<string, number>>((a, m) => {
      a[m.kind] = (a[m.kind] ?? 0) + 1;
      return a;
    }, {});
    return { counts, count: models.length, models };
  });

  app.get("/api/v1/search", async (req) => {
    requireCap(req, "catalog:read");
    const q = (req.query as Record<string, string>).q ?? "";
    return { q, results: await store.search(q) };
  });

  // --- publication surfaces (open standards) ---
  app.get("/api/v1/access", async (req) => {
    requireCap(req, "catalog:read");
    return store.getAccess();
  });

  const jsonType = (t: string): string => {
    if (t.startsWith("decimal") || t === "int") return "number";
    if (t === "date") return "string";
    return "string";
  };
  app.get("/api/v1/models/:kind/:id/schema.json", async (req, reply) => {
    const { kind, id } = req.params as { kind: string; id: string };
    const m = await store.getModel(kind, id);
    if (!m) return reply.code(404).send({ error: `unknown model ${kind}/${id}` });
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const f of m.fields) {
      properties[f.name] = {
        type: jsonType(f.type),
        "x-classification": f.classification,
        ...(f.pii ? { "x-pii": true } : {}),
        ...(f.mnpi ? { "x-mnpi": true } : {}),
      };
      if (f.isPk) required.push(f.name);
    }
    return reply
      .header("content-type", "application/schema+json")
      .send({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `dct:model:${kind}:${m.id}@${m.version}`,
        title: m.id,
        type: "object",
        properties,
        required,
      });
  });

  app.get("/.well-known/dct.json", async () => {
    const meta = await store.meta();
    const models = await store.listModels();
    const counts = models.reduce<Record<string, number>>((a, m) => {
      a[m.kind] = (a[m.kind] ?? 0) + 1;
      return a;
    }, {});
    return {
      product: "deal-control-tower",
      api: "v1",
      sourceSha: meta.sourceSha,
      counts,
      capabilities: ["models", "registry", "domains", "search", "access", "schema"],
      endpoints: {
        models: "/api/v1/models",
        registry: "/api/v1/registry",
        access: "/api/v1/access",
        schema: "/api/v1/models/{kind}/{id}/schema.json",
      },
    };
  });

  // --- identity ---
  app.get("/api/v1/whoami", async (req) => {
    const p = principalOf(req);
    if (!p) throw httpErr(401, "authentication required");
    return p;
  });

  // --- governance: ChangeSets (maker/checker + SoD + quorum) ---
  app.post("/api/v1/changesets", async (req) => {
    const p = requireCap(req, "model:propose");
    const body = req.body as { title: string; edits: ModelEdit[] };
    if (!body?.title || !Array.isArray(body?.edits))
      throw httpErr(400, "title and edits[] required");
    return governance.propose(p, body);
  });
  app.get("/api/v1/changesets", async (req) => {
    requireCap(req, "catalog:read");
    return { changesets: governance.list() };
  });
  app.get("/api/v1/changesets/:id", async (req) => {
    requireCap(req, "catalog:read");
    const cs = governance.get((req.params as { id: string }).id);
    if (!cs) throw httpErr(404, "changeset not found");
    return cs;
  });
  app.post("/api/v1/changesets/:id/approve", async (req) => {
    const p = requireCap(req, "change:approve");
    return governance.decide(p, (req.params as { id: string }).id, "approve");
  });
  app.post("/api/v1/changesets/:id/reject", async (req) => {
    const p = requireCap(req, "change:approve");
    return governance.decide(p, (req.params as { id: string }).id, "reject");
  });
  app.post("/api/v1/changesets/:id/merge", async (req) => {
    const p = requireCap(req, "change:merge");
    return governance.merge(p, (req.params as { id: string }).id);
  });

  // --- immutable audit ---
  app.get("/api/v1/audit", async (req) => {
    requireCap(req, "audit:read");
    const q = req.query as Record<string, string | undefined>;
    return {
      events: await audit.list({ actor: q.actor, subject: q.subject, action: q.action }),
      integrity: await audit.verify(),
    };
  });

  // Admin: trigger a reconcile (governance:admin).
  app.post("/admin/reconcile", async (req) => {
    requireCap(req, "governance:admin");
    return reconcile(config, store, log);
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  log.info(`API listening on :${config.port}`, { store: store.kind });
}

main().catch((e) => {
  log.error("fatal", String(e));
  process.exit(1);
});
