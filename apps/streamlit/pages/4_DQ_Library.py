"""DQ Library — generic data-quality rules and their applications.
Parallel to the AppKit DQ Library page; same `/api/dq`.
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · DQ Library", layout="wide")
client = ui.render_sidebar()

ui.kicker_header(
    "DQ LIBRARY",
    "Data-quality rules",
    "Generic rules defined once, applied at table/column level, executed on every run.",
)

dq = ui.load(client.dq)

st.subheader(f"Library — {len(dq['library'])} rules")
ui.rows_table(
    dq["library"],
    {
        "Rule": "rule",
        "Label": "label",
        "Scope": "scope",
        "Check": "check",
        "Severity": "severity",
        "Version": "version",
        "Used by": lambda r: len(r.get("usage") or []),
    },
)

st.subheader(f"Applications — {len(dq['applications'])} bindings")
ui.rows_table(
    dq["applications"],
    {
        "Rule set": "ruleSet",
        "Target": "target",
        "Rule": lambda a: (a.get("resolved") or {}).get("id") or "—",
        "Binding": lambda a: (a.get("resolved") or {}).get("field") or "table",
        "Severity": lambda a: (a.get("resolved") or {}).get("severity") or "—",
        "Source": lambda a: (a.get("resolved") or {}).get("source") or "—",
    },
)
