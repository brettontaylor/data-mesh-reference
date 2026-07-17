# Streamlit Parallel-Migration Plan — execution checklist

**Audience:** an AI coding agent (any capability tier) executing the Streamlit integration
step by step. **Every step is a checkbox with an explicit command and an acceptance test.**
Do not infer — follow the boxes in order. When a box says "STOP", do not proceed until it passes.

**Goal:** keep a **Streamlit UI as a parallel child inside this repo** (`apps/streamlit/`),
alongside the AppKit (React) UI, so the corporate team can **flip a switch** between them and
migrate their existing Streamlit app **one page at a time** while both stay aligned.

---

## 0. The alignment guarantee (read once, then never worry about drift)

Both UIs are **thin clients over the SAME governed REST API** (`/api/*` on the
`@dct/appkit-app` server). Neither holds business logic; the contract + engine + governance
live server-side. Because both call identical endpoints with the same persona, they render
identical governed truth **by construction**. Alignment is structural, not manual.

```
   AppKit UI (React)  ─┐
                       ├─►  @dct/appkit-app  /api/*  ─►  contracts (git SoR) + Lakebase
   Streamlit UI (Py)  ─┘        (one source of truth)
```

**Corollary you will use as the acceptance test everywhere:** for the same persona and the
same endpoint, the Streamlit page and the AppKit page MUST show the same data. If they differ,
the bug is in the UI (it is not reading the governed endpoint), never in "two copies of logic".

---

## 1. Prerequisites

- [ ] Python 3.11+ available (`python --version`).
- [ ] The AppKit server reachable. From repo root: `pnpm --filter @dct/appkit-app dev`
      (default http://localhost:8137). Confirm: `curl -s http://localhost:8137/api/meta`
      returns JSON with `"mode"` and `"store"`. **STOP** until this returns JSON.
- [ ] You are on a feature branch, not `main` (corporate guardrail). `git checkout -b feat/streamlit-parallel`.
- [ ] You have read `.claude/knowledge/corporate-guardrails.md`.

---

## 2. Phase 0 — stand up the parallel child (the scaffold already exists)

The scaffold ships at `apps/streamlit/`. Verify it loads real data before touching anything.

- [ ] `cd apps/streamlit`
- [ ] `python -m venv .venv && . .venv/Scripts/activate` (Windows) or `source .venv/bin/activate` (unix)
- [ ] `pip install -r requirements.txt`
- [ ] `cp .env.example .env` and set `MMP_API_BASE` to the running server.
- [ ] `MMP_API_BASE=http://localhost:8137 streamlit run app.py`
- [ ] In the browser: the **Catalog** page shows "N models across M domains", the
      bronze→silver→gold flow, and the domains list. **STOP** if it shows an API error —
      fix `MMP_API_BASE` / start the server.
- [ ] Click each page in the sidebar (Registry, Mappings, Data Model, DQ Library, Pipelines,
      Access) and confirm each renders data, not an error.

Endpoint smoke test (run each; confirm non-empty JSON of the expected shape):

- [ ] `curl -s $MMP_API_BASE/api/catalog | jq '.totals, (.flow.bronze|length), (.flow.silver|length), (.flow.gold|length)'`
- [ ] `curl -s $MMP_API_BASE/api/registry | jq '.rows|length'` → matches the Registry table row count.
- [ ] `curl -s $MMP_API_BASE/api/mappings | jq '.bronzeToSilver|length, .silverToGold|length'`
- [ ] `curl -s $MMP_API_BASE/api/dq | jq '.library|length, .applications|length'`
- [ ] `curl -s $MMP_API_BASE/api/access | jq '.users|length, .roles|length'`
- [ ] `curl -s $MMP_API_BASE/api/runs | jq 'length'`
- [ ] `curl -s $MMP_API_BASE/api/migration | jq '.generated'`
- [ ] `curl -s $MMP_API_BASE/api/erd | jq '.models|length'`

Repo hygiene:
- [ ] Confirm `apps/streamlit/` has **no** `package.json` (so pnpm ignores it):
      `test ! -f apps/streamlit/package.json && echo OK`.
- [ ] From repo root, confirm the JS gates are unaffected: `pnpm typecheck && pnpm check`.

---

## 3. The switch (how to flip UIs)

- [ ] **Local**: both UIs read the same `MMP_API_BASE`. To use AppKit, open its server URL in
      the browser; to use Streamlit, `streamlit run app.py`. `ACTIVE_UI` in `.env` documents intent.
- [ ] **Deployed (Databricks Apps)**: register two app resources over the **same Lakebase +
      same API**; select which UI is served with a single config/nav flag or a reverse-proxy
      route. Cut over **per environment** first (dev → staging → prod), then optionally per user.
- [ ] **Rollback is instant** — state lives in the shared backend, so flipping back to the
      other UI loses nothing. Record the flip in the change log / audit.

---

## 4. Parity matrix (the migration map)

| # | AppKit page | Route | Streamlit page | Endpoint(s) | Parity |
|---|---|---|---|---|---|
| 1 | Dashboard/Catalog | `/` | `app.py` | `GET /api/catalog` | full |
| 2 | Registry | `/registry` | `pages/1_Registry.py` | `/api/registry`, `/api/changesets` | full |
| 3 | Mappings | `/mappings` | `pages/2_Mappings.py` | `/api/mappings` | full |
| 4 | Data Model | `/explorer` | `pages/3_Data_Model.py` | `/api/erd` | **degraded** (see below) |
| 5 | DQ Library | `/dq` | `pages/4_DQ_Library.py` | `/api/dq` | full |
| 6 | Pipelines | `/pipelines` | `pages/5_Pipelines.py` | `/api/runs`, `/api/migration` | full |
| 7 | Access | `/access` | `pages/6_Access.py` | `/api/access`, `/api/access/check` | full |

**Known non-parity (do not fake it):** the interactive React-Flow ERD is React-only.
The Streamlit Data Model page renders the **same `/api/erd` payload** as an entities table +
a foreign-key table + an optional Graphviz graph. State this in the UI; do not pretend the
interactive ERD exists in Streamlit. Users who need the full ERD flip to AppKit.

---

## 5. Phase 1..N — migrate the corporate team's existing Streamlit app, page by page

The corporate team already has a Streamlit app that reads Delta/Unity-Catalog directly. Move
it onto this foundation **one page at a time**. For EACH legacy page, run this sub-checklist:

- [ ] **Inventory** the legacy page: list its widgets (`st.dataframe`, `st.form`, `st.button`,
      `st.selectbox`, charts…), its `st.session_state` keys, and every data read
      (`spark.sql(...)`, `spark.read`, `w.jobs.run_now`, `dbutils`, direct JDBC).
- [ ] **Map** each data read to a **governed endpoint** using the parity matrix. If the legacy
      page shows governed metadata (models, mappings, DQ, runs, access), it maps to an existing
      `/api/*` endpoint. If it shows something with no endpoint yet, **STOP and flag it** — the
      backend must expose it first (do not add business logic to the Streamlit page).
- [ ] **Rewrite** the page against `lib/api.ApiClient` + `lib/ui` helpers. Replace every direct
      Delta/UC read with an `/api/*` call. **No `spark`, no JDBC, no business logic** in the page.
- [ ] **Render** with `ui.rows_table` / `ui.kicker_header` / `st.tabs` to match the AppKit page's
      information (columns, filters, tabs). Keep it a faithful parallel, not a redesign.
- [ ] **ACCEPTANCE TEST (the alignment check):** open the same route in AppKit and the migrated
      page in Streamlit **as the same persona**. The data MUST match (same rows, counts, chips).
      Diff endpoint payloads if unsure: `curl` the endpoint with the persona headers and confirm
      both UIs render it. **STOP** and fix the Streamlit page if they differ — the backend is the
      single source, so any mismatch is a UI read bug.
- [ ] **Mark parity** in the matrix (`full` / `degraded` + note). Commit the page.
- [ ] Repeat for the next legacy page. Retire each legacy page's direct Delta/UC reads as it lands.

Order suggestion (lowest risk first): read-only pages (Registry, Mappings, DQ, Data Model,
Access) before write/trigger pages (Pipelines run trigger, any changeset actions).

---

## 6. Alignment / regression verification (run after ANY backend change)

Because both UIs share the backend, one check covers both:

- [ ] For each endpoint in §2, `curl` it as a fixed persona (e.g. `x-dct-user: alice`) before
      and after the change; confirm the shape is unchanged or the change is intended.
- [ ] Spot-check 2–3 pages in BOTH UIs as the same persona; confirm they still agree.
- [ ] Governance still holds end-to-end (the backend enforces it): propose→approve→merge as the
      right personas; SoD, tier routing, and 403s behave identically regardless of which UI issued them.
- [ ] `pnpm typecheck && pnpm check` (backend/engine gates) stay green.

---

## 7. Cutover & rollback

- [ ] When a page reaches parity in the target environment, flip the switch for that env.
- [ ] Keep BOTH UIs live through the migration window; roll back instantly if a page regresses.
- [ ] When every page is at parity and the team is confident, make AppKit primary and retire the
      legacy Delta/UC-reading Streamlit. **Keep `apps/streamlit/` in the repo** as the aligned,
      governed reference / fallback (it stays correct automatically — same API).

---

## 8. Definition of done

- [ ] `apps/streamlit/` runs against the shared API; all 7 pages load real governed data.
- [ ] The switch works in the target environment(s); rollback verified.
- [ ] Every legacy Streamlit page is either migrated onto `/api/*` or explicitly flagged as
      needing a new endpoint (with the endpoint requested from the backend team).
- [ ] The parity matrix is filled in; non-parity items (ERD) are documented, not faked.
- [ ] The alignment acceptance test passes for every migrated page (Streamlit == AppKit per persona).
- [ ] Delivered on a feature branch via PR; no secrets committed; no direct Delta/UC reads or
      business logic in any Streamlit page.

---

## Corporate guardrails (non-negotiable)

Feature branch + PR, never push to `main`; no secrets in code (`.env.example` only); the
Streamlit UI reads the governed API only — **no direct Delta/Unity-Catalog access, no business
logic** (PII masking and access control are enforced server-side and inherited). Reference
`.claude/knowledge/corporate-guardrails.md`. Companion docs:
`docs/handover/MMP-APPKIT-HANDOVER.md` (§1.14) and `apps/streamlit/README.md`.
