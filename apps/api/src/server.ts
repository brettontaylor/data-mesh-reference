// DEAL Control Tower — control-plane API (Phase 1: read surfaces over the projection).
import Fastify from "fastify";
import { loadConfig, createLogger } from "@dct/shared";
import { createStore } from "@dct/projection";
import { reconcile } from "./reconcile";

const config = loadConfig();
const log = createLogger(config.logLevel);

async function main() {
  const store = createStore(config.databaseUrl);
  await store.init();

  // Bootstrap: build the projection from Git on startup (minimal intervention).
  try {
    await reconcile(config, store, log);
  } catch (e) {
    log.error("initial reconcile failed", String(e));
  }

  const app = Fastify({ logger: false });

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

  app.get("/api/v1/domains", async () => ({ domains: await store.listDomains() }));

  app.get("/api/v1/models", async (req) => {
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
    const { kind, id } = req.params as { kind: string; id: string };
    const model = await store.getModel(kind, id);
    if (!model) return reply.code(404).send({ error: `unknown model ${kind}/${id}` });
    return model;
  });

  app.get("/api/v1/registry", async () => {
    const models = await store.listModels();
    const counts = models.reduce<Record<string, number>>((a, m) => {
      a[m.kind] = (a[m.kind] ?? 0) + 1;
      return a;
    }, {});
    return { counts, count: models.length, models };
  });

  app.get("/api/v1/search", async (req) => {
    const q = (req.query as Record<string, string>).q ?? "";
    return { q, results: await store.search(q) };
  });

  // --- publication surfaces (open standards) ---
  app.get("/api/v1/access", async () => store.getAccess());

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

  // Admin: trigger a reconcile (Phase 4 secures this; Phase 1 is open for dev).
  app.post("/admin/reconcile", async () => reconcile(config, store, log));

  await app.listen({ port: config.port, host: "0.0.0.0" });
  log.info(`API listening on :${config.port}`, { store: store.kind });
}

main().catch((e) => {
  log.error("fatal", String(e));
  process.exit(1);
});
