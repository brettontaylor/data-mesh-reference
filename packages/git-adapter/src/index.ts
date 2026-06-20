// @dct/git-adapter — Git is the system of record (ADR-001).
// Interface + implementations: LocalGitProvider (filesystem; CI/demo/dev) and
// GitLabProvider (REST; the chosen provider). GitHub/ADO/Bitbucket follow later.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

export interface RepoRef {
  /** for local: absolute path to the models repo root; for gitlab: logical id */
  id: string;
  defaultBranch: string;
}

export interface TreeFile {
  path: string; // relative to repo root, POSIX separators
  content: string;
}

export interface FileChange {
  path: string;
  content?: string; // omit to delete
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

export interface GitProvider {
  readonly id: string;
  readTree(repo: RepoRef, ref: string): Promise<{ sha: string; files: TreeFile[] }>;
  headSha(repo: RepoRef, branch: string): Promise<string>;
  createBranch(repo: RepoRef, name: string, fromRef: string): Promise<void>;
  commit(repo: RepoRef, changes: FileChange[], opts: CommitOpts): Promise<string>;
  openPullRequest(
    repo: RepoRef,
    opts: { branch: string; title: string; body: string; reviewers?: string[] },
  ): Promise<PullRequest>;
  mergePullRequest(repo: RepoRef, prId: string): Promise<string>;
  verifyWebhook(headers: Record<string, string>, body: string): boolean;
}

function contentSha(files: TreeFile[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path);
    h.update("\0");
    h.update(f.content);
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

const NOT_IMPL = (op: string) =>
  new Error(`LocalGitProvider.${op} is not implemented in Phase 1 (write path lands in Phase 4)`);

/** Filesystem-backed provider. Reads a directory as the models tree. */
export class LocalGitProvider implements GitProvider {
  readonly id = "local";

  async readTree(repo: RepoRef): Promise<{ sha: string; files: TreeFile[] }> {
    const root = repo.id;
    const files: TreeFile[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ya?ml|json)$/.test(entry)) {
          files.push({
            path: relative(root, full).split(sep).join("/"),
            content: readFileSync(full, "utf8"),
          });
        }
      }
    };
    walk(root);
    return { sha: contentSha(files), files };
  }

  async headSha(repo: RepoRef): Promise<string> {
    return (await this.readTree(repo)).sha;
  }

  async createBranch(): Promise<void> {
    throw NOT_IMPL("createBranch");
  }
  async commit(): Promise<string> {
    throw NOT_IMPL("commit");
  }
  async openPullRequest(): Promise<PullRequest> {
    throw NOT_IMPL("openPullRequest");
  }
  async mergePullRequest(): Promise<string> {
    throw NOT_IMPL("mergePullRequest");
  }
  verifyWebhook(): boolean {
    return true; // local has no webhooks
  }
}

export interface GitLabConfig {
  host: string; // e.g. https://gitlab.example.com
  projectId: string; // numeric or url-encoded path
  token: string;
  webhookSecret?: string;
}

/** GitLab REST provider (the chosen provider). Read path implemented; write path
 *  (branch/commit/MR) lands in Phase 4 using the same REST API. */
export class GitLabProvider implements GitProvider {
  readonly id = "gitlab";
  constructor(private cfg: GitLabConfig) {}

  private api(path: string) {
    return `${this.cfg.host}/api/v4/projects/${encodeURIComponent(this.cfg.projectId)}${path}`;
  }
  private headers() {
    return { "PRIVATE-TOKEN": this.cfg.token };
  }

  async readTree(repo: RepoRef, ref: string): Promise<{ sha: string; files: TreeFile[] }> {
    const branch = ref || repo.defaultBranch;
    const files: TreeFile[] = [];
    let page = 1;
    // paginate the recursive tree
    for (;;) {
      const res = await fetch(
        this.api(`/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(branch)}`),
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`GitLab tree ${res.status}`);
      const items = (await res.json()) as { type: string; path: string }[];
      if (items.length === 0) break;
      for (const it of items) {
        if (it.type !== "blob" || !/\.(ya?ml|json)$/.test(it.path)) continue;
        const raw = await fetch(
          this.api(`/repository/files/${encodeURIComponent(it.path)}/raw?ref=${encodeURIComponent(branch)}`),
          { headers: this.headers() },
        );
        if (!raw.ok) throw new Error(`GitLab raw ${it.path} ${raw.status}`);
        files.push({ path: it.path, content: await raw.text() });
      }
      const next = res.headers.get("x-next-page");
      if (!next) break;
      page = Number(next);
    }
    return { sha: await this.headSha(repo, branch), files };
  }

  async headSha(repo: RepoRef, branch: string): Promise<string> {
    const res = await fetch(
      this.api(`/repository/branches/${encodeURIComponent(branch || repo.defaultBranch)}`),
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`GitLab branch ${res.status}`);
    const b = (await res.json()) as { commit: { id: string } };
    return b.commit.id;
  }

  // Write path (Phase 4): createBranch → commit (POST /repository/commits) →
  // openMergeRequest (POST /merge_requests) → merge (PUT /merge_requests/:iid/merge).
  async createBranch(): Promise<void> {
    throw new Error("GitLabProvider write path lands in Phase 4");
  }
  async commit(): Promise<string> {
    throw new Error("GitLabProvider write path lands in Phase 4");
  }
  async openPullRequest(): Promise<PullRequest> {
    throw new Error("GitLabProvider write path lands in Phase 4");
  }
  async mergePullRequest(): Promise<string> {
    throw new Error("GitLabProvider write path lands in Phase 4");
  }
  verifyWebhook(headers: Record<string, string>): boolean {
    if (!this.cfg.webhookSecret) return false;
    return headers["x-gitlab-token"] === this.cfg.webhookSecret;
  }
}

export function createGitProvider(cfg: {
  gitProvider: "local" | "gitlab";
  gitlab?: { host: string; projectId: string; token: string };
}): GitProvider {
  if (cfg.gitProvider === "gitlab") {
    if (!cfg.gitlab) throw new Error("gitlab config required for GIT_PROVIDER=gitlab");
    return new GitLabProvider(cfg.gitlab);
  }
  return new LocalGitProvider();
}
