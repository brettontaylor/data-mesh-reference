// Pure data types for the ERD module. No React / React Flow imports here so the
// mapper stays unit-testable and dependency-free.

export type Tier = "public" | "internal" | "confidential" | "restricted";
export const TIERS: Tier[] = ["public", "internal", "confidential", "restricted"];
export const asTier = (c: string): Tier => (TIERS.includes(c as Tier) ? (c as Tier) : "internal");

/** The subset of a DCT SdkModel/SdkField the ERD needs. Structurally compatible
 *  with @dct/sdk, so the host can pass SdkModel[] directly — no coupling. */
export interface SourceField {
  name: string;
  type: string;
  classification: string;
  pii: boolean;
  mnpi: boolean;
  isPk: boolean;
  fkRef: string | null; // "entity.field" | null
}
export interface SourceModel {
  kind: string; // "bdm" | "pdm" | "semantic" | "source"
  id: string;
  domain: string;
  version: string;
  status: string;
  owner?: string | null;
  dependsOn?: string[];
  fields: SourceField[];
}

export interface FieldView extends SourceField {
  fkTarget: string | null; // entity portion of fkRef, if it resolves
}

export interface EntityData {
  id: string;
  kind: string;
  domain: string;
  version: string;
  status: string;
  fields: FieldView[];
  tierCounts: Record<Tier, number>;
}

export interface EdgeSpec {
  id: string;
  source: string; // FK holder (the "many" side)
  target: string; // referenced entity (the "one" side, holds the PK)
  sourceField: string;
  targetField: string;
  tier: Tier; // classification of the FK field — drives edge styling
  selfRef: boolean;
}

export interface GraphModel {
  nodes: { id: string; data: EntityData }[];
  edges: EdgeSpec[];
}

export interface ToGraphOptions {
  kinds?: string[]; // restrict to certain model kinds, e.g. ["bdm"]
}
