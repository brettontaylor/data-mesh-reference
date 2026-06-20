// @dct/git-adapter — Git is the system of record (ADR-001).
// This interface abstracts the Git provider so the core never couples to a vendor.
// First concrete implementation: GitLab. A `local` (bare repo) impl backs CI/demos.
// Phase 1 implements `local` + `gitlab`; GitHub/ADO/Bitbucket follow.

export interface RepoRef {
  /** logical models-repo id (supports multiple repos, e.g. per region) */
  id: string;
  defaultBranch: string;
}

export interface FileChange {
  path: string;
  /** new content; omit to delete */
  content?: string;
}

export interface CommitOpts {
  branch: string;
  message: string;
  author: { name: string; email: string };
  sign?: boolean;
}

export interface PullRequest {
  id: string;
  url: string;
  branch: string;
  status: "open" | "merged" | "closed";
}

/**
 * Provider abstraction. Implementations: LocalGitProvider (bare repo),
 * GitLabProvider (REST), and later GitHub/AzureDevOps/Bitbucket.
 */
export interface GitProvider {
  readonly id: string; // 'local' | 'gitlab' | ...

  /** Read the tree at a ref (branch/sha) — used by the reconciler. */
  readTree(repo: RepoRef, ref: string): Promise<{ sha: string; files: { path: string; content: string }[] }>;

  /** Current head sha of a branch. */
  headSha(repo: RepoRef, branch: string): Promise<string>;

  /** Create a branch from a base. */
  createBranch(repo: RepoRef, name: string, fromRef: string): Promise<void>;

  /** Commit a set of changes to a branch (signed if requested). */
  commit(repo: RepoRef, changes: FileChange[], opts: CommitOpts): Promise<string /* sha */>;

  /** Open a pull/merge request. */
  openPullRequest(repo: RepoRef, opts: { branch: string; title: string; body: string; reviewers?: string[] }): Promise<PullRequest>;

  /** Merge an approved PR (server-side gate re-verified before calling). */
  mergePullRequest(repo: RepoRef, prId: string): Promise<string /* merge sha */>;

  /** Verify a webhook signature (merge events drive incremental reconcile). */
  verifyWebhook(headers: Record<string, string>, body: string): boolean;
}

// --- Phase 1 implementations (skeletons) -----------------------------------
// export class LocalGitProvider implements GitProvider { /* bare repo via isomorphic-git */ }
// export class GitLabProvider implements GitProvider { /* GitLab REST API */ }

export {};
