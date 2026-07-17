// Local development mode — run the AppKit app with no Databricks workspace.
//
// AppKit's createApp() eagerly builds a WorkspaceClient and calls
// currentUser.me() (see appkit service-context). Locally we inject a stub
// client and pin DATABRICKS_WORKSPACE_ID so no network auth is attempted.
// Deployed on Databricks Apps, none of this runs: the platform injects real
// OAuth and the stub is not used.
import type { WorkspaceClient } from "@databricks/sdk-experimental";

/** True when no Databricks workspace is configured — run fully local. */
export function isLocalMode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_MODE === "local") return true;
  if (env.APP_MODE === "databricks") return false;
  return !env.DATABRICKS_HOST && !env.DATABRICKS_CLIENT_ID;
}

/** Env defaults that let AppKit boot offline. Call before createApp(). */
export function applyLocalEnvDefaults(env: NodeJS.ProcessEnv = process.env): void {
  env.DATABRICKS_WORKSPACE_ID ??= "0"; // short-circuits workspace-id lookup
  env.NODE_ENV ??= "development";
}

/** Minimal WorkspaceClient stub — only what createApp() touches at boot. */
export function makeStubWorkspaceClient(): WorkspaceClient {
  const stub = {
    currentUser: {
      me: async () => ({
        id: "local-dev",
        userName: "local-dev@example.invalid",
        displayName: "Local Development",
      }),
    },
  };
  return stub as unknown as WorkspaceClient;
}
