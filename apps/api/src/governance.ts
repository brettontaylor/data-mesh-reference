// Governance service (Phase 4): ChangeSets, gates, maker/checker + SoD + quorum,
// merge → write models → reconcile → re-register → immutable audit.
import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  parseContract,
  buildModels,
  hashSurface,
  severity,
  bumpKind,
  levelRank,
  nextVersion,
  checkContract,
  type Contract,
  type Entity,
} from "@dct/engine";
import { createGitProvider, type RepoRef } from "@dct/git-adapter";
import type { Store } from "@dct/projection";
import type { AuditLog } from "@dct/audit";
import type { Config, Logger } from "@dct/shared";
import { can, inDomain, type Principal } from "@dct/auth";
import { reconcile } from "./reconcile";

export type ModelEditKind =
  | "bdm" | "pdm" | "semantic" | "mapping" | "dq" | "extract" | "transformation" | "refmap";
export interface ModelEdit {
  kind: ModelEditKind;
  id: string;
  spec: Record<string, unknown>; // full new model definition
}

interface Gate {
  name: string;
  ok: boolean;
  detail?: string;
}
interface DiffEntry {
  kind: string;
  id: string;
  change: string; // none|patch|minor|major
  fromVersion: string | null;
  toVersion: string;
  requiredBump: string;
  declaredBump: string;
}
interface Approval {
  approver: string;
  roles: string[];
  decision: "approve" | "reject";
  ts: string;
}
export interface ChangeSet {
  id: string;
  title: string;
  author: string;
  status: "in_review" | "approved" | "merged" | "rejected";
  edits: ModelEdit[];
  diff: DiffEntry[];
  gates: Gate[];
  impact: string[];
  requiresGovernance: boolean;
  requiresEnterpriseSignoff: boolean; // federated routing → CDA / ARB sign-off
  requiredApprovals: number;
  approvals: Approval[];
  createdAt: string;
  mergedSha?: string;
}

const TIER_RANK: Record<string, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3,
};

const DIRS: Record<ModelEditKind, string> = {
  bdm: "bdm", pdm: "pdm", semantic: "semantic", mapping: "mappings", dq: "dq", extract: "extracts",
  transformation: "transformations", refmap: "refmaps",
};
const idField: Record<ModelEditKind, string> = {
  bdm: "entity", pdm: "pdm", semantic: "semanticModel", mapping: "mapping", dq: "dqRuleSet", extract: "extract",
  transformation: "transformation", refmap: "refmap",
};

export class GovernanceService {
  private changeSets = new Map<string, ChangeSet>();

  constructor(
    private config: Config,
    private store: Store,
    private audit: AuditLog,
    private now: () => string,
    private log?: Logger,
  ) {}

  private modelsDir() {
    return this.config.modelsDir || join(process.cwd(), "packages/engine/contracts");
  }

  private async currentTree(): Promise<{ sha: string; files: { path: string; content: string }[] }> {
    const git = createGitProvider(this.config);
    const repo: RepoRef = {
      id: this.config.gitProvider === "local" ? this.modelsDir() : this.config.gitlab!.projectId,
      defaultBranch: this.config.gitlab?.branch ?? "main",
    };
    return git.readTree(repo, repo.defaultBranch);
  }

  private loadLock(): Record<string, { version: string; surface: Record<string, unknown> }> {
    const p = join(this.modelsDir(), "registry.lock.json");
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8")).models ?? {};
  }

  private applyEdits(contract: Contract, edits: ModelEdit[]): Contract {
    const next: Contract = JSON.parse(JSON.stringify(contract));
    for (const e of edits) {
      const arr =
        e.kind === "bdm" ? next.entities
        : e.kind === "pdm" ? next.pdms
        : e.kind === "semantic" ? next.semanticModels
        : e.kind === "mapping" ? next.mappings
        : e.kind === "dq" ? next.dqRuleSets
        : e.kind === "extract" ? next.extracts
        : e.kind === "transformation" ? next.transformations
        : next.refMaps;
      const list = arr as unknown as Record<string, unknown>[];
      const key = idField[e.kind];
      const idx = list.findIndex((m) => m[key] === e.id);
      if (idx >= 0) list[idx] = e.spec;
      else list.push(e.spec);
    }
    return next;
  }

  /** Detect a change that demands a separate governance approval. */
  private sensitivityEscalation(current: Contract, edits: ModelEdit[]): boolean {
    for (const e of edits) {
      if (e.kind !== "bdm") continue;
      const oldE = current.entities.find((x) => x.entity === e.id);
      const newFields = (e.spec.fields as Entity["fields"]) ?? [];
      for (const nf of newFields) {
        const of = oldE?.fields.find((x) => x.name === nf.name);
        if (nf.pii && !of?.pii) return true;
        if (nf.mnpi && !of?.mnpi) return true;
        if (of && TIER_RANK[nf.classification]! < TIER_RANK[of.classification]!) return true; // loosened
      }
    }
    return false;
  }

  async propose(principal: Principal, input: { title: string; edits: ModelEdit[] }): Promise<ChangeSet> {
    if (!can(principal, "model:propose")) throw httpErr(403, "model:propose required");
    const { files } = await this.currentTree();
    const current = parseContract(files);
    const proposed = this.applyEdits(current, input.edits);
    const lock = this.loadLock();
    const built = buildModels(proposed);
    const builtById = new Map(built.map((m) => [`${m.kind}:${m.id}`, m]));

    // diff + version gate
    const diff: DiffEntry[] = [];
    const gates: Gate[] = [];
    for (const e of input.edits) {
      const m = builtById.get(`${e.kind}:${e.id}`)!;
      const prev = lock[e.id];
      const required = prev ? severity(prev.surface as never, m.surface) : "minor";
      const declared = prev ? bumpKind(prev.version, m.version) : "minor";
      diff.push({
        kind: e.kind, id: e.id, change: required,
        fromVersion: prev?.version ?? null, toVersion: m.version,
        requiredBump: required, declaredBump: String(declared),
      });
      if (prev) {
        if (declared === "decrease")
          gates.push({ name: `semver:${e.id}`, ok: false, detail: `version decreased ${prev.version}→${m.version}` });
        else if (required !== "none" && (declared === "none" || (declared !== "invalid" && levelRank(declared as never) < levelRank(required as never))))
          gates.push({ name: `semver:${e.id}`, ok: false, detail: `${required} change needs >= ${nextVersion(prev.version, required)}, got ${m.version}` });
        else gates.push({ name: `semver:${e.id}`, ok: true });
      }
    }

    // structural / classification / referential integrity
    const contractIssues = checkContract(proposed).filter((i) => i.level === "error");
    gates.push({
      name: "contract",
      ok: contractIssues.length === 0,
      detail: contractIssues.map((i) => `[${i.code}] ${i.message}`).join("; ") || undefined,
    });

    // impact: who depends on the edited models
    const editedIds = new Set(input.edits.map((e) => e.id));
    const impact = built
      .filter((m) => m.dependsOn.some((d) => editedIds.has(d.split(":")[1] ?? "")))
      .map((m) => `${m.kind}:${m.id}`);

    const requiresGovernance = this.sensitivityEscalation(current, input.edits);
    const maxSeverity = diff.reduce((acc, d) => Math.max(acc, levelRank(d.requiredBump as never)), 0);
    const isMajor = maxSeverity >= 3;
    // Federated routing (FR-FG-021): CDA / ARB enterprise sign-off is required when a
    // change touches a BDM, is breaking/major, introduces a new entity, or alters
    // classification (cross-domain & shared-scope add further triggers as the model grows).
    const anyBdm = input.edits.some((e) => e.kind === "bdm");
    const currentIds = new Set([
      ...current.entities.map((e) => e.entity),
      ...current.pdms.map((p) => p.pdm),
      ...current.semanticModels.map((s) => s.semanticModel),
      ...(current.mappings ?? []).map((m) => m.mapping),
      ...(current.dqRuleSets ?? []).map((d) => d.dqRuleSet),
      ...(current.extracts ?? []).map((x) => x.extract),
      ...(current.transformations ?? []).map((t) => t.transformation),
      ...(current.refMaps ?? []).map((r) => r.refmap),
    ]);
    const newEntity = input.edits.some((e) => !currentIds.has(e.id));
    const requiresEnterpriseSignoff = anyBdm || isMajor || newEntity || requiresGovernance;
    const requiredApprovals = isMajor ? 2 : 1; // domain-tier quorum

    const cs: ChangeSet = {
      id: randomUUID(),
      title: input.title,
      author: principal.sub,
      status: "in_review",
      edits: input.edits,
      diff,
      gates,
      impact,
      requiresGovernance,
      requiresEnterpriseSignoff,
      requiredApprovals,
      approvals: [],
      createdAt: this.now(),
    };
    this.changeSets.set(cs.id, cs);
    await this.audit.append({
      ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
      action: "change.propose", subject: `dct:changeset:${cs.id}`,
      payload: { title: cs.title, edits: input.edits.map((e) => `${e.kind}:${e.id}`), requiresGovernance, requiresEnterpriseSignoff, requiredApprovals },
    });
    return cs;
  }

  get(id: string): ChangeSet | undefined {
    return this.changeSets.get(id);
  }
  list(): ChangeSet[] {
    return [...this.changeSets.values()];
  }

  async decide(principal: Principal, id: string, decision: "approve" | "reject"): Promise<ChangeSet> {
    const cs = this.changeSets.get(id);
    if (!cs) throw httpErr(404, "changeset not found");
    if (!can(principal, "change:approve")) throw httpErr(403, "change:approve required");
    if (cs.status !== "in_review") throw httpErr(409, `changeset is ${cs.status}`);
    // Segregation of duties: the author cannot approve/reject their own change.
    if (principal.sub === cs.author) throw httpErr(403, "segregation of duties: author cannot approve own change");
    if (decision === "approve" && cs.gates.some((g) => !g.ok))
      throw httpErr(409, "gates are not green");

    cs.approvals = cs.approvals.filter((a) => a.approver !== principal.sub);
    cs.approvals.push({ approver: principal.sub, roles: principal.roles, decision, ts: this.now() });
    await this.audit.append({
      ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
      action: `change.${decision}`, subject: `dct:changeset:${cs.id}`,
    });

    if (decision === "reject") {
      cs.status = "rejected";
    } else {
      const appr = cs.approvals.filter((a) => a.decision === "approve");
      // Tier 1 — domain quorum (stewards / domain owners).
      const domain = appr.filter((a) => a.roles.some((r) => r === "steward" || r === "domain_owner"));
      // Tier 2 — enterprise sign-off (Chief Data Architect / ARB / admin).
      const enterprise = appr.filter((a) =>
        a.roles.some((r) => r === "chief_data_architect" || r === "architecture_review_board" || r === "admin"),
      );
      const hasGovernance = appr.some((a) => a.roles.includes("governance"));
      const met =
        domain.length >= cs.requiredApprovals &&
        (!cs.requiresGovernance || hasGovernance) &&
        (!cs.requiresEnterpriseSignoff || enterprise.length >= 1);
      if (met) cs.status = "approved";
    }
    return cs;
  }

  async merge(principal: Principal, id: string): Promise<ChangeSet> {
    const cs = this.changeSets.get(id);
    if (!cs) throw httpErr(404, "changeset not found");
    if (!can(principal, "change:merge")) throw httpErr(403, "change:merge required");
    if (cs.status !== "approved") throw httpErr(409, `changeset is ${cs.status}, not approved`);
    if (principal.sub === cs.author && !can(principal, "admin"))
      throw httpErr(403, "segregation of duties: author cannot merge own change");

    // 1) write the edited model files to the models repo
    for (const e of cs.edits) {
      const file = join(this.modelsDir(), DIRS[e.kind], `${e.id}.yaml`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, yamlStringify(e.spec), "utf8");
    }
    // 2) re-register the lock from the new tree
    const { sha, files } = await this.currentTree();
    const proposed = parseContract(files);
    const lock = { models: Object.fromEntries(buildModels(proposed).map((m) => [m.id, { version: m.version, surface: m.surface, signature: hashSurface(m.surface) }])) };
    writeFileSync(join(this.modelsDir(), "registry.lock.json"), JSON.stringify(lock, null, 2) + "\n", "utf8");
    // 3) reconcile the projection
    await reconcile(this.config, this.store, this.log);

    cs.status = "merged";
    cs.mergedSha = sha;
    await this.audit.append({
      ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
      action: "change.merge", subject: `dct:changeset:${cs.id}`, payload: { sha },
    });
    for (const e of cs.edits) {
      await this.audit.append({
        ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
        action: "model.registered", subject: `dct:model:${e.kind}:${e.id}`,
        payload: { version: (e.spec as { version?: string }).version },
      });
    }
    return cs;
  }
}

export function httpErr(code: number, message: string): Error & { statusCode: number } {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = code;
  return e;
}
