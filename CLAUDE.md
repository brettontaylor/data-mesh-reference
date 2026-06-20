# Data Mesh Reference — project guide

Generic, illustrative reference architecture for a metadata-driven data mesh.
Published by Semantic Quay, Inc.; orchestrated from `C:\BTCENTER\semantic-quay\`.

## Non-negotiables

- **Zero IP.** Generic and illustrative only. No employer or client names, no
  real data, no proprietary BDM/PDM schemas. The domain is a synthetic
  capital-markets dataset. This is a public repo — keep it clean.
- **Contract is the source of truth.** Change `contracts/` and regenerate. A
  change that stops at the contract is incomplete — it must propagate to the
  generated Databricks / Cube / Snowflake / catalog surfaces, and
  `npm run check` must pass.

## How it works

TypeScript framework (runnable/testable with Node) reads YAML contracts and
generates the real bank-stack artifacts. It follows a single-source-of-truth,
spec-generates-everything pattern, adapted to Databricks · Cube · Snowflake.

- `contracts/` — spec + entities (classified fields) + sources
- `src/framework` — types + loader
- `src/generators` — databricks · snowflake · cube · catalog
- `src/governance` — the CI gates
- `src/medallion` — local bronze→silver→gold runner
- `generated/` — committed output (regenerate with `npm run generate`)

## Commands

```bash
npm run demo       # check → generate → run → verify propagation
npm run check      # governance gates only
npm run generate   # write generated/
npm run run        # local medallion on synthetic data
npm run typecheck
```

Always run `npm run typecheck` and `npm run check` before shipping. If you add an
entity, add it under `contracts/entities/` and register it in its source's
`produces` — the registry-consistency gate enforces both.
