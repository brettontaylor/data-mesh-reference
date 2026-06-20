// Pipeline service (Phase 5): derive pipelines from the model registry, then
// deploy / trigger / monitor via the orchestration adapter (local or Databricks),
// recording runs and emitting audit + lineage.
import { randomUUID } from "node:crypto";
import {
  createOrchestrator,
  type Orchestrator,
  type EnvTarget,
} from "@dct/orchestration-adapter";
import type { Store } from "@dct/projection";
import type { AuditLog } from "@dct/audit";
import type { Logger } from "@dct/shared";
import { can, type Principal } from "@dct/auth";
import { httpErr } from "./governance";

export interface Pipeline {
  id: string;
  domain: string;
  engine: string;
  cadenceDays: number | null;
  produces: string[];
}
export interface PipelineRun {
  id: string;
  pipelineId: string;
  env: EnvTarget;
  status: string;
  startedAt: string;
  finishedAt: string;
  metrics: { rowsIn?: number; rowsOut?: number; durationMs?: number };
  lineageEvents: number;
  triggeredBy: string;
}

export class PipelineService {
  private orch: Orchestrator;
  private runs: PipelineRun[] = [];
  private deployments = new Map<string, { env: EnvTarget; externalRef: string; by: string; at: string }>();

  constructor(
    private store: Store,
    private audit: AuditLog,
    private now: () => string,
    private log?: Logger,
    databricks?: { host: string; token: string },
  ) {
    this.orch = createOrchestrator(databricks ? { databricks } : undefined);
  }

  async list(): Promise<Pipeline[]> {
    const sources = await this.store.listModels({ kind: "source" });
    return sources.map((s) => ({
      id: s.id,
      domain: s.domain,
      engine: this.orch.id,
      cadenceDays: (s.detail.cadenceDays as number | null) ?? null,
      produces: (s.detail.produces as string[]) ?? [],
    }));
  }

  private async get(id: string): Promise<Pipeline> {
    const p = (await this.list()).find((x) => x.id === id);
    if (!p) throw httpErr(404, `unknown pipeline ${id}`);
    return p;
  }

  async deploy(principal: Principal, id: string, env: EnvTarget, approver?: string) {
    if (!can(principal, "pipeline:deploy")) throw httpErr(403, "pipeline:deploy required");
    const pipeline = await this.get(id);
    // Four-eyes on production: a distinct approver must sign off.
    if (env === "prod" && !can(principal, "admin")) {
      if (!approver || approver === principal.sub)
        throw httpErr(403, "production deploy requires a distinct approver (four-eyes)");
    }
    const meta = await this.store.meta();
    const spec = { id, domain: pipeline.domain, sourceSha: meta.sourceSha ?? "", assets: {} };
    const plan = await this.orch.plan(spec, env);
    const ref = await this.orch.deploy(plan);
    this.deployments.set(`${id}:${env}`, { env, externalRef: ref.externalRef, by: principal.sub, at: this.now() });
    await this.audit.append({
      ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
      action: "pipeline.deploy", subject: `dct:pipeline:${id}`, payload: { env, externalRef: ref.externalRef, approver },
    });
    return { pipelineId: id, env, externalRef: ref.externalRef, engine: this.orch.id };
  }

  async trigger(principal: Principal, id: string, env: EnvTarget = "dev"): Promise<PipelineRun> {
    if (!can(principal, "pipeline:deploy")) throw httpErr(403, "pipeline:deploy required");
    const pipeline = await this.get(id);
    const meta = await this.store.meta();
    const spec = { id, domain: pipeline.domain, sourceSha: meta.sourceSha ?? "", assets: {} };
    const startedAt = this.now();
    const plan = await this.orch.plan(spec, env);
    const ref = await this.orch.deploy(plan);
    const handle = await this.orch.trigger(ref);
    const status = await this.orch.status(handle);
    const { metrics, lineage } = await this.orch.collect(handle);
    const run: PipelineRun = {
      id: randomUUID(),
      pipelineId: id,
      env,
      status: status.state,
      startedAt,
      finishedAt: this.now(),
      metrics,
      lineageEvents: lineage.length,
      triggeredBy: principal.sub,
    };
    this.runs.unshift(run);
    await this.audit.append({
      ts: this.now(), actor: principal.sub, actorRoles: principal.roles,
      action: "pipeline.run.completed", subject: `dct:pipeline:${id}`,
      payload: { runId: run.id, env, status: run.status, ...metrics },
    });
    this.log?.info("pipeline run", { id, status: run.status, ...metrics });
    return run;
  }

  async runsFor(id: string): Promise<PipelineRun[]> {
    return this.runs.filter((r) => r.pipelineId === id);
  }
}
