# Streamlit → Databricks AppKit migration playbook

A systematic playbook for absorbing an existing Streamlit application into the AppKit
foundation at `apps/appkit` (`@dct/appkit-app`). Audience: a dev team that owns a
production Streamlit app on Databricks (Delta / Unity Catalog) and is adopting this
repo's contract-driven foundation.

All examples are synthetic capital-markets illustrations. Companion guide:
[delta-to-lakebase-postgres.md](./delta-to-lakebase-postgres.md) covers the data-side
move for tables that become OLTP.

---

## 1. Why AppKit for production Databricks Apps

Streamlit is excellent for analyst-built prototypes. The pain starts when a prototype
becomes a production system of record. The differences below are structural, not
stylistic:

| Concern | Streamlit | AppKit (`@databricks/appkit` 0.45.x) |
|---|---|---|
| Type safety | Python, untyped widget state, stringly-keyed `st.session_state` | TypeScript end-to-end: zod-validated request bodies, typed server routes, typed React props |
| Execution model | Whole-script rerun on every interaction; state juggling via `session_state` | Client renders locally; server round-trips only when you call a REST route |
| Data access | Ad-hoc `spark.sql(...)` inline in page code | Plugin resources with declared permissions (`analytics` → SQL warehouse `CAN_USE`, `lakebase` → Postgres `CAN_CONNECT_AND_CREATE`, `jobs` → `CAN_MANAGE_RUN`), configured in `databricks.yml` |
| Auth | Header sniffing / SSO proxy assumptions, usually a single service identity | Databricks Apps OAuth; per-user on-behalf-of via `asUser(req)` — Postgres `current_user` and job attribution reflect the human, not the app |
| Componentization | Copy-paste page fragments | React 19 components + `@databricks/appkit-ui`; shared layout, router (react-router 7), Tailwind 4 |
| Observability | `print()` and app logs | Built-in OpenTelemetry instrumentation on plugin calls (query duration, pool connections, token refresh) + structured AppKit logger |
| Concurrency | One script run per session; long Spark calls block the rerun | Express server; long work delegated to Lakeflow jobs with SSE status streaming |
| Governance fit | None — the app *is* the logic | The app is a thin layer over `@dct/engine` contracts; edits become governed changesets, not direct writes |

None of this means "rewrite everything on day one". Section 10 describes the
strangler pattern for a page-by-page migration.

---

## 2. Prerequisites

- Node.js >= 22 (`node --version`), pnpm.
- Databricks CLI v1.x configured (`databricks auth login`).
- Read the target architecture: `apps/appkit/` (server: `server/server.ts`,
  `server/routes/*.ts`, `server/db.ts`; client: `client/src/pages/*.tsx`).
- Read the repo non-negotiables: `.claude/knowledge/corporate-guardrails.md`.
- Gates must stay green throughout: `pnpm typecheck`, `pnpm check`, `pnpm test`.
  There is **no lint script** in this monorepo.

---

## 3. Phase 0 — Inventory the Streamlit app

Before writing any TypeScript, produce a written inventory. Every migration defect
we have seen traces back to an uninventoried widget callback or a hidden
`st.session_state` key. Catalogue eight things:

| # | What to inventory | How to find it | Migration target |
|---|---|---|---|
| 1 | Pages | `pages/*.py`, `st.navigation` / `st.Page` | React routes in `client/src/pages/` |
| 2 | Widgets per page | `grep -n "st\." pages/*.py` | Component mapping table (section 4) |
| 3 | Session state keys | `grep -rn "session_state" .` | React state / router params / server tables (section 5) |
| 4 | Callbacks | `on_click=`, `on_change=` kwargs | Event handlers calling REST routes |
| 5 | Caching | `@st.cache_data`, `@st.cache_resource` | Server-side caching in route layer; plugin read-tier caching |
| 6 | Data reads/writes | `spark.sql`, `spark.table`, `.toPandas()`, UC paths | `analytics` plugin (warehouse) or `lakebase` plugin (Postgres) — section 6 |
| 7 | Jobs / dbutils | `w.jobs.run_now`, `dbutils.notebook.run`, `dbutils.jobs` | `jobs` plugin resource (section 7) |
| 8 | Secrets & config | `st.secrets`, `dbutils.secrets.get`, env vars | `app.yaml` env / Databricks Apps resources; **never** in code |

Deliverable: an inventory sheet with one row per page listing widgets, state keys,
data statements, and job calls. Classify every `spark.sql` statement now as
**analytic read** (aggregation, large scan) or **transactional read/write**
(single-row lookup, entry/edit) — this drives the split in section 6 and the
companion Lakebase guide.

Useful sweep commands over the Streamlit repo:

```bash
grep -rn "st\.session_state"            --include="*.py" .
grep -rn "st\.cache_data\|cache_resource" --include="*.py" .
grep -rn "spark\.sql\|spark\.table"       --include="*.py" .
grep -rn "dbutils\.\|jobs\.run_now"       --include="*.py" .
grep -rn "st\.secrets\|secrets\.get"      --include="*.py" .
```

---

## 4. Widget → AppKit mapping table

The general rule: **display widgets become React components; mutating widgets become
a component + a REST route** added via `appkit.server.extend`.

| Streamlit widget | AppKit client equivalent | Server-side pattern |
|---|---|---|
| `st.dataframe(df)` | Table component (`@databricks/appkit-ui` table, or TanStack table) fed by `fetch('/api/...')` | `GET` route returning JSON rows (`res.json(result.rows)`) |
| `st.data_editor(df)` | Editable grid with per-row edit state; edits staged client-side, submitted as a batch | `POST`/`PATCH` route with zod-validated body; in this repo edits become a **proposed changeset** (`server/routes/changesets.ts`), not a direct write |
| `st.form` + `st.form_submit_button` | `<form onSubmit={...}>` with controlled inputs; client-side zod validation reusing the server schema | `POST` route; zod `safeParse` on body, `400` on failure |
| `st.button("Run")` | `<button onClick={...}>` with pending/disabled state | `POST` route performing the action (e.g. trigger run in `server/routes/runs.ts`) |
| `st.selectbox` / `st.multiselect` | `<select>` / combobox component; options fetched once from a `GET` route | Options route (e.g. `GET /api/assets?kind=...`) |
| `st.text_input` / `st.number_input` / `st.date_input` | Controlled `<input>` with typed state (`useState<string>` etc.) | Validation lives in the shared zod schema |
| `st.file_uploader` | `<input type="file">` + `FormData` upload | `POST` multipart route; persist to a UC Volume via the `files` plugin (`WRITE_VOLUME`) if the file must land in the lakehouse |
| `st.plotly_chart` / `st.altair_chart` | Recharts / visx / plotly-react component | `GET` route returning the aggregated series (aggregate on the warehouse, not in the browser) |
| `st.metric` | Stat-tile component | Same aggregated `GET` route |
| `st.sidebar` + page radio | Router layout: nav component + `react-router` routes | n/a |
| `st.tabs` | Tab component or nested routes (`/assets/:id/history`) | n/a |
| `st.expander` | Disclosure/accordion component | n/a |
| `st.toast` / `st.success` / `st.error` | Toast component driven by fetch outcomes | Route returns proper status codes; client maps them to toasts |
| `st.progress` + polling loop | SSE consumption (`EventSource` / fetch-stream) | Jobs plugin `POST /api/jobs/:jobKey/run?stream=true` emits `{status, timestamp, run}` events |
| `st.download_button` | `<a download>` to a `GET` route | Route sets `Content-Disposition` and streams CSV/JSON |
| `st.experimental_dialog` / modal | Dialog component | n/a |

---

## 5. State model translation

Streamlit conflates four kinds of state into `st.session_state`. Pull them apart:

| State kind (Streamlit) | Example | AppKit home |
|---|---|---|
| Ephemeral UI state | expanded row, active tab | React `useState` / `useReducer` in the page component |
| Navigational state | selected entity, filters, page | **Router URL** — path params (`/assets/:kind/:id`) and search params (`?status=proposed`). Deep-linkable, survives refresh |
| Cross-page draft state | half-completed edit form | Either lift into a route-level context, or persist as a *draft changeset row* server-side so a refresh cannot lose a maker's work |
| Durable business state | proposed edits, run history, approvals | **Never** browser state. Server tables (`server/schema.sql`: `changeset`, `changeset_edit`, `pipeline_run`) in Lakebase Postgres |

Server round-trips replace Streamlit's rerun: any state the server must know about
flows through a REST route registered with `appkit.server.extend`:

```ts
// apps/appkit/server/routes/changesets.ts (pattern)
appkit.server.extend((app) => {
  app.post('/api/changesets', async (req, res) => {
    const parsed = ProposeChangesetBody.safeParse(req.body); // zod
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    // ... call GovernanceService.propose(...), audit, return 201
  });
});
```

`@st.cache_data` translations, by intent:

- **Caching a warehouse query** → the `analytics` plugin read tier already caches;
  otherwise add an in-memory TTL cache in the route module (the server is a
  long-lived process, unlike a Streamlit script run).
- **Caching reference data for widget options** → a `GET` options route + client-side
  fetch caching (SWR/React Query or a simple module-level cache).
- **`@st.cache_resource` for connections** → gone entirely; the lakebase plugin owns
  a `pg.Pool` with OAuth token refresh. Never open per-request connections.

---

## 6. Data access translation

Split every Delta/UC read or write from the inventory into two buckets:

| Access pattern in Streamlit | Bucket | AppKit mechanism |
|---|---|---|
| `spark.sql("SELECT sum(notional) ... GROUP BY ...")`, large scans, dashboard aggregates | **Analytics** | `analytics` plugin: file-based SQL in `config/queries/*.sql` executed against a SQL warehouse (`DATABRICKS_WAREHOUSE_ID`, permission `CAN_USE`); run `npm run typegen` to generate typed query accessors |
| Single-row lookups, entry/edit screens, workflow queues, app-owned state | **OLTP** | `lakebase` plugin: Lakebase Postgres via `appkit.lakebase.query(text, params)` (standard `pg.Pool`) |
| Writes back to governed Delta tables | **Neither directly** | Propose a changeset against the contract; merges regenerate `packages/engine/generated/` and the pipeline republishes. The app never `INSERT`s into gold Delta tables |

Rules of thumb:

- If the Streamlit page called `.toPandas()` on a big scan just to filter it in
  Python — push the filter into warehouse SQL; return only what renders.
- If the page did read-modify-write on a small Delta table (the classic
  "reference-data editor on a Delta table" anti-pattern) — that table is an OLTP
  candidate. Migrate it to Lakebase **contract-first** per
  [delta-to-lakebase-postgres.md](./delta-to-lakebase-postgres.md).
- Keep analytics reads on the masked serving surfaces the engine generates
  (see `packages/engine/generated/snowflake/serving.sql` for the pattern:
  classification-driven masking, roles by clearance). Do not bypass masking by
  reading base tables.

---

## 7. Jobs: `w.jobs.run_now` → jobs plugin

Streamlit code like:

```python
from databricks.sdk import WorkspaceClient
w = WorkspaceClient()
run = w.jobs.run_now(job_id=123456, notebook_params={"as_of": as_of_date})
```

becomes a **declared job resource** (permission `CAN_MANAGE_RUN`, env
`DATABRICKS_JOB_ID` or `DATABRICKS_JOB_<NAME>` for multi-job) plus:

```ts
import { createApp, server, jobs } from '@databricks/appkit';
import { z } from 'zod';

const appkit = await createApp({
  plugins: [
    server(),
    jobs({
      jobs: {
        medallion: {
          taskType: 'notebook',                       // maps params → notebook_params
          params: z.object({ as_of: z.string() }),    // 400 before trigger if invalid
        },
      },
    }),
  ],
});

// Programmatic: const r = await appkit.jobs('medallion').runNow({ as_of });
```

You usually don't even need a custom route — the plugin mounts REST endpoints:

- `POST /api/jobs/:jobKey/run` → `{ runId }`; add `?stream=true` for SSE status
  events until termination (replaces Streamlit's `st.progress` + `while` poll loop)
- `GET /api/jobs/:jobKey/runs?limit=20`, `GET .../runs/:runId`, `GET .../status`
- `DELETE /api/jobs/:jobKey/runs/:runId` to cancel

Runs execute as the app's service principal by default (shared-infra pattern). For
user-level attribution and permission checks, opt in with
`appkit.jobs('medallion').asUser(req).runNow(...)` — requires `jobs.jobs` in
`user_api_scopes` and the user's own `CAN_MANAGE_RUN` grant.

In **local mode**, `apps/appkit` skips the jobs plugin and executes the medallion
run in-process via the engine runner (`server/routes/runs.ts`) on synthetic data —
same route shape, no workspace required.

---

## 8. Auth: SSO headers → on-behalf-of-user

Typical Streamlit pattern (fragile — depends on proxy configuration):

```python
user = st.context.headers.get("X-Forwarded-Email")  # or similar
```

Databricks Apps + AppKit replace this with platform-managed OAuth:

- The platform injects `x-forwarded-access-token` and `x-forwarded-email` on every
  request. You never parse them yourself for data access — you pass `req` to
  `asUser(req)` on a plugin (`appkit.lakebase.asUser(req).query(...)`) and Postgres
  `current_user` / job attribution become the real user.
- Declare which user scopes the app may exercise in `databricks.yml`:

  ```yaml
  resources:
    apps:
      app:
        user_api_scopes:
          - postgres        # lakebase OBO
          - sql             # warehouse OBO
          # - jobs.jobs     # user-attributed job runs
  ```

- `app.yaml` stays minimal — start command plus env:

  ```yaml
  command: ['npm', 'run', 'start']
  env:
    - name: LAKEBASE_ENDPOINT
      valueFrom: postgres
  ```

- The service-principal identity remains for DDL, seeding, and admin queries;
  per-user pools are created lazily and cached per identity.
- Locally there is no OAuth: `apps/appkit` injects a stub `WorkspaceClient`
  (`server/local-dev.ts`) plus `DATABRICKS_WORKSPACE_ID=0`, and dev auth uses the
  same `x-dct-*` header convention as `apps/api` (`@dct/auth` `resolvePrincipal`).

Any Streamlit role checks (`if user in ADMINS:`) become capability checks via
`@dct/auth` on the server route — never in client code.

---

## 9. Worked example: governed reference-data editor + pipeline trigger

A representative corporate Streamlit app, condensed. It edits a counterparty
reference table stored in Delta and triggers the nightly pipeline:

```python
# app.py — illustrative Streamlit original (synthetic capital-markets domain)
import streamlit as st
from databricks.sdk import WorkspaceClient

st.set_page_config(page_title="Counterparty Reference Editor", layout="wide")
w = WorkspaceClient()
spark = get_spark()  # databricks-connect or runtime session

PAGES = ["Browse", "Edit", "Pipeline"]
page = st.sidebar.radio("Page", PAGES)

@st.cache_data(ttl=300)
def load_counterparties():
    return spark.sql("""
        SELECT counterparty_id, legal_name, country_code, credit_rating
        FROM gold.counterparty ORDER BY counterparty_id
    """).toPandas()

if "pending_edits" not in st.session_state:
    st.session_state.pending_edits = {}

if page == "Browse":
    st.header("Counterparties")
    rating = st.selectbox("Rating filter", ["ALL", "AAA", "AA", "A", "BBB"])
    df = load_counterparties()
    if rating != "ALL":
        df = df[df.credit_rating == rating]
    st.metric("Counterparties", len(df))
    st.dataframe(df, use_container_width=True)

elif page == "Edit":
    st.header("Edit counterparty")
    df = load_counterparties()
    cp_id = st.selectbox("Counterparty", df.counterparty_id)
    row = df[df.counterparty_id == cp_id].iloc[0]
    with st.form("edit_form"):
        legal_name = st.text_input("Legal name", row.legal_name)
        country = st.text_input("Country", row.country_code, max_chars=2)
        rating = st.selectbox("Rating", ["AAA", "AA", "A", "BBB"],
                              index=["AAA", "AA", "A", "BBB"].index(row.credit_rating))
        submitted = st.form_submit_button("Stage edit")
    if submitted:
        st.session_state.pending_edits[cp_id] = {
            "legal_name": legal_name, "country_code": country, "credit_rating": rating}
        st.success(f"Staged edit for {cp_id}")
    if st.session_state.pending_edits:
        st.subheader("Pending edits")
        st.json(st.session_state.pending_edits)
        if st.button("Apply all to Delta"):
            for k, v in st.session_state.pending_edits.items():
                spark.sql(f"""
                    UPDATE gold.counterparty
                    SET legal_name = '{v['legal_name']}',
                        country_code = '{v['country_code']}',
                        credit_rating = '{v['credit_rating']}'
                    WHERE counterparty_id = '{k}'
                """)  # unparameterized, unaudited, no maker/checker
            st.session_state.pending_edits = {}
            st.cache_data.clear()
            st.success("Applied")

elif page == "Pipeline":
    st.header("Nightly medallion pipeline")
    as_of = st.date_input("As-of date")
    if st.button("Trigger run"):
        run = w.jobs.run_now(job_id=int(st.secrets["PIPELINE_JOB_ID"]),
                             notebook_params={"as_of": str(as_of)})
        st.session_state.last_run = run.run_id
    if "last_run" in st.session_state:
        st.write(f"Last run: {st.session_state.last_run}")
        st.button("Refresh status")  # rerun-based polling
```

Note the production problems the migration removes for free: SQL injection via
f-strings, no audit, no maker/checker, a secret read in page code, cache-clearing
as a consistency mechanism, and edits held only in browser session state.

### 9.1 Step-by-step mapping onto `apps/appkit`

| Streamlit piece | Destination | Notes |
|---|---|---|
| `st.sidebar.radio` page switch | react-router routes: `/assets`, `/assets/:kind/:id/edit`, `/pipelines` | `client/src/pages/AssetsPage.tsx`, `AssetEditPage.tsx`, `PipelinesPage.tsx` |
| `load_counterparties()` + `@st.cache_data` | `GET /api/assets?kind=bdm&entity=counterparty` in `server/routes/assets.ts`, reading projection + contracts | Server-side; analytics-grade reads go to the warehouse via file-based SQL |
| Rating `st.selectbox` filter | Search param `?rating=AA` on the assets route | Deep-linkable; filter applied server-side |
| `st.metric` / `st.dataframe` | Stat tile + table component on `AssetsPage` | Data from the same `GET` route |
| Edit `st.form` | Kind-aware form on `AssetEditPage` with a zod schema shared client/server | The schema mirrors the contract entity fields (`packages/engine/contracts/bdm/counterparty.yaml`) |
| `pending_edits` in `session_state` | **Gone.** Submitting the form POSTs a proposed changeset (`POST /api/changesets`) persisted in Lakebase (`changeset`, `changeset_edit` tables in `server/schema.sql`) | Survives refresh; visible to checkers |
| "Apply all to Delta" `UPDATE` loop | **Maker/checker**: `ChangesetsPage` queue with approve / reject / merge routes; merge flows through GovernanceService semantics (`ModelEdit{kind,id,spec}`, kinds `bdm\|pdm\|semantic\|mapping\|dq\|extract\|transformation\|refmap`) and is audited | Contract change → `pnpm generate` → gates. The app never issues `UPDATE gold.*` |
| `w.jobs.run_now` + secret job id | `POST /api/runs` (`server/routes/runs.ts`) → engine runner locally, jobs plugin (`DATABRICKS_JOB_ID` resource) when deployed | Job id is a declared resource, not a secret in code |
| Rerun-based status polling | Run history table + SSE stream on `PipelinesPage` (`?stream=true`) with layer stats and gate results | |
| `st.secrets` | `app.yaml` env / Databricks Apps resources; local `.env` (from `.env.example`, never committed) | |

### 9.2 Server wiring sketch

```ts
// apps/appkit/server/server.ts (pattern)
import { createApp, server, lakebase, jobs } from '@databricks/appkit';
import { localStubClient, isLocalMode } from './local-dev';
import { registerAssetRoutes } from './routes/assets';
import { registerChangesetRoutes } from './routes/changesets';
import { registerRunRoutes } from './routes/runs';

const appkit = await createApp({
  plugins: [
    server(),
    ...(isLocalMode() ? [] : [lakebase(), jobs()]),
  ],
  ...(isLocalMode() ? { client: localStubClient() } : {}), // stub currentUser.me()
  async onPluginsReady(appkit) {
    registerAssetRoutes(appkit);      // GET  /api/assets, /api/assets/:kind/:id
    registerChangesetRoutes(appkit);  // POST /api/changesets, POST .../:id/decide, .../merge
    registerRunRoutes(appkit);        // POST /api/runs, GET /api/runs
  },
});
```

Each route module follows the todo-routes pattern from the AppKit template:
idempotent setup (`CREATE SCHEMA IF NOT EXISTS` / table-exists check), zod
`safeParse` → `400`, parameterized SQL only, proper status codes.

---

## 10. Phasing: run both, strangle the Streamlit app page by page

Do **not** big-bang. Both apps can run side by side on Databricks Apps against the
same catalog:

1. **Stand up the skeleton.** Deploy `apps/appkit` with read-only pages
   (`AssetsPage`) while the Streamlit app remains the system of entry.
2. **Migrate reads first.** Point browse/dashboard pages at AppKit; add a banner
   link in Streamlit ("this page has moved"). Read-only migration is risk-free
   and shakes out auth/resource config.
3. **Migrate one write path.** Pick the lowest-risk editor. Move its backing table
   to Lakebase contract-first (companion guide) or route its edits into changesets.
   Run **dual-entry verification** for one cycle: edits made in AppKit, old
   Streamlit page switched to read-only view of the same data.
4. **Migrate jobs/controls.** Replace `run_now` buttons with the jobs plugin
   endpoints; keep the Streamlit trigger disabled but visible for one cycle.
5. **Decommission per page.** Remove each Streamlit page only after its acceptance
   checklist passes; finally archive the Streamlit repo.

### Acceptance checklist (per migrated page)

- [ ] Feature parity confirmed against the inventory sheet (every widget, callback,
      and state key accounted for)
- [ ] All inputs zod-validated server-side; no string-built SQL
- [ ] Writes flow through changeset propose → approve → merge (maker ≠ checker)
- [ ] Auth verified: OBO where required; capability checks on every mutating route
- [ ] Masked/serving surfaces used for analytics reads; no unmasked PII/MNPI in
      responses for unauthorized roles
- [ ] Audit events emitted for every mutation
- [ ] Local mode works (`APP_MODE=local`, stub client, MemoryDb or `DATABASE_URL`)
- [ ] `pnpm typecheck && pnpm check && pnpm test` green
- [ ] Old Streamlit page set to read-only, then removed after one clean cycle

---

## 11. Corporate constraints (non-negotiable)

Per `.claude/knowledge/corporate-guardrails.md`:

- **PR-based delivery only.** Feature branch → PR → review + CI → merge. Never push
  to `main`.
- **No secrets in code** — connection strings, tokens, and job IDs live in
  `app.yaml` env / Databricks Apps resources / local `.env` (gitignored;
  `.env.example` only is committed).
- **PII/MNPI masking preserved.** The classification model in
  `packages/engine/contracts/` (`pii`, `mnpi`, `classification:` tiers) must hold
  across every surface the app reads. Gold serves no unmasked PII.
- **Contract is the source of truth.** Any schema-affecting change starts in
  `packages/engine/contracts/`, is regenerated (`pnpm generate`), and must pass
  `pnpm check`. Never hand-edit `packages/engine/generated/`.
