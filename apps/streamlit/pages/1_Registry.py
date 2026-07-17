"""Registry — every governed asset in one filterable table, + a changesets view.
Parallel to the AppKit Registry page; same `/api/registry` + `/api/changesets`.
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · Registry", layout="wide")
client = ui.render_sidebar()

ui.kicker_header("MODEL REGISTRY", "Registry", "Every governed asset across domains and products.")

reg = ui.load(client.registry)
rows = reg["rows"]

c1, c2, c3, c4 = st.columns(4)
f_domain = c1.selectbox("Domain", ["(all)"] + sorted(reg.get("domains", [])))
f_product = c2.selectbox("Product", ["(all)"] + sorted({r["product"] for r in rows if r.get("product")}))
f_kind = c3.selectbox("Kind", ["(all)"] + sorted({r["kind"] for r in rows}))
q = c4.text_input("Search id / label").strip().lower()


def keep(r: dict) -> bool:
    if f_domain != "(all)" and r.get("domain") != f_domain:
        return False
    if f_product != "(all)" and r.get("product") != f_product:
        return False
    if f_kind != "(all)" and r.get("kind") != f_kind:
        return False
    if q and q not in f"{r.get('id', '')} {r.get('label', '') or ''}".lower():
        return False
    return True


filtered = [r for r in rows if keep(r)]
st.caption(f"{len(filtered)} of {len(rows)} assets")

ui.rows_table(
    filtered,
    {
        "Model": "id",
        "Kind": "kind",
        "Version": "version",
        "Status": "status",
        "Domain": "domain",
        "Product": lambda r: r.get("product") or "—",
        "Depends on": lambda r: ", ".join(r.get("dependsOn") or []) or "—",
    },
)

st.divider()
with st.expander("Changesets (maker/checker queue)"):
    cs = ui.load(client.changesets)
    ui.rows_table(
        cs,
        {
            "ID": "id",
            "Title": "title",
            "Author": "author",
            "Tier": lambda r: f"T{r.get('tier', 1)}",
            "Status": "status",
            "Domains": lambda r: ", ".join(r.get("domains") or []),
            "Created": "createdAt",
        },
        empty="No changesets yet.",
    )
