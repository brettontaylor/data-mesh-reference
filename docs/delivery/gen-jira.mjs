// Generates jira-stories.csv (Jira import) + jira-stories.md (readable) from one source.
import { writeFileSync } from "node:fs";

const epics = [
  ["DCT-EP01", "Platform foundation & monorepo", "Monorepo, engine, shared libs, CI/CD scaffolding."],
  ["DCT-EP02", "GitOps spine & projection", "Git as system of record; Postgres projection; reconciler; read API."],
  ["DCT-EP03", "Catalog, publication & consumption", "Catalog/UI, contracts, SDKs, CLI."],
  ["DCT-EP04", "Identity, RBAC & ABAC", "OIDC/SAML, roles, attribute-level access."],
  ["DCT-EP05", "Governance, approvals & immutable audit", "ChangeSets, gates, maker/checker, audit."],
  ["DCT-EP06", "Pipeline orchestration", "Generate/deploy/run medallion pipelines."],
  ["DCT-EP07", "Lineage & Unity Catalog integration", "Column lineage + two-way UC sync."],
  ["DCT-EP08", "Events, webhooks & subscriptions", "Event bus, webhooks, notifications."],
  ["DCT-EP09", "Packaging, hardening & operations", "Docker/Helm/IaC, security, observability, DR."],
  ["DCT-EP10", "Compliance packs", "GDPR, BCBS 239, retention/legal hold (post-GA)."],
  ["DCT-EP11", "Federated operating model & enterprise sign-off", "Domain ownership; Chief Data Architect / ARB sign-off; scope-aware approval routing."],
];

// story: [epic, summary, description, [AC...], points, MoSCoW, [labels], component, [reqs...]]
const S = (epic, summary, description, ac, points, pri, labels, component, reqs) =>
  ({ epic, summary, description, ac, points, pri, labels, component, reqs });

const stories = [
  // EP01
  S("DCT-EP01","Set up monorepo workspace & task runner","Establish pnpm workspaces + Turborepo + Changesets; shared tsconfig and lint with module-boundary rules.",["Workspace builds all packages","Boundary lint fails on illegal cross-imports","Changesets versioning configured"],5,"M",["foundation","P0"],"Platform",["NFR-MAINT-001"]),
  S("DCT-EP01","Establish engine package (contracts, generators, registry)","House the pure engine: contract types, generators, governance checks, semver, registry.",["Engine is dependency-light and unit-tested","No engine dependency on HTTP/DB"],5,"M",["foundation","P0"],"Platform",["FR-MM-006","NFR-MAINT-001"]),
  S("DCT-EP01","Shared config & structured logging","Typed config loader (env + file), structured JSON logger with secret/PII redaction.",["Invalid config fails fast with a clear message","Logs contain no secret/PII values"],3,"M",["foundation","P0"],"Platform",["NFR-OPS-001"]),
  S("DCT-EP01","CI pipeline (build, test, scan, SBOM)","PR pipeline: typecheck, unit, lint/boundary, SCA + secret scan, SBOM, signed image.",["CI runs on PR and blocks on failure","SBOM + signed image produced on main"],5,"M",["foundation","P0","security"],"Platform Ops",["NFR-SEC-004","NFR-MAINT-002"]),

  // EP02
  S("DCT-EP02","Git provider adapter (local + GitLab)","GitProvider interface with a local filesystem impl and a GitLab REST impl (read path; write path in EP05).",["readTree returns the model tree + a content sha","GitLab read path works against a test project"],8,"M",["gitops","P1","integration"],"Data Integration",["FR-IN-001"]),
  S("DCT-EP02","Postgres projection schema & migrations","Forward-only migrations for domain/model/field/version/edge + meta; each record carries source_sha.",["Migrations apply cleanly","Records carry source_sha"],5,"M",["gitops","P1"],"Platform",["DR-011","NFR-MAINT-003"]),
  S("DCT-EP02","Reconciler (Git → projection, idempotent)","Materialize the Git tree into the projection; idempotent; full rebuild from a commit.",["Re-running reconcile yields identical projection","Rebuild reproduces projection exactly from a sha"],8,"M",["gitops","P1"],"Platform",["FR-IN-002","NFR-DR-001"]),
  S("DCT-EP02","Read API (domains, models, registry, search)","Fastify read endpoints over the projection with FTS.",["Documented read endpoints respond","Search filters by facets"],5,"M",["gitops","P1","api"],"Platform",["FR-CP-001","FR-CN-001"]),
  S("DCT-EP02","Seed loader & demo dataset","Seed the models repo with a synthetic capital-markets domain for out-of-box exploration.",["Fresh install is explorable with seeded models"],3,"S",["gitops","P1"],"Platform",["FR-AD-002"]),
  S("DCT-EP02","Drift detection & alerting","Detect divergence between Git head and the projection; alert when stale.",["Out-of-band commit raises a drift alert"],3,"M",["gitops","P1","ops"],"Platform",["FR-IN-003"]),

  // EP03
  S("DCT-EP03","Catalog & faceted search UI","Browse/search models & products with facets (domain, kind, status, classification, PII/MNPI, owner).",["Search returns filtered results","Facets work as specified"],5,"M",["experience","P2","ui"],"Experience",["FR-CP-001","FR-UI-001"]),
  S("DCT-EP03","Model/product detail view","Schema (with classification + PII/MNPI), versions, lineage refs, owner, contracts.",["Detail view renders all elements","Contracts are downloadable"],5,"M",["experience","P2","ui"],"Experience",["FR-CP-002","FR-CP-003"]),
  S("DCT-EP03","Interactive ERD","Expandable entities, FK connectors, classification badges, role-aware masking.",["Entities expand to attributes","FK connectors render between entities"],5,"S",["experience","P2","ui"],"Experience",["FR-UI-003"]),
  S("DCT-EP03","Machine-readable contracts & .well-known","Generate JSON Schema/OpenAPI/JSON-LD per model + capability descriptor.",["Each artifact is retrievable and valid","/.well-known/dct.json is accurate"],5,"M",["experience","P2","api"],"Experience",["FR-CP-003","FR-CP-004"]),
  S("DCT-EP03","TypeScript & Python SDKs","Typed clients for read endpoints honoring masking.",["Both SDKs round-trip reads","Masking respected in SDK responses"],5,"M",["experience","P2","sdk"],"Experience",["FR-CN-003"]),
  S("DCT-EP03","CLI (validate, diff, propose, simulate, generate, pipeline, lineage)","Operator/CI CLI wrapping engine + API.",["Each command performs its function","CLI usable in CI"],5,"M",["experience","P2","cli"],"Experience",["FR-CN-004"]),

  // EP04
  S("DCT-EP04","OIDC/SAML login & sessions","Authenticate via corporate IdP; short-lived sessions; logout.",["SSO login works","Sessions expire and refresh"],8,"M",["security","P3","auth"],"Governance & Security",["FR-IN-006","CR-040"]),
  S("DCT-EP04","API keys / service principals","Issue scoped, hashed, revocable machine credentials.",["Keys are scoped + revocable","Keys hashed at rest, shown once"],5,"M",["security","P3","auth"],"Governance & Security",["FR-IN-006","NFR-SEC-006"]),
  S("DCT-EP04","RBAC capabilities & group→role mapping","Roles from IdP groups; capability checks on endpoints; domain scoping.",["Each role grants only its capabilities","Domain-scoped roles enforced"],5,"M",["security","P3","auth"],"Governance & Security",["FR-AX-004","FR-AX-005"]),
  S("DCT-EP04","ABAC attribute-level masking engine","Enforce tier + PII + MNPI per attribute across API, semantic, catalog.",["Masking matches the decision rule across roles","Masked measures are not computable"],8,"M",["security","P3"],"Governance & Security",["FR-AX-002","FR-AX-003","FR-AX-006","DR-022"]),
  S("DCT-EP04","Row-Level Security (defence in depth)","Postgres RLS enforcing domain + clearance on read models.",["Direct SQL cannot bypass scoping"],5,"M",["security","P3"],"Governance & Security",["NFR-SEC-003","CR-041"]),
  S("DCT-EP04","Admin: IdP config, role mapping, domains","Admin surfaces for identity/role/domain configuration.",["Config changes take effect without code changes"],3,"M",["security","P3","admin"],"Governance & Security",["FR-AD-001"]),

  // EP05
  S("DCT-EP05","ChangeSet model & lifecycle state machine","Proposal wrapping edits with diff/impact/gates/approvals; draft→in_review→approved→merged/rejected.",["A ChangeSet exposes diff, impact, gates, approvals","Invalid transitions rejected"],8,"M",["governance","P4"],"Governance & Security",["FR-GV-001","FR-MM-010"]),
  S("DCT-EP05","Automated gates pipeline","Run schema, referential, classification, semver, propagation gates on each ChangeSet.",["Each gate returns pass/fail with detail","Approval blocked while a required gate fails"],8,"M",["governance","P4"],"Governance & Security",["FR-GV-002","FR-GV-003"]),
  S("DCT-EP05","Maker/checker + SoD + quorum","No self-approval; risk-based quorum; PII/MNPI/policy governance escalation.",["Self-approval/merge rejected","Quorum + escalation enforced"],8,"M",["governance","P4"],"Governance & Security",["FR-GV-004","FR-GV-005","FR-GV-006","CR-001","CR-002"]),
  S("DCT-EP05","Immutable hash-chained audit log","Append-only audit with chain verifier and SIEM stream.",["Chain verifies; tampering detectable","Events stream to SIEM"],8,"M",["governance","P4","security"],"Governance & Security",["FR-GV-009","NFR-AUD-001","NFR-AUD-002"]),
  S("DCT-EP05","Git write path (branch/commit/MR/merge)","Implement the GitLab write path; merge gate re-verified server-side.",["Propose opens an MR; approved MR merges","Server-side gate re-verifies at merge"],8,"M",["governance","P4","integration"],"Governance & Security",["FR-IN-001","FR-GV-008"]),
  S("DCT-EP05","ChangeSet review UI","Side-by-side diff, classification deltas, impact tree, gate status, approvals.",["Review surface renders all elements","Approve/reject with SoD enforced"],5,"M",["governance","P4","ui"],"Experience",["FR-GV-007","FR-UI-001"]),
  S("DCT-EP05","Models-repo CI & branch protection","Reusable CI that runs gates on direct MRs; branch-protection templates.",["Direct MRs are gated","No-self-approve enforced in Git"],5,"M",["governance","P4"],"Governance & Security",["FR-GV-011"]),
  S("DCT-EP05","Impact analysis & breaking-change acknowledgement","Compute downstream impact; require ack for breaking changes with subscribers.",["Impact shown; ack required to proceed"],5,"S",["governance","P4"],"Governance & Security",["FR-GV-012","FR-LN-004"]),
  S("DCT-EP05","Break-glass emergency change","Dual-admin override with reason + time-box + high-severity audit.",["Break-glass recorded distinctly + alerts","Single-admin attempts fail"],3,"S",["governance","P4","security"],"Governance & Security",["FR-GV-010","CR-004"]),

  // EP06
  S("DCT-EP06","Orchestration adapter (local + Databricks)","Orchestrator interface; local in-process medallion; Databricks Workflows/DLT via Asset Bundles.",["Local adapter runs the medallion in CI","Databricks adapter targets a workspace"],8,"M",["orchestration","P5","integration"],"Data Integration",["FR-OR-001","FR-OR-002"]),
  S("DCT-EP06","Deploy / trigger / monitor pipelines","Idempotent deploy; on-demand/scheduled/on-merge triggers; run tracking + metrics.",["Re-deploy is a no-op for unchanged","Runs tracked with metrics"],8,"M",["orchestration","P5"],"Data Integration",["FR-OR-003","FR-OR-004","FR-OR-005"]),
  S("DCT-EP06","DQ expectations from contracts","Generate DLT expectations from DQ contracts; surface results on runs.",["DQ pass/fail appears on runs"],5,"S",["orchestration","P5"],"Data Integration",["FR-OR-006","FR-MM-009"]),
  S("DCT-EP06","Environments & four-eyes prod deploy","dev/staging/prod targets + promotion; distinct approver required for prod.",["Promotion deploys identical assets per target","Prod deploy without distinct approver rejected"],5,"M",["orchestration","P5","security"],"Data Integration",["FR-OR-007","FR-OR-008"]),
  S("DCT-EP06","Pipeline console UI","List pipelines, schedules, run history + run detail.",["Console shows pipelines and runs with metrics"],5,"S",["orchestration","P5","ui"],"Experience",["FR-UI-001","FR-OR-005"]),
  S("DCT-EP06","Resilience: retry, circuit-break, alert","Bounded retries, circuit-breaking on poison runs, alerting.",["Repeated failures circuit-break + alert"],3,"S",["orchestration","P5","ops"],"Data Integration",["FR-OR-009","NFR-AVAIL-002"]),

  // EP07
  S("DCT-EP07","Column-level static lineage","Build lineage from the models (source→bronze→silver→gold.col→semantic).",["Lineage resolves the full chain for a field"],5,"M",["lineage","P6"],"Data Integration",["FR-LN-001"]),
  S("DCT-EP07","OpenLineage ingestion & reconciliation","Ingest run events; mark observed edges; reconcile vs static.",["Edges marked observed after a run"],5,"M",["lineage","P6","integration"],"Data Integration",["FR-LN-002"]),
  S("DCT-EP07","Lineage traversal, impact & explorer UI","Upstream/downstream traversal, impact analysis, interactive explorer.",["Traversal + impact correct","Explorer renders the graph"],5,"M",["lineage","P6","ui"],"Experience",["FR-LN-003","FR-LN-004","FR-LN-005"]),
  S("DCT-EP07","Unity Catalog push (schemas/tags/masks)","Project models into UC: schemas, classification/PII/MNPI tags, column masks, ownership.",["Applied tags/masks match the model","Plan is generatable without a workspace"],8,"M",["uc","P6","integration"],"Data Integration",["FR-IN-004"]),
  S("DCT-EP07","Unity Catalog pull/import & reconcile","Import existing UC estate as candidate models; detect & remediate drift.",["Import produces candidate models","Drift detected + remediable"],5,"S",["uc","P6","integration"],"Data Integration",["FR-IN-005","FR-IN-003"]),

  // EP08
  S("DCT-EP08","Event bus & transactional outbox","Domain events with an outbox; in-process subscribers.",["State-changing actions emit events","Outbox guarantees delivery"],5,"M",["events","P7"],"Platform",["FR-IN-008"]),
  S("DCT-EP08","Webhook delivery (HMAC, retry, DLQ, replay)","Signed delivery with retries, dead-letter, and replay.",["Subscriber receives a signed event","Failures DLQ and can be replayed"],5,"M",["events","P7","integration"],"Platform",["FR-IN-008","CR-045"]),
  S("DCT-EP08","Subscriptions & breaking-change notifications","Subscribe to products/event types; notify subscribers before a breaking merge.",["Subscriber notified of a breaking change"],3,"S",["events","P7"],"Platform",["FR-GV-012","FR-IN-008"]),
  S("DCT-EP08","Notification channels (email/Slack/Teams/in-app)","Adapter-based notifications for reviews, decisions, SLA breaches.",["Notifications delivered via configured channel"],3,"C",["events","P7"],"Platform",["FR-IN-008"]),

  // EP09
  S("DCT-EP09","Container image & docker-compose","Multi-role image (api/web/worker/all) + one-command compose stack.",["docker compose up brings up a working stack"],5,"M",["ops","P8"],"Platform Ops",["NFR-PORT-001","NFR-PORT-002"]),
  S("DCT-EP09","Helm chart & k8s deploy","HA deployments, services, ingress, probes, secret refs, HPA.",["helm install deploys api/web/worker with probes"],5,"M",["ops","P8"],"Platform Ops",["NFR-PORT-001","NFR-SCALE-001"]),
  S("DCT-EP09","Databricks App bundle","Package the image as a Databricks App for in-perimeter deploy.",["App deploys inside a workspace"],3,"S",["ops","P8"],"Platform Ops",["NFR-PORT-001"]),
  S("DCT-EP09","Terraform (UC namespaces + service principal)","IaC for the data-plane side the platform governs.",["terraform apply provisions catalogs + SP"],3,"S",["ops","P8","iac"],"Platform Ops",["FR-AD-001"]),
  S("DCT-EP09","Observability dashboards & alerts","OTel traces/metrics/logs; golden-signal + domain dashboards; alert rules.",["Dashboards display the listed metrics","Alerts fire on threshold breach"],5,"M",["ops","P8"],"Platform Ops",["NFR-OPS-002","NFR-OPS-003"]),
  S("DCT-EP09","Backup, restore & DR drill","PITR backups incl. audit chain; tested restore; chaos drills.",["Restore drill passes; audit chain verified","Dependency-outage drill degrades gracefully"],5,"M",["ops","P8","security"],"Platform Ops",["NFR-DR-002","NFR-AVAIL-002"]),
  S("DCT-EP09","Security hardening & threat-model review","Pen-test fixes, STRIDE review, egress allow-listing, image signing.",["Threat model reviewed; mitigations tracked","Security checklist green"],5,"M",["ops","P8","security"],"Governance & Security",["CR-044","NFR-SEC-004"]),
  S("DCT-EP09","First-run wizard & runbooks","Guided setup; operational runbooks (drift, rotation, break-glass, restore, onboarding).",["Clean-room install < 1 hr","Runbooks followed in a drill"],3,"M",["ops","P8","docs"],"Platform Ops",["FR-AD-002","NFR-OPS-004"]),

  // EP10
  S("DCT-EP10","Privacy pack (purpose tags, RTBF, residency)","Purpose/lawful-basis tags; RTBF lineage propagation; residency-constrained deploys.",["RTBF produces a target list via lineage","Region-tagged products deploy only to matching regions"],8,"C",["compliance","P9","privacy"],"Governance & Security",["CR-021","CR-022","DR-025","DR-026"]),
  S("DCT-EP10","BCBS 239 evidence pack","Lineage-completeness scoring; DQ evidence bundles; ownership coverage.",["Coverage metric per domain","Evidence bundle exports"],5,"C",["compliance","P9"],"Governance & Security",["CR-010","CR-011","CR-013"]),
  S("DCT-EP10","Retention & legal hold","Configurable retention; WORM/legal-hold immutability; e-discovery export.",["Retention applied; held records immutable","Signed e-discovery export"],5,"C",["compliance","P9"],"Governance & Security",["CR-030","CR-031"]),

  // EP11 — Federated operating model & enterprise sign-off
  S("DCT-EP11","Domain ownership model (domain.yaml / CODEOWNERS / groups)","Make domains first-class; map Git paths + IdP groups to domain steward roles; every model has an owning domain.",["A model resolves its domain + steward group","Reviewers auto-route to the owning domain","Ownerless models reported"],5,"M",["federation","P3"],"Governance & Security",["FR-FG-001","FR-FG-002","FR-FG-003"]),
  S("DCT-EP11","Chief Data Architect & ARB roles","Add chief_data_architect (enterprise sign-off + standards admin) and architecture_review_board (delegated quorum) roles.",["CDA can sign off any domain's enterprise change","ARB quorum can sign off when delegated","Domain stewards remain domain-scoped"],5,"M",["federation","P3","auth"],"Governance & Security",["FR-FG-010","FR-FG-011","FR-FG-012"]),
  S("DCT-EP11","Model scope & conformed-model protection","Add scope (domain/shared/enterprise) to the model envelope; shared/enterprise models are CDA-governed.",["Scope persists and drives routing","Only CDA/ARB can evolve shared/enterprise models"],5,"M",["federation","P4"],"Governance & Security",["FR-FG-004","FR-FG-032"]),
  S("DCT-EP11","Scope-aware approval routing engine","Configurable policy computing required approvers from kind/severity/scope/classification/cross-domain; CDA sign-off for BDM/major/cross-domain/new-entity/classification/shared.",["Each trigger condition requires CDA sign-off","Routine in-domain change is domain-tier only","Policy changes without code changes","SoD enforced at every tier"],8,"M",["federation","P4"],"Governance & Security",["FR-FG-020","FR-FG-021","FR-FG-022","FR-FG-013"]),
  S("DCT-EP11","Enterprise sign-off tier & CDA review queue","Escalate qualifying ChangeSets to the CDA after domain approval; dashboard of pending enterprise sign-offs with scope/impact/gates; SLA + escalation.",["Qualifying change cannot merge without CDA sign-off","CDA sees all pending enterprise approvals","Stale sign-offs escalate per policy"],8,"M",["federation","P4","ui"],"Governance & Security",["FR-FG-023","FR-FG-024","FR-FG-025"]),
  S("DCT-EP11","Standards-as-code & duplication detection","Enterprise modeling standards as automated gates (naming, classification, semver, cross-domain integrity); flag entities overlapping conformed models.",["Non-compliant change fails the relevant gate","A near-duplicate entity raises a reuse warning"],5,"S",["federation","P4"],"Governance & Security",["FR-FG-030","FR-FG-031"]),
  S("DCT-EP11","Two-tier federated audit & evidence","Record domain proposer, domain approver(s), and CDA sign-off; per-change evidence bundle of the federated chain.",["Audit shows both tiers for a governed change","Evidence bundle exports the full approval chain"],3,"M",["federation","P4","security"],"Governance & Security",["FR-FG-040","FR-FG-041"]),
  S("DCT-EP11","Graduated autonomy / delegation","Let the CDA delegate change classes to the domain tier over time; recorded and audited.",["A delegated class no longer requires CDA sign-off","Delegation is audited"],3,"C",["federation","P9"],"Governance & Security",["FR-FG-026"]),
  S("DCT-EP11","Federation registry & domains UI","Catalog of domains, owners, conformed/shared models, and pending sign-offs.",["Registry lists domains, owners, shared models","Pending enterprise sign-offs visible"],3,"S",["federation","P6","ui"],"Experience",["FR-FG-005"]),
];

const PRI = { M: "High", S: "Medium", C: "Low", W: "Lowest" };

// ---- CSV ----
const cols = ["Issue Type","Summary","Epic Name","Epic Link","Description","Acceptance Criteria","Story Points","Priority","Labels","Components","Requirements"];
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = [cols.join(",")];
for (const [, name, summary] of epics) {
  rows.push([ "Epic", name, name, "", summary, "", "", "High", "epic", "", "" ].map(esc).join(","));
}
for (const st of stories) {
  const epicName = epics.find((e) => e[0] === st.epic)[1];
  rows.push([
    "Story", st.summary, "", epicName, st.description,
    st.ac.map((a, i) => `${i + 1}. ${a}`).join("\n"),
    st.points, PRI[st.pri], st.labels.join(" "), st.component, st.reqs.join(" "),
  ].map(esc).join(","));
}
writeFileSync("jira-stories.csv", rows.join("\n") + "\n");

// ---- Markdown ----
let md = `# DEAL Control Tower — Delivery Backlog (Jira)\n\n`;
md += `Import \`jira-stories.csv\` into Jira (map **Epic Link** to Epic Name; **Story Points**, **Priority**, **Labels**, **Components** map directly). Below is the readable backlog. Priority shown as MoSCoW → Jira priority.\n\n`;
const totalPts = stories.reduce((a, s) => a + s.points, 0);
md += `**${epics.length} epics · ${stories.length} stories · ${totalPts} story points**\n\n`;
for (const [key, name, summary] of epics) {
  const es = stories.filter((s) => s.epic === key);
  const pts = es.reduce((a, s) => a + s.points, 0);
  md += `## ${key} — ${name}\n\n_${summary}_  (${es.length} stories · ${pts} pts)\n\n`;
  for (const st of es) {
    md += `### ${st.summary}\n`;
    md += `- **Priority:** ${st.pri} (${PRI[st.pri]})  ·  **Points:** ${st.points}  ·  **Component:** ${st.component}  ·  **Labels:** ${st.labels.join(", ")}\n`;
    md += `- **Description:** ${st.description}\n`;
    md += `- **Acceptance criteria:**\n${st.ac.map((a) => `  - ${a}`).join("\n")}\n`;
    md += `- **Requirements:** ${st.reqs.join(", ")}\n\n`;
  }
}
writeFileSync("jira-stories.md", md);
console.log(`wrote jira-stories.csv and jira-stories.md — ${epics.length} epics, ${stories.length} stories, ${totalPts} pts`);
