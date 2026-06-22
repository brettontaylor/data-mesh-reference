import assert from "node:assert/strict";
import { test } from "node:test";
import { egoNetwork, toGraph } from "../data/toGraph";
import type { SourceModel } from "../data/types";

const f = (name: string, extra: Partial<SourceModel["fields"][number]> = {}) => ({
  name, type: "string", classification: "internal", pii: false, mnpi: false, isPk: false, fkRef: null, ...extra,
});

const models: SourceModel[] = [
  { kind: "bdm", id: "trade", domain: "trading", version: "1.0.0", status: "active", fields: [
    f("trade_id", { isPk: true }),
    f("instrument_id", { fkRef: "instrument.instrument_id" }),
    f("counterparty_id", { fkRef: "counterparty.counterparty_id", classification: "confidential", mnpi: true }),
    f("dangling_id", { fkRef: "ghost.id" }), // FK to a non-included entity → badge only, no edge
  ] },
  { kind: "bdm", id: "instrument", domain: "reference", version: "1.0.0", status: "active", fields: [
    f("instrument_id", { isPk: true }),
    f("parent_id", { fkRef: "instrument.instrument_id" }), // self-reference
  ] },
  { kind: "bdm", id: "counterparty", domain: "reference", version: "1.0.0", status: "active", fields: [
    f("counterparty_id", { isPk: true, classification: "restricted", pii: true }),
  ] },
  { kind: "pdm", id: "trade_phys", domain: "trading", version: "1.0.0", status: "active", fields: [f("id", { isPk: true })] },
];

test("nodes: one per included model; kind filter applies", () => {
  assert.equal(toGraph(models).nodes.length, 4);
  assert.equal(toGraph(models, { kinds: ["bdm"] }).nodes.length, 3);
});

test("edges: one per resolvable FK; dangling FK produces no edge", () => {
  const g = toGraph(models, { kinds: ["bdm"] });
  const ids = g.edges.map((e) => e.id).sort();
  assert.deepEqual(ids, [
    "instrument.parent_id->instrument",
    "trade.counterparty_id->counterparty",
    "trade.instrument_id->instrument",
  ]);
  assert.ok(!g.edges.some((e) => e.target === "ghost"), "no edge to non-included entity");
});

test("edge carries FK field classification + self-ref flag", () => {
  const g = toGraph(models, { kinds: ["bdm"] });
  const cp = g.edges.find((e) => e.id === "trade.counterparty_id->counterparty")!;
  assert.equal(cp.tier, "confidential");
  const self = g.edges.find((e) => e.id === "instrument.parent_id->instrument")!;
  assert.equal(self.selfRef, true);
});

test("fkTarget + tierCounts derived on node fields", () => {
  const g = toGraph(models, { kinds: ["bdm"] });
  const trade = g.nodes.find((n) => n.id === "trade")!.data;
  assert.equal(trade.fields.find((x) => x.name === "instrument_id")!.fkTarget, "instrument");
  assert.equal(trade.tierCounts.confidential, 1);
  assert.equal(trade.tierCounts.internal, 3); // trade_id + instrument_id + dangling_id
});

test("egoNetwork returns focus + 1-hop neighbours", () => {
  const g = toGraph(models, { kinds: ["bdm"] });
  const ego = egoNetwork(g, "trade");
  assert.deepEqual([...ego].sort(), ["counterparty", "instrument", "trade"]);
});
