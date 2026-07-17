# AppKit migration guides

Guides for teams moving a Streamlit + Delta/Unity Catalog application onto this
repo's Databricks AppKit foundation. All examples use the synthetic
capital-markets domain (trades, positions, counterparties) — no proprietary
schemas or data.

## The guides

| Guide | What it covers |
|---|---|
| [streamlit-to-appkit.md](./streamlit-to-appkit.md) | Playbook for absorbing a Streamlit app into `apps/appkit`: inventory phase, widget→component mapping table, session-state translation, data-access split (warehouse analytics vs Lakebase OLTP), jobs plugin, on-behalf-of auth, a worked end-to-end example, and a strangler-pattern rollout with acceptance checklist |
| [delta-to-lakebase-postgres.md](./delta-to-lakebase-postgres.md) | Contract-first migration of Delta/UC tables to Lakebase Postgres: OLTP-vs-analytics decision table, the contracts→generate→apply flow, type-mapping reference, backfill (JDBC / staged COPY / CDF incremental), validation and dual-run, cutover + rollback, PII classification handling, Lakebase operational specifics |

## The target: `apps/appkit`

The prototype these guides migrate onto is `apps/appkit` (`@dct/appkit-app`) — a
Databricks AppKit (v0, `@databricks/appkit` 0.45.x) app that is a presentation and
integration layer over the existing DCT packages, with no framework duplication:

- **Server:** `createApp` with `server()` + `lakebase()` (+ optional `jobs()`);
  custom REST routes via `appkit.server.extend` for assets, changesets
  (maker/checker), and pipeline runs; app OLTP tables in
  `apps/appkit/server/schema.sql`.
- **Client:** React 19 + react-router 7 + Tailwind 4 pages — asset browse/edit,
  changeset approval queue, pipeline trigger/monitor, migration status.
- **Modes:** local (stub workspace client, in-process medallion runs on synthetic
  data) and deployed (Databricks Apps OAuth, Lakebase pool, Lakeflow jobs).

## The golden rule

**The contract is the source of truth.** Schemas live in
`packages/engine/contracts/` and are projected into every surface — Databricks,
Snowflake, Cube, catalog, and Lakebase Postgres DDL
(`packages/engine/generated/postgres/`) — by `pnpm generate`. A change that stops
at the contract is incomplete: regenerate, commit the generated output, and keep
`pnpm typecheck`, `pnpm check`, `pnpm test` green. Never hand-edit `generated/`.

Corporate baseline for all of the above: `.claude/knowledge/corporate-guardrails.md`
(PR-only delivery, no secrets in code, PII masking preserved).
