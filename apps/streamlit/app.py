"""MMP — Streamlit parallel UI (Dashboard / Catalog).

A thin client over the governed `/api/*` surface, parallel to the AppKit React
UI. Run: `streamlit run app.py` (from apps/streamlit/, with MMP_API_BASE pointing
at a running @dct/appkit-app server). See README.md → "The switch".
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · Catalog", layout="wide")
client = ui.render_sidebar()

cat = ui.load(client.catalog)
totals = cat["totals"]

ui.kicker_header(
    "CATALOG",
    f"{totals['assets']} models across {totals['domains']} domains",
    "Live from the governed contract — " + ui.kind_breakdown(totals["byKind"]),
)

# The hero: products flow Bronze -> Silver -> Gold, left to right.
ui.medallion_flow(cat["flow"])

st.divider()
st.subheader("Domains")
for d in cat["domains"]:
    with st.container(border=True):
        st.markdown(f"**{d.get('label') or d['domain']}** · `v{d['version']}`")
        if d.get("description"):
            st.caption(d["description"])
        st.caption(f"{d['productCount']} products · {d['assetCount']} assets")
        if d.get("products"):
            st.caption("Products: " + ui.chips([p["product"] for p in d["products"]]))
