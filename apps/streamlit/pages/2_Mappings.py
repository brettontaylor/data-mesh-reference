"""Mappings — governed bronze→silver source mappings and silver→gold
transformations. Parallel to the AppKit Mappings page; same `/api/mappings`.
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · Mappings", layout="wide")
client = ui.render_sidebar()

ui.kicker_header(
    "MAPPINGS",
    "Mapping documents",
    "Bronze→silver source mappings (with coverage) and silver→gold transformations.",
)

docs = ui.load(client.mappings)

st.subheader("Bronze → Silver")
ui.rows_table(
    docs["bronzeToSilver"],
    {
        "Mapping": "mapping",
        "From": lambda d: d["from"]["id"],
        "To": lambda d: d["to"]["id"],
        "Version": "version",
        "Coverage": lambda d: (
            f"{d['coverage']['mapped']}/{d['coverage']['targetFields']}"
            if d.get("coverage")
            else "—"
        ),
        "Owner": "owner",
    },
    empty="No bronze→silver mappings.",
)

st.subheader("Silver → Gold")
ui.rows_table(
    docs["silverToGold"],
    {
        "Transformation": "transformation",
        "Target": lambda d: d["target"]["id"],
        "Complexity": "complexity",
        "Version": "version",
        "Fields": lambda d: d.get("fieldCount"),
        "Sources": lambda d: ", ".join(d.get("sourceEntities") or []),
        "Refmaps": lambda d: ", ".join(d.get("refmaps") or []) or "—",
    },
    empty="No silver→gold transformations.",
)
