// Mapping and Metadata Platform — Databricks AppKit app entrypoint.
//
// Modes (decided by env, see local-dev.ts):
//   local       — no Databricks: stub WorkspaceClient, MemoryRepo (or any
//                 Postgres via DATABASE_URL). `pnpm --filter @dct/appkit-app dev`
//   databricks  — deployed as a Databricks App: platform OAuth, Lakebase
//                 Postgres via the lakebase() plugin (PGHOST et al. injected).
import { createApp, server, lakebase } from "@databricks/appkit";
import pg from "pg";
import {
  isLocalMode,
  applyLocalEnvDefaults,
  makeStubWorkspaceClient,
} from "./local-dev";
import { MemoryRepo, SqlRepo, type Repo, type SqlExecutor } from "./repo";
import { AppServices } from "./services";
import { mountRoutes } from "./routes";

const local = isLocalMode();
if (local) applyLocalEnvDefaults();
const mode = local ? "local" : "databricks";

// Lakebase plugin only when the platform (or developer) provided Postgres env.
const useLakebasePlugin = !local && !!process.env.PGHOST;

async function pickRepo(appkit?: {
  lakebase?: { query: SqlExecutor["query"] };
}): Promise<Repo> {
  if (useLakebasePlugin && appkit?.lakebase) {
    return new SqlRepo({ query: (t, p) => appkit.lakebase!.query(t, p) });
  }
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    return new SqlRepo({
      query: async (t, p) => {
        const r = await pool.query(t, p as never[]);
        return { rows: r.rows as Record<string, unknown>[] };
      },
    });
  }
  return new MemoryRepo();
}

createApp({
  plugins: useLakebasePlugin ? [server(), lakebase()] : [server()],
  ...(local ? { client: makeStubWorkspaceClient(), disableInternalTelemetry: true } : {}),
  async onPluginsReady(appkit) {
    const repo = await pickRepo(appkit as never);
    await repo.init();
    const services = new AppServices(repo);
    (appkit as unknown as { server: { extend(fn: (a: import("express").Application) => void): void } }).server.extend(
      (app) => mountRoutes(app, services, mode),
    );
    console.log(
      `[dct-appkit] up — mode=${mode} repo=${repo.kind}${useLakebasePlugin ? " (lakebase plugin)" : ""}`,
    );
  },
}).catch((e) => {
  console.error("[dct-appkit] fatal:", e);
  process.exit(1);
});
