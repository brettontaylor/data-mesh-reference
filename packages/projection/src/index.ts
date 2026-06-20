export * from "./types";
export * from "./store";
export { MemoryStore } from "./memory-store";
export { PostgresStore } from "./postgres-store";

import type { Store } from "./store";
import { MemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";

/** Pick the store implementation: Postgres when a connection string is given,
 *  otherwise the in-memory projection (default; Docker-free local/CI). */
export function createStore(databaseUrl?: string): Store {
  return databaseUrl ? new PostgresStore(databaseUrl) : new MemoryStore();
}
