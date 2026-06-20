// Reconciler — read the models tree from the Git provider, parse it with the
// engine, project it into the Store. Idempotent; the projection is rebuilt each run.
import { join } from "node:path";
import { parseContract, ROOT as ENGINE_ROOT } from "@dct/engine";
import { createGitProvider, type RepoRef } from "@dct/git-adapter";
import type { Store } from "@dct/projection";
import type { Config, Logger } from "@dct/shared";
import { toSnapshot } from "./mapping";

export async function reconcile(config: Config, store: Store, log?: Logger) {
  const git = createGitProvider(config);
  // default the local models dir to the engine's seed contracts (cwd-independent)
  const modelsDir = config.modelsDir || join(ENGINE_ROOT, "contracts");
  const repo: RepoRef = {
    id: config.gitProvider === "local" ? modelsDir : config.gitlab!.projectId,
    defaultBranch: config.gitlab?.branch ?? "main",
  };
  const { sha, files } = await git.readTree(repo, repo.defaultBranch);
  const contract = parseContract(files);
  const snapshot = toSnapshot(contract, sha);
  await store.applySnapshot(snapshot);
  const result = { sha, models: snapshot.models.length, domains: snapshot.domains.length };
  log?.info("reconciled", result);
  return result;
}
