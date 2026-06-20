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
import { PipelineService } from "./pipelines";
import type { EnvTarget } from "@dct/orchestration-adapter";
import { LineageService } from "./lineage";
import { UnityCatalogConnector, type ModelView } from "@dct/catalog-adapter";
import { EventBus } from "@dct/events";

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
  const databricks =
    process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN
      ? { host: process.env.DATABRICKS_HOST, token: process.env.DATABRICKS_TOKEN }
      : undefined;
  const lineage = new LineageService(store);
  const pipelines = new PipelineService(store, audit, now, log, databricks, (ev) =>
    lineage.ingest(ev as never),
  );
  const uc = new UnityCatalogConnector(databricks);
  const events = new EventBus({ now });

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
    const cs = await governance.propose(p, body);
    const breaking = cs.diff.some((d) => d.change === "major");
    await events.emit({
      type: "change.proposed",
      subject: `dct:changeset:${cs.id}`,
      actor: p.sub,
      payload: { id: cs.id, title: cs.title, breaking, impact: cs.impact, requiresGovernance: cs.requiresGovernance },
    });
    return cs;
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
    const cs = await governance.merge(p, (req.params as { id: string }).id);
    await events.emit({
      type: "change.merged",
      subject: `dct:changeset:${cs.id}`,
      actor: p.sub,
      payload: { id: cs.id, sha: cs.mergedSha, models: cs.edits.map((e) => `${e.kind}:${e.id}`) },
    });
    for (const e of cs.edits)
      await events.emit({
        type: "model.registered",
        subject: `dct:model:${e.kind}:${e.id}`,
        actor: p.sub,
        payload: { version: (e.spec as { version?: string }).version },
      });
    return cs;
  });

  // --- orchestration: pipelines ---
  app.get("/api/v1/pipelines", async (req) => {
    requireCap(req, "catalog:read");
    return { pipelines: await pipelines.list() };
  });
  app.get("/api/v1/pipelines/:id/runs", async (req) => {
    requireCap(req, "catalog:read");
    return { runs: await pipelines.runsFor((req.params as { id: string }).id) };
  });
  app.post("/api/v1/pipelines/:id/deploy", async (req) => {
    const p = requireCap(req, "pipeline:deploy");
    const env = ((req.query as Record<string, string>).env ?? "dev") as EnvTarget;
    const approver = (req.headers["x-dct-approver"] as string) || undefined;
    return pipelines.deploy(p, (req.params as { id: string }).id, env, approver);
  });
  app.post("/api/v1/pipelines/:id/trigger", async (req) => {
    const p = requireCap(req, "pipeline:deploy");
    const env = ((req.query as Record<string, string>).env ?? "dev") as EnvTarget;
    const run = await pipelines.trigger(p, (req.params as { id: string }).id, env);
    await events.emit({
      type: "pipeline.run.completed",
      subject: `dct:pipeline:${run.pipelineId}`,
      actor: p.sub,
      payload: { runId: run.id, status: run.status, env, ...run.metrics },
    });
    return run;
  });

  // --- events & webhooks (Phase 7) ---
  app.post("/api/v1/webhooks", async (req) => {
    requireCap(req, "catalog:read");
    const b = req.body as { url: string; secret: string; events?: string[] };
    if (!b?.url || !b?.secret) throw httpErr(400, "url and secret required");
    return events.subscribe({ url: b.url, secret: b.secret, events: b.events ?? ["*"] });
  });
  app.get("/api/v1/webhooks", async (req) => {
    requireCap(req, "catalog:read");
    return { webhooks: events.subscriptions() };
  });
  app.get("/api/v1/events", async (req) => {
    requireCap(req, "catalog:read");
    const since = (req.query as Record<string, string>).since;
    return { events: events.list(since) };
  });
  app.get("/api/v1/webhooks/dlq", async (req) => {
    requireCap(req, "governance:admin");
    return { deadLetters: events.deadLetters() };
  });
  app.post("/api/v1/webhooks/dlq/:id/replay", async (req) => {
    requireCap(req, "governance:admin");
    return events.replay((req.params as { id: string }).id);
  });

  // --- lineage (column-level, static + observed) ---
  app.get("/api/v1/lineage", async (req) => {
    requireCap(req, "catalog:read");
    return lineage.graph();
  });
  app.get("/api/v1/lineage/node", async (req) => {
    requireCap(req, "catalog:read");
    const q = req.query as Record<string, string | undefined>;
    if (!q.urn) throw httpErr(400, "urn query param required");
    const dir = (q.direction as "upstream" | "downstream") ?? "upstream";
    return lineage.traverse(q.urn, dir, q.depth ? Number(q.depth) : 10);
  });
  app.get("/api/v1/lineage/impact/:entity", async (req) => {
    requireCap(req, "catalog:read");
    return { entity: (req.params as { entity: string }).entity, impacted: await lineage.impact((req.params as { entity: string }).entity) };
  });

  // --- Unity Catalog sync (plan is workspace-free; apply needs creds) ---
  app.get("/api/v1/uc/plan", async (req) => {
    requireCap(req, "catalog:read");
    const env = ((req.query as Record<string, string>).env ?? "dev") as EnvTarget;
    const bdms = await store.listModels({ kind: "bdm" });
    const models: ModelView[] = bdms.map((m) => ({
      kind: m.kind,
      id: m.id,
      domain: m.domain,
      owner: m.owner,
      table: `GOLD.${m.id.toUpperCase()}`,
      fields: m.fields.map((f) => ({
        name: f.name, type: f.type, classification: f.classification,
        pii: f.pii, mnpi: f.mnpi, isPk: f.isPk,
      })),
    }));
    return uc.plan({ env, models });
  });
  app.post("/api/v1/uc/apply", async (req) => {
    requireCap(req, "governance:admin");
    return uc.apply(); // applies the plan via the Databricks SDK; needs a workspace
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
