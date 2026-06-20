// @dct/orchestration-adapter — pluggable pipeline engine (ADR-005).
// v1 concrete impl: Databricks (Workflows + DLT via Asset Bundles).
// `local` impl runs the engine's in-process medallion so the whole platform is
// runnable in CI/demos with no cloud. Phase 5 implements local + databricks.

export type EnvTarget = "dev" | "staging" | "prod";

/** Produced by the engine's generators from the governed models. */
export interface PipelineSpec {
  id: string;
  domain: string;
  sourceSha: string;
  /** generated assets: DLT modules, workflow manifest, DQ expectations */
  assets: Record<string, string>;
}

export interface DeploymentPlan {
  pipelineId: string;
  env: EnvTarget;
  /** engine-native representation (e.g., a Databricks Asset Bundle) */
  bundle: unknown;
}

export interface DeploymentRef {
  pipelineId: string;
  env: EnvTarget;
  externalRef: string;
}

export interface RunHandle {
  pipelineId: string;
  externalRunId: string;
}

export type RunState =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface RunStatus {
  state: RunState;
  tasks?: { name: string; state: RunState }[];
}

export interface RunMetrics {
  rowsIn?: number;
  rowsOut?: number;
  durationMs?: number;
  dqPass?: number;
  dqFail?: number;
  dbu?: number;
}

export interface OpenLineageEvent {
  /** OpenLineage run event (normalized) for lineage ingestion */
  [k: string]: unknown;
}

export interface TriggerOpts {
  backfill?: { from: string; to: string };
}

/** The single boundary every orchestration engine implements. */
export interface Orchestrator {
  readonly id: string; // 'local' | 'databricks' | 'airflow' | 'dbt'
  plan(spec: PipelineSpec, env: EnvTarget): Promise<DeploymentPlan>;
  deploy(plan: DeploymentPlan): Promise<DeploymentRef>;
  trigger(ref: DeploymentRef, opts?: TriggerOpts): Promise<RunHandle>;
  status(run: RunHandle): Promise<RunStatus>;
  collect(run: RunHandle): Promise<{ metrics: RunMetrics; lineage: OpenLineageEvent[] }>;
  destroy(ref: DeploymentRef): Promise<void>;
}

// --- Phase 5 implementations (skeletons) -----------------------------------
// export class LocalOrchestrator implements Orchestrator { /* engine medallion runner */ }
// export class DatabricksOrchestrator implements Orchestrator { /* DLT + Workflows + DAB */ }

export {};
