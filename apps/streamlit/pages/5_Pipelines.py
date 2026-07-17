"""Pipelines — medallion run history + trigger, the flow strip, and the
Delta→Lakebase migration surface. Parallel to the AppKit Pipelines page.
"""
import streamlit as st

from lib import ui
from lib.api import ApiError

st.set_page_config(page_title="MMP · Pipelines", layout="wide")
client = ui.render_sidebar()

ui.kicker_header(
    "ORCHESTRATION",
    "Pipelines",
    "Metadata-driven medallion runs (bronze→silver→gold) + Delta→Lakebase migration.",
)

cat = ui.load(client.catalog)
ui.medallion_flow(cat["flow"])

st.divider()
if st.button("Run medallion pipeline", type="primary"):
    try:
        run = client.trigger_run()
        st.success(f"Run {run['id']} — {run['status']}")
    except ApiError as exc:
        st.error(str(exc))
        if exc.status == 403:
            st.warning("Needs capability pipeline:deploy — switch persona to Pat (Platform Eng).")

runs = ui.load(client.runs)
st.subheader(f"Runs — {len(runs)}")
ui.rows_table(
    runs,
    {
        "Run": "id",
        "Trigger": "trigger",
        "Status": "status",
        "By": "triggeredBy",
        "Started": "startedAt",
        "Duration (ms)": "durationMs",
        "Products": lambda r: ", ".join(f"{p['product']}@{p['version']}" for p in (r.get("products") or [])) or "—",
    },
    empty="No runs yet — trigger one above (as Pat).",
)

with st.expander("Delta → Lakebase migration"):
    mig = ui.load(client.migration)
    if mig.get("generated"):
        st.caption(f"DDL generated from contracts — `{mig['schemaSqlPath']}`")
        ui.rows_table(
            mig["manifest"]["tables"],
            {
                "Table": "table",
                "Entity": "entity",
                "Layer": "layer",
                "Columns": lambda t: len(t.get("columns") or []),
            },
        )
    else:
        st.info("No generated Postgres surface yet — run `pnpm generate`.")
