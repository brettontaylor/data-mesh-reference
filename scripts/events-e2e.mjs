// End-to-end events test: webhook delivery, HMAC signing, dead-letter + replay,
// breaking-change notification. Spins up local receivers and drives the live API.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const BASE = process.env.DCT_API ?? "http://localhost:4400";
let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`${c ? "✓" : "✗ FAIL"} ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECRET = "whsec_test_123";
const good = [];
let flakyHealthy = false;
const flakyReceived = [];

function receiver(port, onReq) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => onReq(req, body, res));
    });
    srv.listen(port, () => resolve(srv));
  });
}

const hdr = (user, roles, withBody) => ({
  ...(withBody ? { "content-type": "application/json" } : {}),
  "x-dct-user": user, "x-dct-roles": roles, "x-dct-domains": "*",
});
const call = async (method, path, user, roles, body) =>
  (await fetch(`${BASE}${path}`, { method, headers: hdr(user, roles, body != null), body: body != null ? JSON.stringify(body) : undefined })).json();

const srvGood = await receiver(4611, (req, body, res) => {
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");
  good.push({ type: req.headers["x-dct-event"], sigOk: sig === req.headers["x-dct-signature"], event: JSON.parse(body) });
  res.writeHead(200); res.end("ok");
});
const srvFlaky = await receiver(4612, (req, body, res) => {
  if (!flakyHealthy) { res.writeHead(500); res.end("down"); return; }
  flakyReceived.push(JSON.parse(body)); res.writeHead(200); res.end("ok");
});

console.log("\n— register webhooks —");
await call("POST", "/api/v1/webhooks", "dev", "viewer", { url: "http://localhost:4611/hook", secret: SECRET, events: ["*"] });
await call("POST", "/api/v1/webhooks", "dev", "viewer", { url: "http://localhost:4612/hook", secret: SECRET, events: ["pipeline.run.completed"] });
ok(true, "registered healthy (*) and flaky (pipeline.run.completed) webhooks");

console.log("\n— breaking change → change.proposed notification —");
{
  const spec = (await call("GET", "/api/v1/models/bdm/trade", "v", "viewer")).spec;
  spec.fields.find((f) => f.name === "price").type = "decimal(20,6)";
  spec.version = "3.0.0";
  await call("POST", "/api/v1/changesets", "sam", "steward", { title: "widen price", edits: [{ kind: "bdm", id: "trade", spec }] });
  await sleep(100);
  const proposed = good.find((g) => g.type === "change.proposed");
  ok(!!proposed, "healthy webhook received change.proposed");
  ok(proposed?.sigOk === true, "HMAC signature valid on delivered event");
  ok(proposed?.event.payload.breaking === true, "event flags breaking=true");
}

console.log("\n— pipeline run → delivery + flaky DLQ —");
{
  await call("POST", "/api/v1/pipelines/trades_feed/trigger?env=dev", "pat", "platform_engineer", {});
  await sleep(400); // allow retries to exhaust on the flaky endpoint
  ok(good.some((g) => g.type === "pipeline.run.completed"), "healthy webhook received pipeline.run.completed");
  const dlq = (await call("GET", "/api/v1/webhooks/dlq", "gail", "governance")).deadLetters;
  ok(dlq.length >= 1, `flaky delivery dead-lettered after retries (dlq=${dlq.length})`);

  console.log("  …healing flaky endpoint and replaying");
  flakyHealthy = true;
  const dlqId = dlq[0].id;
  const replay = await call("POST", `/api/v1/webhooks/dlq/${dlqId}/replay`, "gail", "governance", {});
  await sleep(100);
  ok(replay.ok === true && flakyReceived.length >= 1, "replay re-delivers the dead-lettered event");
  const dlq2 = (await call("GET", "/api/v1/webhooks/dlq", "gail", "governance")).deadLetters;
  ok(dlq2.length === dlq.length - 1, "replayed event removed from DLQ");
}

console.log("\n— event feed + RBAC —");
{
  const feed = (await call("GET", "/api/v1/events", "v", "viewer")).events;
  ok(feed.length >= 2, `event feed lists domain events (${feed.length})`);
  const denied = await fetch(`${BASE}/api/v1/webhooks/dlq`, { headers: hdr("v", "viewer", false) });
  ok(denied.status === 403, "DLQ read denied to viewer (RBAC)");
}

srvGood.close(); srvFlaky.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
