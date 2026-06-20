// @dct/shared — config, logging, small cross-cutting helpers.
import { resolve } from "node:path";

export interface Config {
  port: number;
  /** local models repo root (the GitOps source). Defaults to the engine seed. */
  modelsDir: string;
  /** git provider: 'local' (filesystem) or 'gitlab' (REST). */
  gitProvider: "local" | "gitlab";
  gitlab?: { host: string; projectId: string; token: string; branch: string };
  /** when set, use the Postgres projection store; otherwise in-memory. */
  databaseUrl?: string;
  /** default clearance for read endpoints until auth lands (Phase 3). */
  devRole: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4400),
    // empty = let the app resolve the seed models dir via the engine package
    modelsDir: env.MODELS_DIR ? resolve(env.MODELS_DIR) : "",
    gitProvider: (env.GIT_PROVIDER as "local" | "gitlab") ?? "local",
    gitlab:
      env.GITLAB_HOST && env.GITLAB_PROJECT_ID && env.GITLAB_TOKEN
        ? {
            host: env.GITLAB_HOST,
            projectId: env.GITLAB_PROJECT_ID,
            token: env.GITLAB_TOKEN,
            branch: env.GITLAB_BRANCH ?? "main",
          }
        : undefined,
    databaseUrl: env.DATABASE_URL,
    devRole: env.DEV_ROLE ?? "analyst",
    logLevel: (env.LOG_LEVEL as Config["logLevel"]) ?? "info",
  };
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export function createLogger(level: keyof typeof LEVELS = "info") {
  const threshold = LEVELS[level];
  const emit = (lvl: keyof typeof LEVELS, msg: string, extra?: unknown) => {
    if (LEVELS[lvl] < threshold) return;
    console.log(JSON.stringify({ lvl, msg, ...(extra ? { extra } : {}) }));
  };
  return {
    debug: (m: string, e?: unknown) => emit("debug", m, e),
    info: (m: string, e?: unknown) => emit("info", m, e),
    warn: (m: string, e?: unknown) => emit("warn", m, e),
    error: (m: string, e?: unknown) => emit("error", m, e),
  };
}

export type Logger = ReturnType<typeof createLogger>;
