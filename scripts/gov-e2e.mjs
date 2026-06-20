// End-to-end governance test: gates, maker/checker, SoD, quorum, PII escalation,
// merge → reconcile, immutable audit. Drives the live API with dev-auth headers.
const BASE = process.env.DCT_API ?? "http://localhost:4400";
let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`${c ? "✓" : "✗ FAIL"} ${m}`); };

const hdr = (user, roles, withBody) => ({
  ...(withBody ? { "content-type": "application/json" } : {}),
  "x-dct-user": user,
  "x-dct-roles": roles,
  "x-dct-domains": "*",
});
async function call(method, path, user, roles, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: hdr(user, roles, body != null),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// helper: current trade spec
const getTrade = async () => (await call("GET", "/api/v1/models/bdm/trade", "reader", "viewer")).json.spec;

console.log("\n— Scenario A: breaking change WITHOUT adequate version bump —");
{
  const spec = await getTrade();
  spec.fields.find((f) => f.name === "price").type = "decimal(20,6)"; // breaking
  // version left at current (no bump)
  const r = await call("POST", "/api/v1/changesets", "sam", "steward", { title: "widen price (no bump)", edits: [{ kind: "bdm", id: "trade", spec }] });
  const semver = r.json.gates?.find((g) => g.name?.startsWith("semver"));
  ok(r.status === 200 && semver && semver.ok === false, `semver gate fails on unbumped breaking change (${semver?.detail ?? "?"})`);
}

console.log("\n— Scenario B: correct major bump → maker/checker + SoD + quorum(2) —");
let csB;
{
  const spec = await getTrade();
  spec.fields.find((f) => f.name === "price").type = "decimal(20,6)";
  spec.version = "3.0.0"; // correct major bump
  const r = await call("POST", "/api/v1/changesets", "sam", "steward", { title: "widen price", edits: [{ kind: "bdm", id: "trade", spec }] });
  csB = r.json.id;
  ok(r.status === 200 && r.json.gates.every((g) => g.ok), "gates green on correct bump");
  ok(r.json.requiredApprovals === 2, `major change requires 2 approvals (got ${r.json.requiredApprovals})`);

  const self = await call("POST", `/api/v1/changesets/${csB}/approve`, "sam", "steward");
  ok(self.status === 403, `self-approval blocked by SoD (${self.json.error})`);

  const a1 = await call("POST", `/api/v1/changesets/${csB}/approve`, "sue", "steward");
  ok(a1.status === 200 && a1.json.status === "in_review", "1st approval recorded, still in_review");
  const a2 = await call("POST", `/api/v1/changesets/${csB}/approve`, "sara", "steward");
  ok(a2.status === 200 && a2.json.status === "approved", "2nd approval meets quorum → approved");

  const m = await call("POST", `/api/v1/changesets/${csB}/merge`, "odette", "domain_owner");
  ok(m.status === 200 && m.json.status === "merged", "merged by domain_owner");

  const t = await getTrade();
  ok(t.version === "3.0.0", `projection reflects trade@3.0.0 after merge (got ${t.version})`);
}

console.log("\n— Scenario C: adding PII forces +1 governance approval —");
{
  const spec = await getTrade(); // now 3.0.0
  spec.fields.find((f) => f.name === "side").pii = true; // sensitivity escalation
  spec.version = "4.0.0";
  const r = await call("POST", "/api/v1/changesets", "sam", "steward", { title: "tag side as PII", edits: [{ kind: "bdm", id: "trade", spec }] });
  const csC = r.json.id;
  ok(r.json.requiresGovernance === true, "PII change flagged requiresGovernance");
  await call("POST", `/api/v1/changesets/${csC}/approve`, "sue", "steward");
  const two = await call("POST", `/api/v1/changesets/${csC}/approve`, "sara", "steward");
  ok(two.json.status === "in_review", "two steward approvals NOT enough without governance");
  const gov = await call("POST", `/api/v1/changesets/${csC}/approve`, "gail", "governance");
  ok(gov.json.status === "approved", "governance approval unlocks → approved");
}

console.log("\n— Immutable audit —");
{
  const r = await call("GET", "/api/v1/audit", "gail", "governance");
  ok(r.status === 200 && r.json.integrity.ok === true, `audit chain verifies (len ${r.json.integrity?.length})`);
  const viewer = await call("GET", "/api/v1/audit", "bob", "viewer");
  ok(viewer.status === 403, "audit read denied to viewer (RBAC)");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
