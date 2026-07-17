"""Data Model — the parallel (degraded) view of the model graph.

Parity note: the interactive React-Flow ERD is AppKit-only. This Streamlit child
renders the governed model as an entities table + a foreign-key relationships
table, plus an optional Graphviz graph. Flip to AppKit for the full ERD.
Same `/api/erd` payload feeds both.
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · Data Model", layout="wide")
client = ui.render_sidebar()

ui.kicker_header(
    "DATA MODEL",
    "Data model (parallel view)",
    "The interactive ERD is AppKit-only; this child shows the same governed model "
    "as tables + an optional graph.",
)

erd = ui.load(client.erd)
models = erd["models"]

st.subheader("Entities")
ui.rows_table(
    models,
    {
        "Kind": "kind",
        "Id": "id",
        "Domain": "domain",
        "Version": "version",
        "Status": "status",
        "Fields": lambda m: len(m.get("fields") or []),
    },
)

edges: list[dict] = []
for m in models:
    for f in m.get("fields") or []:
        if f.get("fkRef"):
            edges.append({"from": f"{m['id']}.{f['name']}", "to": f["fkRef"]})

st.subheader("Relationships (foreign keys)")
ui.rows_table(edges, {"From": "from", "To": "to"}, empty="No foreign keys in scope.")

if edges:
    dot = ["digraph {", "rankdir=LR; node [shape=box, style=rounded];"]
    seen = set()
    for e in edges:
        a = e["from"].split(".")[0]
        b = e["to"].split(".")[0]
        key = (a, b)
        if key not in seen:
            seen.add(key)
            dot.append(f'"{a}" -> "{b}";')
    dot.append("}")
    try:
        st.graphviz_chart("\n".join(dot))
    except Exception:
        st.caption("Graphviz unavailable in this environment — table view only.")
