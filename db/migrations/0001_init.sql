-- Mapping and Metadata Platform — projection schema (Phase 1).
-- The projection is a rebuildable read-model of the Git models repo (the SoR).
-- Workflow/audit/lineage tables are added in later phases (see docs/platform/02).

CREATE TABLE IF NOT EXISTS domain (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  model_count int  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS model (
  kind        text NOT NULL,                 -- bdm | pdm | semantic | source
  id          text NOT NULL,
  domain      text NOT NULL,
  version     text NOT NULL,                 -- semver
  status      text NOT NULL,                 -- draft|active|deprecated|retired
  owner       text,
  description text,
  upstream    text,                          -- BDMs: originating upstream system
  signature   text NOT NULL,                 -- control-surface hash
  tags        text[] NOT NULL DEFAULT '{}',
  depends_on  text[] NOT NULL DEFAULT '{}',
  fields      jsonb  NOT NULL DEFAULT '[]',  -- flattened BDM fields
  detail      jsonb  NOT NULL DEFAULT '{}',  -- kind-specific detail
  spec        jsonb  NOT NULL,               -- full parsed definition
  source_sha  text   NOT NULL,               -- git commit/content hash projected from
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS model_domain_idx ON model (domain);
CREATE INDEX IF NOT EXISTS model_fts_idx ON model
  USING gin (to_tsvector('english', id || ' ' || coalesce(description, '')));

CREATE TABLE IF NOT EXISTS projection_meta (
  id            int PRIMARY KEY DEFAULT 1,
  source_sha    text,
  reconciled_at timestamptz,
  policy        jsonb NOT NULL DEFAULT '{"defaultRole":"","tiers":[],"roles":[]}',
  CONSTRAINT single_row CHECK (id = 1)
);
