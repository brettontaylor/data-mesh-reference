// Headless reconcile (no server) — verify the spine end to end.
import { loadConfig, createLogger } from "@dct/shared";
import { createStore } from "@dct/projection";
import { reconcile } from "./reconcile";

const config = loadConfig();
const log = createLogger(config.logLevel);
const store = createStore(config.databaseUrl);
await store.init();
const result = await reconcile(config, store, log);
const models = await store.listModels();
const domains = await store.listDomains();
console.log(
  JSON.stringify(
    {
      result,
      store: store.kind,
      domains,
      sample: models.slice(0, 4).map((m) => ({
        kind: m.kind,
        id: m.id,
        version: m.version,
        domain: m.domain,
        fields: m.fields.length,
      })),
    },
    null,
    2,
  ),
);
await store.close();
