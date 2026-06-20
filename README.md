# Data Mesh Reference

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
npm install
npm run demo      # check → generate → run medallion → verify propagation
```

Individual steps:

```bash
npm run check     # governance gates (classification, registry, FK, propagation)
npm run generate  # contracts → generated/ (databricks, snowflake, cube, catalog)
npm run run       # execute bronze→silver→gold locally on synthetic data
npm run typecheck
```

No cloud account is required — the medallion runs in-process on the CSVs in
`examples/data/`. The generated Databricks/Snowflake/Cube artifacts are the real
stack's code; cloud execution is left to the adopter.

## Layout

```
contracts/            the governed spec (single source of truth)
  spec.yaml           version + classification tiers
  entities/*.yaml     entities, fields (each classified), metrics, dimensions
  sources/*.yaml      source registrations (cadence, produces, inputs)
src/
  framework/          contract types + loader
  generators/         databricks · snowflake · cube · catalog
  governance/         the CI gates
  medallion/          local bronze→silver→gold runner
  cli.ts              dmref CLI
examples/data/        synthetic capital-markets CSVs
generated/            generated artifacts (committed so you can inspect them)
docs/overview.md      the architecture, explained
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
