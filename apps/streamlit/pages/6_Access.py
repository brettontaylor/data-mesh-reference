"""Access — roles, capabilities, domains, approval policy, and the interactive
access checker. Parallel to the AppKit Access page; same `/api/access`.
"""
import streamlit as st

from lib import ui

st.set_page_config(page_title="MMP · Access", layout="wide")
client = ui.render_sidebar()

ui.kicker_header(
    "ACCESS",
    "Access management",
    "Roles, capabilities, domain scopes, the two-tier approval policy, and the checker.",
)

acc = ui.load(client.access)
tabs = st.tabs(["Users", "Role matrix", "Data clearance", "Approval policy", "Checker"])

with tabs[0]:
    ui.rows_table(
        acc["users"],
        {
            "User": "sub",
            "Label": "label",
            "Roles": lambda u: ", ".join(u.get("roles") or []),
            "Domains": lambda u: ", ".join(u.get("domains") or []),
            "Capabilities": lambda u: len(u.get("capabilities") or []),
        },
    )

with tabs[1]:
    caps = acc["capabilities"]
    matrix = []
    for role in acc["roles"]:
        row = {"Role": role["role"]}
        granted = set(role.get("capabilities") or [])
        for cap in caps:
            row[cap] = "✓" if cap in granted else ""
        matrix.append(row)
    st.dataframe(matrix, use_container_width=True, hide_index=True)

with tabs[2]:
    dm = acc.get("dataAccessModel") or {}
    ui.rows_table(
        dm.get("roles") or [],
        {
            "Role": "role",
            "Label": "label",
            "Max tier": "maxTier",
            "PII": lambda r: r.get("pii"),
            "MNPI": lambda r: r.get("mnpi"),
        },
        empty="No data-clearance model.",
    )

with tabs[3]:
    st.json(acc.get("approvalPolicy") or {})

with tabs[4]:
    users = [u["sub"] for u in acc["users"]]
    c1, c2, c3 = st.columns(3)
    sub = c1.selectbox("User", users)
    capability = c2.selectbox("Capability", acc["capabilities"])
    domain = c3.text_input("Domain (optional)")
    if st.button("Check access"):
        res = ui.load(lambda: client.access_check(sub, capability, domain or None))
        (st.success if res["allowed"] else st.error)("ALLOWED" if res["allowed"] else "DENIED")
        for reason in res.get("reasons") or []:
            st.caption("• " + reason)
