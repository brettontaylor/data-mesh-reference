// DCT AppKit app — service layer. Thin glue over the @dct/engine framework:
// the contract (git) is the source of truth for governed asset definitions;
// this layer adds the maker/checker workflow and pipeline-run history that the
// corporate Streamlit app implemented, backed by Lakebase/Postgres (see repo.ts).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadContract,
  checkContract,
  checkPropagation,
  runMedallion,
  nextVersion,
  dqRuleUsage,
  resolveDqRule,
  ROOT as ENGINE_ROOT,
  type Contract,
  type Issue,
  type Product,
} from "@dct/engine";
import { can, inDomain, type Capability, type Principal } from "@dct/auth";
import { z } from "zod";
import type { Changeset, ModelEdit, PipelineRun, Repo } from "./repo";
import { classifyChange, domainOf } from "./tiering";
import { accessOverview, checkAccess } from "./access";
import { applyVersionPlan, type VersionPlan } from "./versioning";
import { writeBack, type WritebackResult } from "./writeback";

/* ---------------------------------------------------------------- assets */

/** Where each governed asset kind lives on the Contract, and its id field. */
const KINDS = {
  bdm: { list: (c: Contract) => c.entities, idKey: "entity" },
  pdm: { list: (c: Contract) => c.pdms, idKey: "pdm" },
  semantic: { list: (c: Contract) => c.semanticModels, idKey: "semanticModel" },
  mapping: { list: (c: Contract) => c.mappings, idKey: "mapping" },
  dq: { list: (c: Contract) => c.dqRuleSets, idKey: "dqRuleSet" },
  dqrule: { list: (c: Contract) => c.dqRules, idKey: "rule" },
  extract: { list: (c: Contract) => c.extracts, idKey: "extract" },
  transformation: { list: (c: Contract) => c.transformations, idKey: "transformation" },
  refmap: { list: (c: Contract) => c.refMaps, idKey: "refmap" },
  domain: { list: (c: Contract) => c.domains, idKey: "domain" },
  product: { list: (c: Contract) => c.products, idKey: "product" },
} as const;

export type AssetKind = keyof typeof KINDS;
export const ASSET_KINDS = Object.keys(KINDS) as AssetKind[];

export interface AssetSummary {
  kind: AssetKind;
  id: string;
  version?: string;
  status?: string;
  owner?: string;
  label?: string;
}

const EditSchema = z.object({
  kind: z.enum(ASSET_KINDS as [AssetKind, ...AssetKind[]]),
  id: z.string().min(1).max(200),
  action: z.enum(["upsert", "delete"]).optional(),
  spec: z.record(z.unknown()),
});
const ProposalSchema = z.object({
  title: z.string().min(3).max(300),
  edits: z.array(EditSchema).min(1).max(20),
});

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
const err = (code: number, msg: string) => new HttpError(code, msg);

/* -------------------------------------------------------------- services */

export class AppServices {
  private contract: Contract;

  constructor(private readonly repo: Repo) {
    this.contract = loadContract();
  }

  /* ---- assets (read: contract is the SoR) ---- */

  listAssets(kind?: AssetKind, q?: string): AssetSummary[] {
    const kinds = kind ? [kind] : ASSET_KINDS;
    const out: AssetSummary[] = [];
    for (const k of kinds) {
      const { list, idKey } = KINDS[k];
      for (const item of list(this.contract) as unknown as Record<string, unknown>[]) {
        const id = String(item[idKey] ?? "");
        if (q && !id.toLowerCase().includes(q.toLowerCase())) continue;
        out.push({
          kind: k,
          id,
          version: item.version ? String(item.version) : undefined,
          status: item.status ? String(item.status) : undefined,
          owner: item.owner ? String(item.owner) : undefined,
          label: item.label ? String(item.label) : undefined,
        });
      }
    }
    return out;
  }

  getAsset(kind: AssetKind, id: string): Record<string, unknown> {
    const def = KINDS[kind];
    if (!def) throw err(404, `unknown kind ${kind}`);
    const hit = (def.list(this.contract) as unknown as Record<string, unknown>[]).find(
      (x) => x[def.idKey] === id,
    );
    if (!hit) throw err(404, `${kind}/${id} not found`);
    return hit;
  }

  /* ---- changesets (maker/checker data entry) ---- */

  async propose(
    principal: Principal,
    body: unknown,
  ): Promise<Changeset> {
    if (!can(principal, "model:propose"))
      throw err(403, "capability model:propose required (role: modeler+)");
    const parsed = ProposalSchema.safeParse(body);
    if (!parsed.success)
      throw err(400, `invalid proposal: ${parsed.error.issues[0]?.message}`);

    // Two-tier classification FIRST, on the pristine edits — so tier reasons
    // name root causes (e.g. "removes field"), not the derivative version
    // bump that auto-semver stamps next.
    const verdict = classifyChange(this.contract, parsed.data.edits as ModelEdit[]);

    // Auto-semver: the server computes and stamps each edit's next version
    // (patch/minor/major from the structural diff) — proposer input is
    // advisory for new assets and overridden for existing ones.
    const versionPlan = applyVersionPlan(this.contract, parsed.data.edits as ModelEdit[]);

    // Governance gate at the door: apply the edits to a cloned contract and
    // run the same checks `pnpm check` runs. Structural failures reject the
    // proposal; soft issues are recorded on the changeset for the checker.
    const candidate = structuredClone(this.contract);
    for (const e of parsed.data.edits) applyEdit(candidate, e as ModelEdit);
    let issues: Issue[];
    try {
      issues = checkContract(candidate);
    } catch (e) {
      throw err(422, `edit breaks the contract: ${String(e)}`);
    }
    if (issues.some((i) => i.level === "error"))
      throw err(
        422,
        `edit fails governance gates: ${issues
          .filter((i) => i.level === "error")
          .map((i) => `${i.code}: ${i.message}`)
          .join("; ")}`,
      );

    const cs: Changeset = {
      id: randomUUID().slice(0, 8),
      title: parsed.data.title,
      status: "proposed",
      author: principal.sub,
      createdAt: new Date().toISOString(),
      edits: parsed.data.edits as ModelEdit[],
      issues,
      tier: verdict.tier,
      tierReasons: verdict.reasons,
      domains: verdict.domains,
      versionNotes: versionPlan.map((p) => p.note),
    };
    await this.repo.insertChangeset(cs);
    return cs;
  }

  /**
   * Live validation for the in-editor rules enforcer: run the exact
   * proposal-time gates (zod → auto-semver plan → cloned-contract governance
   * checks → tier classification) WITHOUT persisting anything.
   */
  validate(body: unknown): {
    valid: boolean;
    issues: Issue[];
    tier: 1 | 2;
    tierReasons: string[];
    domains: string[];
    versionPlan: VersionPlan[];
  } {
    const parsed = z
      .object({ edits: ProposalSchema.shape.edits })
      .safeParse(body);
    if (!parsed.success)
      throw err(400, `invalid edits: ${parsed.error.issues[0]?.message}`);

    // Work on copies — validation must never mutate live state. Classify
    // before version stamping so tier reasons name root causes.
    const edits = structuredClone(parsed.data.edits) as ModelEdit[];
    const verdict = classifyChange(this.contract, edits);
    const versionPlan = applyVersionPlan(this.contract, edits);

    const issues: Issue[] = [];
    try {
      const candidate = structuredClone(this.contract);
      for (const e of edits) applyEdit(candidate, e);
      issues.push(...checkContract(candidate));
    } catch (e) {
      issues.push({
        level: "error",
        code: "EDIT_INVALID",
        message: e instanceof HttpError ? e.message : String(e),
      });
    }
    return {
      valid: !issues.some((i) => i.level === "error"),
      issues,
      tier: verdict.tier,
      tierReasons: verdict.reasons,
      domains: verdict.domains,
      versionPlan,
    };
  }

  listChangesets(): Promise<Changeset[]> {
    return this.repo.listChangesets();
  }

  async decide(
    principal: Principal,
    id: string,
    decision: "approve" | "reject",
  ): Promise<Changeset> {
    const cs = await this.repo.getChangeset(id);
    if (!cs) throw err(404, `changeset ${id} not found`);
    if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status}`);
    // Maker/checker segregation of duties: the author cannot decide their own change.
    if (cs.author === principal.sub)
      throw err(403, "segregation of duties: author cannot approve/reject their own changeset");

    // Two-tier routing.
    if (cs.tier === 2) {
      // Impactful/breaking → enterprise sign-off (CDA / ARB), domain-independent.
      const cap: Capability = "change:signoff";
      if (!can(principal, cap))
        throw err(
          403,
          `tier-2 change requires ${cap} (chief data architect / architecture review board)`,
        );
    } else {
      // Minor → domain approval: capability + membership of EVERY owning domain.
      if (!can(principal, "change:approve"))
        throw err(403, "capability change:approve required (role: steward+)");
      const outside = cs.domains.filter((d) => !inDomain(principal, d));
      if (outside.length > 0)
        throw err(
          403,
          `tier-1 change routes to domain(s) [${cs.domains.join(", ")}] — ` +
            `your domain scope does not cover: ${outside.join(", ")}`,
        );
    }

    const status = decision === "approve" ? "approved" : "rejected";
    await this.repo.setChangesetStatus(id, status, principal.sub, new Date().toISOString());
    return { ...cs, status, decidedBy: principal.sub };
  }

  /** Author withdraws their own not-yet-decided proposal. */
  async withdraw(principal: Principal, id: string): Promise<Changeset> {
    const cs = await this.repo.getChangeset(id);
    if (!cs) throw err(404, `changeset ${id} not found`);
    if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status}`);
    if (cs.author !== principal.sub)
      throw err(403, "only the author can withdraw a proposal");
    await this.repo.setChangesetStatus(id, "withdrawn", principal.sub, new Date().toISOString());
    return { ...cs, status: "withdrawn", decidedBy: principal.sub };
  }

  async merge(
    principal: Principal,
    id: string,
  ): Promise<
    Changeset & {
      productIncrements: { product: string; from: string; to: string; level: string }[];
      writeback: WritebackResult;
      run?: string;
    }
  > {
    if (!can(principal, "change:merge"))
      throw err(403, "capability change:merge required (role: domain_owner+)");
    const cs = await this.repo.getChangeset(id);
    if (!cs) throw err(404, `changeset ${id} not found`);
    if (cs.status !== "approved") throw err(409, `changeset is ${cs.status}, must be approved`);

    // Stage everything on a clone so the merge is atomic: if write-back
    // refuses (e.g. models repo on main), nothing has mutated.
    const candidate = structuredClone(this.contract);
    for (const e of cs.edits) applyEdit(candidate, e);

    // Product increment: any merged change to a member asset bumps every
    // containing product on its OWN semver line — minor for tier-1 changes,
    // major for tier-2/breaking.
    const level = cs.tier === 2 ? "major" : "minor";
    const productIncrements: { product: string; from: string; to: string; level: string }[] = [];
    const bumped: Product[] = [];
    for (const p of candidate.products) {
      const touched = p.includes.some((m) =>
        cs.edits.some((e) => e.kind === (m.kind as ModelEdit["kind"]) && e.id === m.id),
      );
      if (!touched) continue;
      const from = p.version;
      p.version = nextVersion(p.version, level);
      productIncrements.push({ product: p.product, from, to: p.version, level });
      bumped.push(p);
    }

    // Checked into git (env-gated: MODELS_WRITEBACK=off|fs|git).
    let writeback: WritebackResult;
    try {
      writeback = writeBack(
        cs.edits,
        bumped,
        `chore(models): ${cs.title} [changeset ${cs.id}, tier ${cs.tier}]` +
          (productIncrements.length
            ? `\n\n${productIncrements.map((pi) => `${pi.product}: ${pi.from} -> ${pi.to} (${pi.level})`).join("\n")}`
            : ""),
      );
    } catch (e) {
      throw err(409, `merge blocked by write-back: ${String(e instanceof Error ? e.message : e)}`);
    }

    // Commit the merge atomically, then record it.
    this.contract = candidate;
    await this.repo.setChangesetStatus(id, "merged", principal.sub, new Date().toISOString());

    // ...and executed: a product increment triggers a full re-run.
    let runId: string | undefined;
    if (productIncrements.length > 0) {
      const run = await this.executeRun(principal, "product-increment", productIncrements.map((pi) => ({ product: pi.product, version: pi.to })));
      runId = run.id;
    }

    return {
      ...cs,
      status: "merged",
      decidedBy: principal.sub,
      productIncrements,
      writeback,
      run: runId,
    };
  }

  /* ---- pipeline runs (medallion bronze→silver→gold + gates) ---- */

  async triggerRun(principal: Principal): Promise<PipelineRun> {
    if (!can(principal, "pipeline:deploy"))
      throw err(403, "capability pipeline:deploy required (role: platform_engineer+)");
    return this.executeRun(principal, "manual", []);
  }

  /** Shared run executor. product-increment runs are system-triggered by a
   *  governed merge and bypass the manual pipeline:deploy capability. */
  private async executeRun(
    principal: Principal,
    trigger: PipelineRun["trigger"],
    products: PipelineRun["products"],
  ): Promise<PipelineRun> {
    const startedAt = new Date();
    const t0 = performance.now();
    let stats: PipelineRun["stats"] = [];
    let contractIssues: Issue[] = [];
    let propagationIssues: Issue[] = [];
    let status: PipelineRun["status"] = "succeeded";
    try {
      stats = runMedallion(this.contract);
      contractIssues = checkContract(this.contract);
      propagationIssues = checkPropagation(this.contract);
      if (contractIssues.some((i) => i.level === "error")) status = "failed";
    } catch (e) {
      status = "failed";
      contractIssues = [
        ...contractIssues,
        { level: "error", code: "MEDALLION_RUN_FAILED", message: String(e) },
      ];
    }
    const run: PipelineRun = {
      id: randomUUID().slice(0, 8),
      pipeline: "medallion",
      status,
      triggeredBy: principal.sub,
      startedAt: startedAt.toISOString(),
      durationMs: Math.round(performance.now() - t0),
      stats,
      gates: { contract: contractIssues, propagation: propagationIssues },
      trigger,
      products,
    };
    await this.repo.insertRun(run);
    return run;
  }

  /* ---- domains, registry & catalog (the org overlay) ---- */

  /** Which product (if any) includes this asset. */
  private productOf(kind: AssetKind, id: string): string | undefined {
    return this.contract.products.find((p) =>
      p.includes.some((m) => m.kind === kind && m.id === id),
    )?.product;
  }

  /** dependsOn edges for the registry table (mirrors apps/api projection). */
  private dependsOf(kind: AssetKind, id: string): string[] {
    const c = this.contract;
    switch (kind) {
      case "bdm": {
        const e = c.entities.find((x) => x.entity === id);
        return e ? [`source:${e.source}`] : [];
      }
      case "pdm": {
        const p = c.pdms.find((x) => x.pdm === id);
        return p ? [`bdm:${p.bdm}`, `source:${p.source}`] : [];
      }
      case "semantic":
        return (c.semanticModels.find((x) => x.semanticModel === id)?.sources ?? []).map((s) => `bdm:${s}`);
      case "mapping": {
        const m = c.mappings.find((x) => x.mapping === id);
        return m ? [`${m.from.kind}:${m.from.id}`, `${m.to.kind}:${m.to.id}`] : [];
      }
      case "dq": {
        const d = c.dqRuleSets.find((x) => x.dqRuleSet === id);
        return d ? [`${d.target.kind}:${d.target.id}`] : [];
      }
      case "extract":
        return (c.extracts.find((x) => x.extract === id)?.from ?? []).map((r) => `${r.kind}:${r.id}`);
      case "transformation": {
        const t = c.transformations.find((x) => x.transformation === id);
        return t ? t.sources.map((s) => `bdm:${s.entity}`) : [];
      }
      case "product":
        return (c.products.find((x) => x.product === id)?.includes ?? []).map((m) => `${m.kind}:${m.id}`);
      default:
        return [];
    }
  }

  /** Flat registry rows for every governed asset (all kinds). */
  registry() {
    const rows = ASSET_KINDS.flatMap((k) => {
      const def = KINDS[k];
      return (def.list(this.contract) as unknown as Record<string, unknown>[]).map((item) => {
        const id = String(item[def.idKey] ?? "");
        return {
          kind: k,
          id,
          label: item.label ? String(item.label) : undefined,
          version: item.version ? String(item.version) : undefined,
          status: item.status ? String(item.status) : "active",
          owner: item.owner ? String(item.owner) : undefined,
          domain: domainOf(this.contract, k, id),
          product: this.productOf(k, id),
          dependsOn: this.dependsOf(k, id),
        };
      });
    });
    return { rows, domains: this.contract.domains.map((d) => d.domain).sort() };
  }

  /** Which medallion stage an asset sits in (for the L→R flow). */
  private stageOf(kind: AssetKind): "bronze" | "silver" | "gold" | null {
    if (kind === "bdm") return "silver";
    if (kind === "pdm" || kind === "transformation" || kind === "extract" || kind === "semantic")
      return "gold";
    return null; // mappings/dq/refmap/dqrule/domain/product are not flow stages
  }

  domainsOverview() {
    const reg = this.registry().rows;
    return this.contract.domains
      .map((d) => {
        const assets = reg.filter((r) => r.domain === d.domain && r.kind !== "domain" && r.kind !== "product");
        const products = this.contract.products.filter((p) => p.domain === d.domain);
        return {
          ...d,
          productCount: products.length,
          assetCount: assets.length,
          products: products.map((p) => ({
            product: p.product,
            label: p.label,
            version: p.version,
            memberCount: p.includes.length,
          })),
        };
      })
      .sort((a, b) => b.assetCount - a.assetCount);
  }

  /** Dashboard catalog: domains→products + the bronze→silver→gold flow, from
   *  real contract data. `sources` land as bronze; BDMs are silver; PDMs /
   *  transformations / extracts / semantic models are gold. */
  catalog() {
    const c = this.contract;
    const reg = this.registry().rows;
    const flowNode = (id: string, kind: string, label: string | undefined, domain: string) => ({
      id,
      kind,
      label: label ?? id,
      domain,
    });

    const bronze = c.sources.map((s) =>
      flowNode(s.source, "source", s.label, "platform"),
    );
    const silver = reg
      .filter((r) => this.stageOf(r.kind as AssetKind) === "silver")
      .map((r) => flowNode(r.id, r.kind, r.label, r.domain));
    const gold = reg
      .filter((r) => this.stageOf(r.kind as AssetKind) === "gold")
      .map((r) => flowNode(r.id, r.kind, r.label, r.domain));

    return {
      totals: {
        domains: c.domains.length,
        products: c.products.length,
        assets: reg.filter((r) => r.kind !== "domain" && r.kind !== "product").length,
        byKind: Object.fromEntries(
          ASSET_KINDS.map((k) => [k, KINDS[k].list(c).length]),
        ),
      },
      domains: this.domainsOverview(),
      flow: { bronze, silver, gold },
    };
  }

  /* ---- model explorer (ERD) ---- */

  /** Models in the shape the vendored ERD explorer consumes (SourceModel[]) —
   *  mirrors the apps/api projection flattening (mapping.ts) exactly:
   *  flattened BDM fields with isPk/bk/fkRef, plus PDM/semantic nodes wired
   *  via dependsOn so kind filters in the explorer light up. */
  erdModels() {
    const c = this.contract;
    const domainOfEntity = (id: string) => domainOf(c, "bdm", id);
    const models: Record<string, unknown>[] = [];
    for (const e of c.entities) {
      models.push({
        kind: "bdm",
        id: e.entity,
        domain: domainOfEntity(e.entity),
        version: e.version,
        status: e.status ?? "active",
        owner: e.owner ?? null,
        dependsOn: [`source:${e.source}`],
        fields: e.fields.map((f) => ({
          name: f.name,
          type: f.type,
          classification: f.classification,
          pii: !!f.pii,
          mnpi: !!f.mnpi,
          isPk: !!f.pk,
          bk: !!f.bk,
          fkRef: f.fk ? `${f.fk.entity}.${f.fk.field}` : null,
        })),
      });
    }
    for (const p of c.pdms) {
      models.push({
        kind: "pdm",
        id: p.pdm,
        domain: domainOf(c, "pdm", p.pdm),
        version: p.version,
        status: p.status ?? "active",
        owner: p.owner ?? null,
        dependsOn: [`bdm:${p.bdm}`, `source:${p.source}`],
        fields: [],
      });
    }
    for (const s of c.semanticModels) {
      models.push({
        kind: "semantic",
        id: s.semanticModel,
        domain: "analytics",
        version: s.version,
        status: s.status ?? "active",
        owner: s.owner ?? null,
        dependsOn: s.sources.map((x) => `bdm:${x}`),
        fields: [],
      });
    }
    return { models };
  }

  /* ---- governed mapping documents (bronze→silver + silver→gold) ---- */

  mappingDocuments() {
    const c = this.contract;
    return {
      // bronze→silver: source → BDM field-level mapping docs, with coverage
      bronzeToSilver: c.mappings.map((m) => {
        const target = m.to.kind === "bdm" ? c.entities.find((e) => e.entity === m.to.id) : undefined;
        const mapped = new Set(m.rules.map((r) => r.target));
        const targetFields = target?.fields.map((f) => f.name) ?? [];
        const unmapped = targetFields.filter((f) => !mapped.has(f));
        return {
          ...m,
          coverage: target
            ? {
                targetFields: targetFields.length,
                mapped: targetFields.length - unmapped.length,
                unmapped,
              }
            : undefined,
        };
      }),
      // silver→gold: graded transformation docs (joins, unions, key resolution,
      // per-field logic with bronze lineage tails)
      silverToGold: c.transformations.map((t) => ({
        ...t,
        fieldCount: t.fields.length,
        sourceEntities: t.sources.map((s) => s.entity),
        refmaps: t.uses ?? [],
      })),
    };
  }

  /* ---- DQ rules library ---- */

  dqLibrary() {
    return {
      library: this.contract.dqRules.map((d) => ({
        ...d,
        usage: dqRuleUsage(this.contract, d.rule),
      })),
      // every application across all rule sets, resolved (library + inline)
      applications: this.contract.dqRuleSets.flatMap((rs) =>
        rs.rules.map((r) => ({
          ruleSet: rs.dqRuleSet,
          target: `${rs.target.kind}/${rs.target.id}`,
          resolved: resolveDqRule(this.contract, r),
        })),
      ),
    };
  }

  /* ---- data products (independent versioning) ---- */

  listProducts() {
    return this.contract.products.map((p) => ({
      ...p,
      memberCount: p.includes.length,
    }));
  }

  listRuns(): Promise<PipelineRun[]> {
    return this.repo.listRuns();
  }

  /* ---- migration status (Delta/UC → Lakebase Postgres) ---- */

  migration(): {
    generated: boolean;
    manifest: unknown;
    schemaSqlPath: string;
  } {
    // Emitted by the engine's postgres generator (contract → Lakebase DDL).
    const base = join(ENGINE_ROOT, "generated", "postgres");
    const manifestPath = join(base, "manifest.json");
    const generated = existsSync(manifestPath);
    return {
      generated,
      manifest: generated
        ? JSON.parse(readFileSync(manifestPath, "utf8"))
        : null,
      schemaSqlPath: "packages/engine/generated/postgres/schema.sql",
    };
  }

  /* ---- access management panel ---- */

  access() {
    return accessOverview(this.contract);
  }

  accessCheck(sub: string, capability: string, domain?: string) {
    if (!sub || !capability) throw err(400, "sub and capability are required");
    return checkAccess(sub, capability as Capability, domain || undefined);
  }

  /* ---- meta ---- */

  meta(mode: "local" | "databricks") {
    return {
      app: "Mapping and Metadata Platform — AppKit prototype",
      mode,
      store: this.repo.kind,
      spec: {
        name: this.contract.spec.name,
        version: this.contract.spec.version,
      },
      counts: Object.fromEntries(
        ASSET_KINDS.map((k) => [k, KINDS[k].list(this.contract).length]),
      ),
      products: this.contract.products.map((p) => ({
        product: p.product,
        version: p.version,
        domain: p.domain,
      })),
      domains: this.contract.domains.map((d) => ({
        domain: d.domain,
        label: d.label,
        version: d.version,
      })),
    };
  }
}

/* ---------------------------------------------------------------- helpers */

/** Apply one governed-asset edit to a contract: upsert by id, or delete. */
function applyEdit(c: Contract, e: ModelEdit): void {
  const def = KINDS[e.kind];
  if (!def) throw err(400, `unknown asset kind ${e.kind}`);
  const arr = def.list(c) as unknown as Record<string, unknown>[];
  const at = arr.findIndex((x) => x[def.idKey] === e.id);
  if (e.action === "delete") {
    if (at < 0) throw err(404, `${e.kind}/${e.id} not found (cannot delete)`);
    arr.splice(at, 1);
    return;
  }
  const spec = { ...e.spec, [def.idKey]: e.id }; // id key always wins
  if (at >= 0) arr[at] = spec;
  else arr.push(spec);
}
