-- Mapping and Metadata Platform (AppKit app) — OLTP workflow schema (Lakebase Postgres).
-- Applied idempotently at boot by SqlRepo.init(); kept here as the reviewable
-- reference DDL. Governed asset DEFINITIONS are not stored here — the contract
-- (git) is their source of truth. The migrated data-plane tables live in the
-- engine-generated DDL: packages/engine/generated/postgres/schema.sql.

CREATE SCHEMA IF NOT EXISTS dct_app;

-- Maker/checker changesets (proposals over governed assets).
-- Two-tier framework: tier 1 (minor) routes to the owning domain's approvers;
-- tier 2 (impactful/breaking) requires chief-data-architect/ARB sign-off.
CREATE TABLE IF NOT EXISTS dct_app.changeset (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  status       text NOT NULL,          -- proposed | approved | rejected | merged | withdrawn
  author       text NOT NULL,          -- principal sub (maker)
  decided_by   text,                   -- principal sub (checker; != author)
  created_at   timestamptz NOT NULL,
  decided_at   timestamptz,
  edits        jsonb NOT NULL DEFAULT '[]',  -- [{kind,id,action?,spec}]
  issues       jsonb NOT NULL DEFAULT '[]',  -- governance issues at proposal time
  tier         integer NOT NULL DEFAULT 1,   -- 1 minor | 2 impactful/breaking
  tier_reasons jsonb NOT NULL DEFAULT '[]',  -- why it escalated to tier 2
  domains      jsonb NOT NULL DEFAULT '[]',  -- owning domains (tier-1 routing)
  version_notes jsonb NOT NULL DEFAULT '[]'  -- auto-semver increments, per edit
);
-- NOTE (existing databases): CREATE TABLE IF NOT EXISTS does not add columns.
-- Migrate a pre-tier database with:
--   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 1;
--   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS tier_reasons jsonb NOT NULL DEFAULT '[]';
--   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS domains jsonb NOT NULL DEFAULT '[]';
--   ALTER TABLE dct_app.changeset ADD COLUMN IF NOT EXISTS version_notes jsonb NOT NULL DEFAULT '[]';
--   ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
--   ALTER TABLE dct_app.pipeline_run ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '[]';

-- Pipeline run history (medallion bronze→silver→gold + governance gates).
CREATE TABLE IF NOT EXISTS dct_app.pipeline_run (
  id           text PRIMARY KEY,
  pipeline     text NOT NULL,          -- e.g. 'medallion'
  status       text NOT NULL,          -- succeeded | failed
  triggered_by text NOT NULL,
  started_at   timestamptz NOT NULL,
  duration_ms  integer NOT NULL,
  stats        jsonb NOT NULL DEFAULT '[]',  -- LayerStats[] per entity (incl. dq results)
  gates        jsonb NOT NULL DEFAULT '{}',  -- {contract: Issue[], propagation: Issue[]}
  trigger      text NOT NULL DEFAULT 'manual',   -- manual | product-increment
  products     jsonb NOT NULL DEFAULT '[]'       -- [{product, version}] for increment runs
);
