# apps/streamlit — the parallel Streamlit UI

A second UI for the Mapping and Metadata Platform, living **inside the repo** next to
the AppKit (React) UI. Both are **thin clients over the same governed REST API**
(`/api/*` on the `@dct/appkit-app` server) — so they render identical governed truth
by construction. This is the mechanism to **flip the switch** between UIs and run a
**page-by-page parallel migration** that stays aligned.

> Not a pnpm workspace member — no `package.json` — so `pnpm typecheck | check | build`
> ignore it entirely. It is a Python sibling.

## Run

```bash
cd apps/streamlit
python -m venv .venv && . .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then edit MMP_API_BASE / MMP_PERSONA
# start the shared backend first (from repo root):  pnpm --filter @dct/appkit-app dev
MMP_API_BASE=http://localhost:8137 streamlit run app.py
```

Pick the persona in the sidebar (viewer / alice / bob / frank / carol / dana / pat) — it
sends the same `x-dct-*` dev-auth headers the AppKit persona switcher uses.

## The switch

The two UIs are interchangeable because state lives in the **shared backend**, not the UI:

- **Local**: point both at one running server via `MMP_API_BASE`. Open the AppKit UI in
  the browser, or run `streamlit run app.py` — same data either way. `ACTIVE_UI` documents intent.
- **Deployed (Databricks Apps)**: two app resources over one Lakebase + one API surface;
  a config/nav flag (or reverse-proxy route) selects which UI is served — per-env or per-user
  for a phased cutover. Flip back instantly; nothing to migrate because the backend is shared.

## Pages (mirror the AppKit 7-nav IA)

| Page | Endpoint(s) | Notes |
|---|---|---|
| `app.py` — Catalog | `GET /api/catalog` | domains→products + the bronze→silver→gold flow |
| `pages/1_Registry.py` | `/api/registry`, `/api/changesets` | filterable table + changesets |
| `pages/2_Mappings.py` | `/api/mappings` | bronze→silver (coverage) + silver→gold |
| `pages/3_Data_Model.py` | `/api/erd` | **degraded** view — the React ERD is AppKit-only |
| `pages/4_DQ_Library.py` | `/api/dq` | library rules + applications |
| `pages/5_Pipelines.py` | `/api/runs`, `/api/migration` | runs + trigger + Delta→Lakebase |
| `pages/6_Access.py` | `/api/access`, `/api/access/check` | roles/matrix/clearance/policy/checker |

## Guardrails

Thin client only — **no business logic**, **no direct Delta/Unity-Catalog reads**; everything
comes from the governed `/api/*` endpoints (PII masking is enforced server-side and inherited).
Feature branch + PR; no secrets in code (`.env.example` only).

Full execution playbook: [`docs/handover/STREAMLIT-PARALLEL-PLAN.md`](../../docs/handover/STREAMLIT-PARALLEL-PLAN.md).
