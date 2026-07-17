# Mapping and Metadata Platform — Data Mesh Reference (monorepo)

> **Evolving into a product.** This repo is becoming **Mapping and Metadata Platform**, an
> enterprise metadata management & governance control plane. The proven engine
> below now lives in [`packages/engine`](packages/engine); the full platform design
> (services, UI, adapters, metastore, workflows) is in
> [`docs/platform/`](docs/platform/README.md). It is a pnpm + Turborepo workspace.

A generic, **illustrative** reference architecture for a metadata-driven data
mesh. One governed contract is the single source of truth; everything downstream
is generated from it:

```
contracts/  ──►  Databricks medallion pipelines   (bronze → silver → gold)
            ──►  Cube semantic models             (published, classified)
            ──►  Snowflake serving DDL            (masking + roles)
            ──►  data-product catalog             (machine-readable)
```

> **Generic & illustrative.** Synthetic capital-markets data only — no real
> entity, dataset, or proprietary schema. Free to read, run, and adapt. Published
> by [Semantic Quay](https://semanticquay.com) as a reference, not a product.

## Why

Institutions already have the hard part: robust, controlled business and physical
data models (BDMs/PDMs). What's slow and drift-prone is everything downstream —
pipelines, classification, the semantic layer, and the contracts that connect
them. This reference shows how a single governed metadata spec drives all of it,
automatically, while the controlled models stay the source of truth — and CI
proves a change propagated everywhere instead of stopping at the spec.

## Quick start

```bash
corepack enable pnpm          # if pnpm isn't installed
pnpm install
pnpm demo                     # check → generate → run medallion → verify propagation
```

Individual steps (run at the root; they target `@dct/engine`):

```bash
pnpm check        # governance gates (classification, registry, FK, semver, propagation)
pnpm generate     # contracts → generated/ (databricks, snowflake, cube, catalog, registry, access)
pnpm models       # model registry list (BDM/PDM/semantic, with versions)
pnpm register     # re-baseline the version lock
pnpm typecheck    # all packages
```

No cloud account is required — the medallion runs in-process on the synthetic CSVs.
The generated Databricks/Snowflake/Cube artifacts are the real stack's code; cloud
execution is left to the adopter.

## Monorepo layout

```
packages/
  engine/             the proven engine (contracts, generators, registry, access, governance)
    contracts/        the governed models (bdm/ pdm/ semantic/ sources/ policy + lock)
    src/              framework · generators · governance · registry · cli
    examples/data/    synthetic capital-markets CSVs
    generated/        generated artifacts (committed; the site vendors these)
  git-adapter/        GitProvider interface (GitLab first) — Phase 1
  orchestration-adapter/  Orchestrator interface (Databricks/local) — Phase 5
  shared/ auth/ audit/ catalog-adapter/ sdk-ts/   skeletons (see docs/platform)
apps/
  api/ worker/ cli/ web/   control-plane skeletons (built out per the roadmap)
docs/
  overview.md         engine architecture
  platform/           Mapping and Metadata Platform design, playbook, implementation guide
```

## The model

| Layer | Tooling | Role |
|-------|---------|------|
| BDM / PDM | contracts | Controlled models — the source of truth |
| Bronze → Silver → Gold | Databricks | Metadata-driven medallion pipelines |
| Semantic | Cube | Published, classified semantic models |
| Serving | Snowflake | Curated consumption + column masking |

## Classification

Every field carries one of `public · internal · confidential · restricted`. There
is **no permissive default** — governance rejects any unclassified field. The tier
rides all the way through: pipeline table properties, Cube `meta`, Snowflake column
comments + masking policies, and the catalog descriptors.

See [docs/overview.md](docs/overview.md) for the full walk-through.

## License

MIT — see [LICENSE](LICENSE).
