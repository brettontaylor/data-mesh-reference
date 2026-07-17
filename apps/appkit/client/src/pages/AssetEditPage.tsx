import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { AssetKind, AssetSpec, ChangesetEdit } from "../lib/api";
import {
  ApiError,
  ASSET_KINDS,
  createChangeset,
  errorMessage,
  getAsset,
  getMappingDocuments,
  listAssets,
} from "../lib/api";
import { useToast } from "../lib/toast";
import {
  DomainChips,
  ErrorNote,
  IssueList,
  Loading,
  TierBadge,
  VersionLevelChip,
} from "../lib/ui";
import { useApi } from "../lib/useApi";
import { useValidation, type ValidationState } from "../lib/useValidation";

// ---------------------------------------------------------------------------
// Starter templates (JSON fallback mode only)
// ---------------------------------------------------------------------------

const STARTER_TEMPLATES: Partial<Record<AssetKind, AssetSpec>> = {
  refmap: {
    version: "1.0.0",
    status: "draft",
    owner: "reference-data",
    description: "Reference mapping — normalizes source codes to canonical IDs",
    keyType: "SourceCode -> CanonicalID",
    entries: [
      { source: "SRC_A", target: "CANON_1" },
      { source: "SRC_B", target: "CANON_2" },
    ],
  },
  dq: {
    version: "1.0.0",
    status: "draft",
    owner: "data-quality",
    entity: "trade",
    rules: [
      { name: "trade_id_not_null", column: "trade_id", check: "not_null", severity: "error" },
      { name: "quantity_positive", column: "quantity", check: "gt_zero", severity: "warn" },
    ],
  },
  dqrule: {
    version: "1.0.0",
    status: "draft",
    owner: "data-governance",
    label: "New rule",
    scope: "column",
    check: "not_null",
    severity: "error",
    description: "What this generic rule enforces on the bound column",
    params: [],
    expression: "{{column}} IS NOT NULL",
  },
};

function isAssetKind(v: string | undefined): v is AssetKind {
  return v !== undefined && (ASSET_KINDS as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Structured BDM state
// ---------------------------------------------------------------------------

const BDM_GROUPS = ["reference", "transaction", "position"];
const FIELD_TYPES = [
  "string",
  "int",
  "bigint",
  "decimal(18,2)",
  "date",
  "timestamp",
  "boolean",
];
const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"];
const LOAD_STRATEGIES = ["full", "incremental"];

/** Spec-level keys owned by the structured BDM editor; everything else is preserved. */
const BDM_KNOWN = new Set(["entity", "label", "group", "grain", "owner", "source", "fields"]);
/** Field-level keys owned by the grid; everything else (fk, …) is preserved per row. */
const FIELD_KNOWN = new Set([
  "name",
  "type",
  "classification",
  "pk",
  "bk",
  "pii",
  "mnpi",
  "facet",
  "description",
]);
/** Spec-level keys owned by the structured PDM editor. */
const PDM_KNOWN = new Set(["pdm", "bdm", "owner", "source", "physical"]);
const PHYSICAL_KNOWN = new Set(["table", "loadStrategy", "uniqueKey", "partitionBy"]);
/** Spec-level keys owned by the structured MAPPING editor. */
const MAPPING_KNOWN = new Set(["mapping", "from", "to", "owner", "rules"]);
const MAPPING_REF_KNOWN = new Set(["kind", "id"]);
/** Rule-level keys owned by the rules grid. */
const MAPPING_RULE_KNOWN = new Set(["target", "sources", "logic", "description"]);
const MAPPING_LOGIC_OPTIONS = ["IDENTITY", "LOOKUP", "DERIVE", "SCD2_START"];

let fieldKeySeq = 0;
const nextFieldKey = () => ++fieldKeySeq;

interface BdmFieldRow {
  key: number;
  name: string;
  type: string;
  classification: string;
  pk: boolean;
  bk: boolean;
  pii: boolean;
  mnpi: boolean;
  facet: boolean;
  description: string;
  /** unknown keys from an existing spec (e.g. fk) — merged back on serialize */
  extra: Record<string, unknown>;
}

function emptyField(): BdmFieldRow {
  return {
    key: nextFieldKey(),
    name: "",
    type: "string",
    classification: "internal",
    pk: false,
    bk: false,
    pii: false,
    mnpi: false,
    facet: false,
    description: "",
    extra: {},
  };
}

interface BdmState {
  label: string;
  group: string;
  grain: string;
  owner: string;
  source: string;
  fields: BdmFieldRow[];
  /** unknown spec keys (version, status, upstream, dimensions, …) preserved on serialize */
  extras: Record<string, unknown>;
}

function defaultBdmState(): BdmState {
  return {
    label: "",
    group: "reference",
    grain: "",
    owner: "",
    source: "",
    fields: [{ ...emptyField(), pk: true }],
    extras: {},
  };
}

interface PdmState {
  bdm: string;
  owner: string;
  source: string;
  table: string;
  loadStrategy: string;
  uniqueKey: string;
  partitionBy: string;
  extras: Record<string, unknown>;
  physicalExtras: Record<string, unknown>;
}

function defaultPdmState(): PdmState {
  return {
    bdm: "",
    owner: "",
    source: "",
    table: "",
    loadStrategy: "full",
    uniqueKey: "",
    partitionBy: "",
    extras: {},
    physicalExtras: {},
  };
}

interface MappingRuleRow {
  key: number;
  target: string;
  /** comma-separated source column list — serialized to string[] */
  sources: string;
  logic: string;
  description: string;
  /** unknown rule keys preserved on serialize */
  extra: Record<string, unknown>;
}

function emptyMappingRule(): MappingRuleRow {
  return {
    key: nextFieldKey(),
    target: "",
    sources: "",
    logic: "IDENTITY",
    description: "",
    extra: {},
  };
}

interface MappingState {
  fromId: string;
  toBdm: string;
  owner: string;
  rules: MappingRuleRow[];
  /** unknown spec keys (version, status, …) preserved on serialize */
  extras: Record<string, unknown>;
  /** unknown keys inside from/to refs preserved on serialize */
  fromExtras: Record<string, unknown>;
  toExtras: Record<string, unknown>;
}

function defaultMappingState(): MappingState {
  return {
    fromId: "",
    toBdm: "",
    owner: "",
    rules: [emptyMappingRule()],
    extras: {},
    fromExtras: {},
    toExtras: {},
  };
}

// ---------------------------------------------------------------------------
// Spec <-> structured state (prefill + serialize)
// ---------------------------------------------------------------------------

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function splitExtras(
  spec: Record<string, unknown>,
  known: Set<string>,
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) {
    if (!known.has(k)) extras[k] = v;
  }
  return extras;
}

function bdmStateFromSpec(spec: AssetSpec): BdmState {
  const fields: BdmFieldRow[] = Array.isArray(spec.fields)
    ? (spec.fields as unknown[]).map((raw) => {
        const o = isRecord(raw) ? raw : {};
        return {
          key: nextFieldKey(),
          name: asStr(o.name),
          type: asStr(o.type) || "string",
          classification: asStr(o.classification) || "internal",
          pk: o.pk === true,
          bk: o.bk === true,
          pii: o.pii === true,
          mnpi: o.mnpi === true,
          facet: o.facet === true,
          description: asStr(o.description),
          extra: splitExtras(o, FIELD_KNOWN),
        };
      })
    : [];
  return {
    label: asStr(spec.label),
    group: asStr(spec.group) || "reference",
    grain: asStr(spec.grain),
    owner: asStr(spec.owner),
    source: asStr(spec.source),
    fields: fields.length > 0 ? fields : [emptyField()],
    extras: splitExtras(spec, BDM_KNOWN),
  };
}

function pdmStateFromSpec(spec: AssetSpec): PdmState {
  const phys = isRecord(spec.physical) ? spec.physical : {};
  return {
    bdm: asStr(spec.bdm),
    owner: asStr(spec.owner),
    source: asStr(spec.source),
    table: asStr(phys.table),
    loadStrategy: asStr(phys.loadStrategy) || "full",
    uniqueKey: asStr(phys.uniqueKey),
    partitionBy: asStr(phys.partitionBy),
    extras: splitExtras(spec, PDM_KNOWN),
    physicalExtras: splitExtras(phys, PHYSICAL_KNOWN),
  };
}

function mappingStateFromSpec(spec: AssetSpec): MappingState {
  const from = isRecord(spec.from) ? spec.from : {};
  const to = isRecord(spec.to) ? spec.to : {};
  const rules: MappingRuleRow[] = Array.isArray(spec.rules)
    ? (spec.rules as unknown[]).map((raw) => {
        const o = isRecord(raw) ? raw : {};
        const sources = Array.isArray(o.sources)
          ? (o.sources as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
        return {
          key: nextFieldKey(),
          target: asStr(o.target),
          sources: sources.join(", "),
          logic: asStr(o.logic),
          description: asStr(o.description),
          extra: splitExtras(o, MAPPING_RULE_KNOWN),
        };
      })
    : [];
  return {
    fromId: asStr(from.id),
    toBdm: asStr(to.id),
    owner: asStr(spec.owner),
    rules: rules.length > 0 ? rules : [emptyMappingRule()],
    extras: splitExtras(spec, MAPPING_KNOWN),
    fromExtras: splitExtras(from, MAPPING_REF_KNOWN),
    toExtras: splitExtras(to, MAPPING_REF_KNOWN),
  };
}

function serializeBdm(id: string, s: BdmState): AssetSpec {
  const spec: AssetSpec = {
    ...s.extras,
    entity: id,
    label: s.label,
    group: s.group,
    grain: s.grain,
    owner: s.owner,
    source: s.source,
    fields: s.fields.map((f) => {
      const o: Record<string, unknown> = {
        ...f.extra,
        name: f.name,
        type: f.type,
        classification: f.classification,
      };
      if (f.pk) o.pk = true;
      if (f.bk) o.bk = true;
      if (f.pii) o.pii = true;
      if (f.mnpi) o.mnpi = true;
      if (f.facet) o.facet = true;
      if (f.description !== "") o.description = f.description;
      return o;
    }),
  };
  if (typeof spec.version !== "string") spec.version = "1.0.0";
  if (typeof spec.status !== "string") spec.status = "draft";
  return spec;
}

function serializePdm(id: string, s: PdmState): AssetSpec {
  const physical: Record<string, unknown> = {
    ...s.physicalExtras,
    table: s.table,
    loadStrategy: s.loadStrategy,
    uniqueKey: s.uniqueKey,
  };
  if (s.partitionBy.trim() !== "") physical.partitionBy = s.partitionBy.trim();
  const spec: AssetSpec = {
    ...s.extras,
    pdm: id,
    bdm: s.bdm,
    owner: s.owner,
    source: s.source,
    physical,
  };
  if (typeof spec.version !== "string") spec.version = "1.0.0";
  if (typeof spec.status !== "string") spec.status = "draft";
  return spec;
}

function serializeMapping(id: string, s: MappingState): AssetSpec {
  const spec: AssetSpec = {
    ...s.extras,
    mapping: id,
    from: { ...s.fromExtras, kind: "source", id: s.fromId.trim() },
    to: { ...s.toExtras, kind: "bdm", id: s.toBdm.trim() },
    owner: s.owner,
    rules: s.rules.map((r) => {
      const o: Record<string, unknown> = { ...r.extra, target: r.target.trim() };
      const sources = r.sources
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== "");
      if (sources.length > 0) o.sources = sources;
      if (r.logic.trim() !== "") o.logic = r.logic.trim();
      if (r.description !== "") o.description = r.description;
      return o;
    }),
  };
  if (typeof spec.version !== "string") spec.version = "1.0.0";
  if (typeof spec.status !== "string") spec.status = "draft";
  return spec;
}

/** Field names of a BDM spec — for the rules grid target datalist + coverage hint. */
function bdmFieldNames(spec: AssetSpec): string[] {
  if (!Array.isArray(spec.fields)) return [];
  const names: string[] = [];
  for (const raw of spec.fields as unknown[]) {
    if (isRecord(raw) && typeof raw.name === "string" && raw.name !== "") {
      names.push(raw.name);
    }
  }
  return names;
}

/** Keep a select usable when an existing spec holds an out-of-catalog value. */
function withCurrent(options: string[], current: string): string[] {
  return current !== "" && !options.includes(current) ? [current, ...options] : options;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetEditPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const editingKind = isAssetKind(params.kind) ? params.kind : undefined;
  const editingId = params.id;
  const isEdit = editingKind !== undefined && editingId !== undefined;

  // "/assets/new?kind=dqrule" preselects the kind for new assets.
  const presetKind = searchParams.get("kind") ?? undefined;

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AssetKind>(
    editingKind ?? (isAssetKind(presetKind) ? presetKind : "refmap"),
  );
  const [assetId, setAssetId] = useState(editingId ?? "");
  const [specText, setSpecText] = useState("");
  const [bdm, setBdm] = useState<BdmState>(defaultBdmState);
  const [pdm, setPdm] = useState<PdmState>(defaultPdmState);
  const [mapping, setMapping] = useState<MappingState>(defaultMappingState);
  const [loadingSpec, setLoadingSpec] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mode: "bdm" | "pdm" | "mapping" | "json" =
    kind === "bdm" ? "bdm" : kind === "pdm" ? "pdm" : kind === "mapping" ? "mapping" : "json";

  // BDM entity list for the PDM creator's bdm select and the mapping creator's to-BDM select.
  const bdmAssets = useApi(() => listAssets("bdm"), []);
  // Existing mapping docs — source-id suggestions for the mapping creator
  // (sources are contract-level, not listed as assets).
  const mappingDocs = useApi(
    () => (mode === "mapping" ? getMappingDocuments() : Promise.resolve(null)),
    [mode],
  );
  const sourceIdOptions = useMemo(() => {
    const ids = (mappingDocs.data?.bronzeToSilver ?? []).map((m) => m.from.id);
    return [...new Set(ids)];
  }, [mappingDocs.data]);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    setLoadingSpec(true);
    getAsset(editingKind, editingId)
      .then((spec) => {
        if (!alive) return;
        if (editingKind === "bdm") setBdm(bdmStateFromSpec(spec));
        else if (editingKind === "pdm") setPdm(pdmStateFromSpec(spec));
        else if (editingKind === "mapping") setMapping(mappingStateFromSpec(spec));
        else setSpecText(JSON.stringify(spec, null, 2));
        setTitle(`Edit ${editingKind}/${editingId}`);
        setLoadingSpec(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(errorMessage(e));
        setLoadingSpec(false);
      });
    return () => {
      alive = false;
    };
  }, [isEdit, editingKind, editingId]);

  const jsonError = useMemo(() => {
    if (mode !== "json") return null;
    if (specText.trim() === "") return "Spec is required.";
    try {
      const parsed: unknown = JSON.parse(specText);
      if (!isRecord(parsed)) return "Spec must be a JSON object.";
      return null;
    } catch (e) {
      return `Invalid JSON: ${errorMessage(e)}`;
    }
  }, [mode, specText]);

  // Current edit, recomputed each render — useValidation dedupes by value.
  const buildSpec = (): AssetSpec | null => {
    const id = assetId.trim();
    if (id === "") return null;
    if (mode === "bdm") return serializeBdm(id, bdm);
    if (mode === "pdm") return serializePdm(id, pdm);
    if (mode === "mapping") return serializeMapping(id, mapping);
    if (jsonError !== null) return null;
    return JSON.parse(specText) as AssetSpec;
  };

  const spec = loadingSpec ? null : buildSpec();
  const currentEdits: ChangesetEdit[] | null =
    spec === null ? null : [{ kind, id: assetId.trim(), spec }];

  const validation = useValidation(currentEdits);

  const canSubmit =
    title.trim() !== "" &&
    assetId.trim() !== "" &&
    spec !== null &&
    !submitting &&
    !validation.validating &&
    validation.result !== null &&
    validation.result.valid;

  const onSubmit = async () => {
    if (!canSubmit || spec === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cs = await createChangeset({
        title: title.trim(),
        edits: [{ kind, id: assetId.trim(), spec }],
      });
      toast(
        `Proposed as Tier ${cs.tier}${
          cs.tier === 2
            ? " — requires CDA sign-off"
            : " — routes to domain steward(s)"
        }: ${title.trim()}`,
        "ok",
      );
      navigate("/changesets");
    } catch (e) {
      let msg = errorMessage(e);
      if (e instanceof ApiError && e.status === 422) {
        msg = `Contract-breaking change rejected (422): ${msg}`;
      } else if (e instanceof ApiError && e.status === 403) {
        msg = `Not permitted (403): ${msg} — switch persona to Alice (Modeler).`;
      }
      setSubmitError(msg);
      setSubmitting(false);
    }
  };

  const template = STARTER_TEMPLATES[kind];

  return (
    <div className="page">
      <p className="crumbs">
        {isEdit ? (
          <Link to={`/assets/${editingKind}/${editingId}`} className="muted small-link">
            ← {editingKind}/{editingId}
          </Link>
        ) : (
          <Link to="/assets" className="muted small-link">
            ← assets
          </Link>
        )}
      </p>
      <h2>{isEdit ? `Propose edit — ${editingKind}/${editingId}` : "Propose new asset"}</h2>
      <p className="muted">
        Submitting creates a <strong>changeset</strong> for maker/checker review — nothing
        is merged until a steward approves and a domain owner merges. The rules enforcer
        validates every keystroke against the live contract without saving anything.
      </p>

      {loadingSpec && <Loading label="Loading current spec…" />}
      {loadError && <ErrorNote message={loadError} />}

      {!loadingSpec && (
        <div className="editor-layout">
          <div className="panel form-panel editor-main">
            <label className="form-row">
              <span className="form-label">Changeset title</span>
              <input
                className="input"
                type="text"
                value={title}
                placeholder="e.g. Add settlement currency reference map"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <div className="form-grid">
              <label className="form-row">
                <span className="form-label">Kind</span>
                <select
                  className="input"
                  value={kind}
                  disabled={isEdit}
                  onChange={(e) => setKind(e.target.value as AssetKind)}
                >
                  {ASSET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-row">
                <span className="form-label">
                  {mode === "bdm"
                    ? "Entity ID"
                    : mode === "pdm"
                      ? "PDM ID"
                      : mode === "mapping"
                        ? "Mapping ID"
                        : "Asset ID"}
                </span>
                <input
                  className="input"
                  type="text"
                  value={assetId}
                  disabled={isEdit}
                  placeholder={
                    mode === "bdm"
                      ? "e.g. settlement"
                      : mode === "pdm"
                        ? "e.g. settlement_physical"
                        : mode === "mapping"
                          ? "e.g. settlement_src_to_bdm"
                          : "e.g. ccy-settlement"
                  }
                  onChange={(e) => setAssetId(e.target.value)}
                />
              </label>
            </div>

            {mode === "bdm" && <BdmEditor state={bdm} onChange={setBdm} />}
            {mode === "pdm" && (
              <PdmEditor
                state={pdm}
                onChange={setPdm}
                bdmIds={(bdmAssets.data ?? []).map((a) => a.id)}
              />
            )}
            {mode === "mapping" && (
              <MappingEditor
                state={mapping}
                onChange={setMapping}
                bdmIds={(bdmAssets.data ?? []).map((a) => a.id)}
                sourceIdOptions={sourceIdOptions}
              />
            )}
            {mode === "json" && (
              <div className="form-row">
                <div className="form-label-row">
                  <span className="form-label">Spec (JSON)</span>
                  {!isEdit && template && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setSpecText(JSON.stringify(template, null, 2))}
                    >
                      Insert {kind} starter template
                    </button>
                  )}
                </div>
                <textarea
                  className={`input spec-editor ${jsonError && specText !== "" ? "input-invalid" : ""}`}
                  spellCheck={false}
                  value={specText}
                  placeholder='{ "version": "1.0.0", "status": "draft", … }'
                  onChange={(e) => setSpecText(e.target.value)}
                />
                {jsonError && specText !== "" && <p className="inline-error">{jsonError}</p>}
              </div>
            )}

            {submitError && <ErrorNote message={submitError} />}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSubmit}
                title={
                  validation.result !== null && !validation.result.valid
                    ? "Blocked by the rules enforcer — fix the errors first."
                    : undefined
                }
                onClick={() => void onSubmit()}
              >
                {submitting ? "Submitting…" : "Submit changeset"}
              </button>
              <button type="button" className="btn" onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>
          </div>

          <EnforcerPanel state={validation} idle={currentEdits === null} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structured BDM creator
// ---------------------------------------------------------------------------

function BdmEditor({
  state,
  onChange,
}: {
  state: BdmState;
  onChange: (s: BdmState) => void;
}) {
  const set = (patch: Partial<BdmState>) => onChange({ ...state, ...patch });
  const setField = (key: number, patch: Partial<BdmFieldRow>) =>
    set({
      fields: state.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    });

  return (
    <>
      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">Group</span>
          <select
            className="input"
            value={state.group}
            onChange={(e) => set({ group: e.target.value })}
          >
            {withCurrent(BDM_GROUPS, state.group).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span className="form-label">Label</span>
          <input
            className="input"
            type="text"
            value={state.label}
            placeholder="e.g. Settlement"
            onChange={(e) => set({ label: e.target.value })}
          />
        </label>
      </div>

      <label className="form-row">
        <span className="form-label">Grain</span>
        <input
          className="input"
          type="text"
          value={state.grain}
          placeholder="e.g. one row per settlement instruction"
          onChange={(e) => set({ grain: e.target.value })}
        />
      </label>

      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">Owner</span>
          <input
            className="input"
            type="text"
            value={state.owner}
            placeholder="e.g. reference-data"
            onChange={(e) => set({ owner: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Source</span>
          <input
            className="input"
            type="text"
            value={state.source}
            placeholder="e.g. reference_feed"
            onChange={(e) => set({ source: e.target.value })}
          />
          <span className="field-hint muted">
            Must match a source id defined in the contract — the enforcer flags unknown
            sources live.
          </span>
        </label>
      </div>

      <div className="form-row">
        <div className="form-label-row">
          <span className="form-label">Fields</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => set({ fields: [...state.fields, emptyField()] })}
          >
            + Add field
          </button>
        </div>
        <div className="fields-grid-wrap">
          <table className="data-table fields-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Classification</th>
                <th title="Primary key">PK</th>
                <th title="Business key">BK</th>
                <th title="Personally identifiable information">PII</th>
                <th title="Material non-public information">MNPI</th>
                <th title="Facet / dimension attribute">Facet</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.fields.map((f) => (
                <tr key={f.key}>
                  <td>
                    <input
                      className="input cell-input"
                      type="text"
                      value={f.name}
                      placeholder="field_name"
                      onChange={(e) => setField(f.key, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input cell-input"
                      type="text"
                      list="bdm-field-types"
                      value={f.type}
                      onChange={(e) => setField(f.key, { type: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="input cell-input"
                      value={f.classification}
                      onChange={(e) => setField(f.key, { classification: e.target.value })}
                    >
                      {withCurrent(CLASSIFICATIONS, f.classification).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(["pk", "bk", "pii", "mnpi", "facet"] as const).map((flag) => (
                    <td key={flag} className="cell-check">
                      <input
                        type="checkbox"
                        checked={f[flag]}
                        onChange={(e) => setField(f.key, { [flag]: e.target.checked })}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      className="input cell-input cell-desc"
                      type="text"
                      value={f.description}
                      placeholder="What this field means"
                      onChange={(e) => setField(f.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="cell-check">
                    <button
                      type="button"
                      className="btn btn-small btn-err row-remove"
                      title="Remove field"
                      disabled={state.fields.length === 1}
                      onClick={() =>
                        set({ fields: state.fields.filter((x) => x.key !== f.key) })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="bdm-field-types">
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Structured PDM creator
// ---------------------------------------------------------------------------

function PdmEditor({
  state,
  onChange,
  bdmIds,
}: {
  state: PdmState;
  onChange: (s: PdmState) => void;
  bdmIds: string[];
}) {
  const set = (patch: Partial<PdmState>) => onChange({ ...state, ...patch });
  const bdmOptions = withCurrent(bdmIds, state.bdm);

  return (
    <>
      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">BDM entity</span>
          <select
            className="input"
            value={state.bdm}
            onChange={(e) => set({ bdm: e.target.value })}
          >
            <option value="">— select entity —</option>
            {bdmOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span className="form-label">Owner</span>
          <input
            className="input"
            type="text"
            value={state.owner}
            placeholder="e.g. platform-eng"
            onChange={(e) => set({ owner: e.target.value })}
          />
        </label>
      </div>

      <label className="form-row">
        <span className="form-label">Source</span>
        <input
          className="input"
          type="text"
          value={state.source}
          placeholder="e.g. reference_feed"
          onChange={(e) => set({ source: e.target.value })}
        />
        <span className="field-hint muted">
          Must match a source id defined in the contract.
        </span>
      </label>

      <div className="form-label-row">
        <span className="form-label">Physical binding</span>
      </div>
      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">Table</span>
          <input
            className="input"
            type="text"
            value={state.table}
            placeholder="e.g. GOLD.SETTLEMENT"
            onChange={(e) => set({ table: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Load strategy</span>
          <select
            className="input"
            value={state.loadStrategy}
            onChange={(e) => set({ loadStrategy: e.target.value })}
          >
            {withCurrent(LOAD_STRATEGIES, state.loadStrategy).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">Unique key</span>
          <input
            className="input"
            type="text"
            value={state.uniqueKey}
            placeholder="e.g. settlement_id"
            onChange={(e) => set({ uniqueKey: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Partition by (optional)</span>
          <input
            className="input"
            type="text"
            value={state.partitionBy}
            placeholder="e.g. settlement_date"
            onChange={(e) => set({ partitionBy: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Structured MAPPING creator (bronze→silver source-to-BDM field rules)
// ---------------------------------------------------------------------------

function MappingEditor({
  state,
  onChange,
  bdmIds,
  sourceIdOptions,
}: {
  state: MappingState;
  onChange: (s: MappingState) => void;
  bdmIds: string[];
  sourceIdOptions: string[];
}) {
  const set = (patch: Partial<MappingState>) => onChange({ ...state, ...patch });
  const setRule = (key: number, patch: Partial<MappingRuleRow>) =>
    set({
      rules: state.rules.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    });

  const bdmOptions = withCurrent(bdmIds, state.toBdm);

  // Target-field catalog of the selected BDM — drives the target datalist and
  // the live coverage hint.
  const toBdm = state.toBdm;
  const targetFields = useApi(
    () =>
      toBdm === ""
        ? Promise.resolve<string[]>([])
        : getAsset("bdm", toBdm).then(bdmFieldNames),
    [toBdm],
  );
  const fieldNames = targetFields.data ?? [];

  const mappedCount = useMemo(() => {
    const targets = new Set(
      state.rules.map((r) => r.target.trim()).filter((t) => t !== ""),
    );
    return fieldNames.filter((f) => targets.has(f)).length;
  }, [state.rules, fieldNames]);

  return (
    <>
      <div className="form-grid">
        <label className="form-row">
          <span className="form-label">From source</span>
          <input
            className="input"
            type="text"
            list="mapping-source-ids"
            value={state.fromId}
            placeholder="source id, e.g. trades_feed"
            onChange={(e) => set({ fromId: e.target.value })}
          />
          <span className="field-hint muted">
            Must match a source id defined in the contract — the enforcer flags unknown
            sources live.
          </span>
          <datalist id="mapping-source-ids">
            {withCurrent(sourceIdOptions, state.fromId).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="form-row">
          <span className="form-label">To BDM entity</span>
          <select
            className="input"
            value={state.toBdm}
            onChange={(e) => set({ toBdm: e.target.value })}
          >
            <option value="">— select entity —</option>
            {bdmOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="form-row">
        <span className="form-label">Owner</span>
        <input
          className="input"
          type="text"
          value={state.owner}
          placeholder="e.g. trading-data-eng"
          onChange={(e) => set({ owner: e.target.value })}
        />
      </label>

      <div className="form-row">
        <div className="form-label-row">
          <span className="form-label">Field rules</span>
          <span className="coverage-hint">
            {state.toBdm === "" ? (
              <span className="muted">select a BDM to track coverage</span>
            ) : targetFields.loading ? (
              <span className="muted">loading target fields…</span>
            ) : fieldNames.length === 0 ? (
              <span className="muted">no target fields found</span>
            ) : (
              <span className={mappedCount === fieldNames.length ? "ok-note" : "muted"}>
                mapped {mappedCount} of {fieldNames.length} target fields
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => set({ rules: [...state.rules, emptyMappingRule()] })}
          >
            + Add rule
          </button>
        </div>
        <div className="fields-grid-wrap">
          <table className="data-table fields-grid">
            <thead>
              <tr>
                <th>Target field</th>
                <th title="Comma-separated source columns">Sources</th>
                <th title="IDENTITY / LOOKUP / DERIVE / SCD2_START or a free expression">
                  Logic
                </th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.rules.map((r) => (
                <tr key={r.key}>
                  <td>
                    <input
                      className="input cell-input"
                      type="text"
                      list="mapping-target-fields"
                      value={r.target}
                      placeholder="target_field"
                      onChange={(e) => setRule(r.key, { target: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input cell-input"
                      type="text"
                      value={r.sources}
                      placeholder="src_col_a, src_col_b"
                      onChange={(e) => setRule(r.key, { sources: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input cell-input"
                      type="text"
                      list="mapping-logic-options"
                      value={r.logic}
                      placeholder="IDENTITY"
                      onChange={(e) => setRule(r.key, { logic: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input cell-input cell-desc"
                      type="text"
                      value={r.description}
                      placeholder="What this rule does"
                      onChange={(e) => setRule(r.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="cell-check">
                    <button
                      type="button"
                      className="btn btn-small btn-err row-remove"
                      title="Remove rule"
                      disabled={state.rules.length === 1}
                      onClick={() =>
                        set({ rules: state.rules.filter((x) => x.key !== r.key) })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="field-hint muted">
          Rule targets are validated against the selected BDM&apos;s fields — an unknown
          target raises <code className="mono-id">MAPPING_TARGET_FIELD_UNKNOWN</code> in the
          enforcer.
        </span>
        <datalist id="mapping-target-fields">
          {fieldNames.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <datalist id="mapping-logic-options">
          {MAPPING_LOGIC_OPTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared enforcer panel (live rules + tier + version plan)
// ---------------------------------------------------------------------------

function EnforcerPanel({ state, idle }: { state: ValidationState; idle: boolean }) {
  const { result, validating, error } = state;
  return (
    <aside className="panel enforcer-panel">
      <div className="enforcer-head">
        <h3>Rules enforcer</h3>
        {validating ? (
          <span className="chip chip-muted enforcer-status">checking…</span>
        ) : result !== null && !idle ? (
          result.valid ? (
            <span className="chip chip-ok">passes</span>
          ) : (
            <span className="chip chip-err">blocked</span>
          )
        ) : null}
      </div>

      {error && <ErrorNote message={error} />}

      {idle && !validating && (
        <p className="muted">
          Give the asset an ID and start editing — every change is checked live against
          the governed contract. Nothing is saved until you submit.
        </p>
      )}

      {!idle && result !== null && (
        <>
          <h4>Rule issues</h4>
          {result.issues.length === 0 ? (
            <p className="ok-note">No rule violations.</p>
          ) : (
            <IssueList issues={result.issues} />
          )}

          <h4>
            Approval tier <TierBadge tier={result.tier} reasons={result.tierReasons} />
          </h4>
          {result.tierReasons.length > 0 ? (
            <ul className="tier-reasons">
              {result.tierReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="muted enforcer-sub">
              Tier 1 — minor change; routes to the owning domain&apos;s steward(s).
            </p>
          )}

          <h4>Domains</h4>
          <DomainChips domains={result.domains} />

          <h4>Version plan</h4>
          <ul className="version-plan">
            {result.versionPlan.map((v) => (
              <li key={`${v.kind}/${v.id}`}>
                <span className="chip chip-muted">{v.kind}</span>{" "}
                <code className="mono-id">{v.id}</code>{" "}
                <span className="version-plan-text">
                  {v.level === "initial" ? (
                    <>
                      starts at <strong>{v.next}</strong>
                    </>
                  ) : v.level === "delete" ? (
                    <>retired{v.current !== undefined ? ` (was ${v.current})` : ""}</>
                  ) : v.level === "none" ? (
                    <>unchanged at {v.next}</>
                  ) : (
                    <>
                      {v.current} → <strong>{v.next}</strong>
                    </>
                  )}
                </span>{" "}
                <VersionLevelChip level={v.level} />
              </li>
            ))}
          </ul>
          <p className="muted enforcer-note">
            Versions are computed by the platform — patch for cosmetic, minor for
            additive, major for breaking. Any version in your spec is overridden by
            auto-semver (only a brand-new asset keeps its initial version).
          </p>
        </>
      )}
    </aside>
  );
}
