"""Tiny render helpers shared across the Streamlit pages.

Deliberately minimal — no business logic, no data fetching decisions. These
just format governed data that already arrived from the API.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import streamlit as st

from lib.api import PERSONAS, ApiClient, ApiError, api_base, persona_key

# Governed asset kinds in narrative order (org kinds domain/product excluded) —
# mirrors apps/appkit/client/src/pages/DashboardPage.tsx KIND_ORDER.
KIND_ORDER = [
    "bdm",
    "pdm",
    "semantic",
    "mapping",
    "dq",
    "dqrule",
    "extract",
    "transformation",
    "refmap",
]

# Bronze -> Silver -> Gold, left to right (mirrors MedallionFlow.tsx STAGES).
STAGES: list[tuple[str, str]] = [
    ("bronze", "BRONZE — sources"),
    ("silver", "SILVER — conformed (BDM)"),
    ("gold", "GOLD — serving"),
]

_PERSONA_STATE_KEY = "mmp_persona"


# ---------------------------------------------------------------------------
# Client wiring + persona switch (the runtime parallel of the AppKit switcher)
# ---------------------------------------------------------------------------


def get_client() -> ApiClient:
    """Build a client for the persona selected in the sidebar (or the env default)."""
    key = st.session_state.get(_PERSONA_STATE_KEY, persona_key())
    persona = PERSONAS.get(key, PERSONAS[persona_key()])
    return ApiClient(base=api_base(), persona=persona)


def render_sidebar(active_ui: str = "streamlit") -> ApiClient:
    """Render the shared sidebar (persona + API base + the switch note) and return a client.

    Every page calls this first so persona/base handling stays in one place.
    """
    with st.sidebar:
        st.markdown("### DCT · parallel UI")
        st.caption("Streamlit thin client over the governed `/api/*` surface.")

        keys = list(PERSONAS.keys())
        current = st.session_state.get(_PERSONA_STATE_KEY, persona_key())
        index = keys.index(current) if current in keys else 0
        chosen = st.selectbox(
            "Persona (dev-auth)",
            keys,
            index=index,
            format_func=lambda k: PERSONAS[k].label,
            help="Sends x-dct-user / x-dct-roles / x-dct-domains headers — "
            "the same identities the AppKit persona switcher uses. "
            "Default comes from MMP_PERSONA.",
        )
        st.session_state[_PERSONA_STATE_KEY] = chosen

        p = PERSONAS[chosen]
        st.caption(f"sub · `{p.sub}`")
        st.caption("roles · " + ", ".join(f"`{r}`" for r in p.roles))
        st.caption("domains · " + ", ".join(f"`{d}`" for d in p.domains))

        st.divider()
        st.caption(f"API base · `{api_base()}`")
        st.caption(f"ACTIVE_UI · `{os.environ.get('ACTIVE_UI', active_ui)}`")

        st.info(
            "**The switch** — this is the Streamlit child. Flip to the AppKit "
            "(React) UI by opening the AppKit server in your browser. Both read "
            "the SAME API + data, so neither can drift. See README → *The switch*."
        )
    return get_client()


def load(fn: Callable[[], Any]) -> Any:
    """Call an API helper, rendering a friendly error + stopping the page on failure."""
    try:
        return fn()
    except ApiError as exc:
        status = exc.status or "network"
        st.error(f"Could not load from the governed API ({status}): {exc}")
        st.info(
            f"Is the appkit server reachable at `{api_base()}`? "
            "Set `MMP_API_BASE` to point elsewhere, then rerun."
        )
        st.stop()


# ---------------------------------------------------------------------------
# Pure render helpers
# ---------------------------------------------------------------------------


def kicker_header(kicker: str, title: str, sub: str | None = None) -> None:
    """A small uppercase kicker over a page title, with an optional sub-line."""
    st.markdown(
        f"<div style='font-size:0.72rem;letter-spacing:0.14em;"
        f"text-transform:uppercase;opacity:0.6'>{kicker}</div>",
        unsafe_allow_html=True,
    )
    st.title(title)
    if sub:
        st.caption(sub)


def chips(values: Sequence[Any]) -> str:
    """Render a sequence as inline code chips (returns a markdown string)."""
    return "  ".join(f"`{v}`" for v in values) if values else "—"


def kind_breakdown(by_kind: Mapping[str, int]) -> str:
    """`3 bdm · 2 pdm · …` in narrative kind order (mirrors the AppKit dashboard)."""
    parts = [f"{by_kind[k]} {k}" for k in KIND_ORDER if by_kind.get(k, 0) > 0]
    return " · ".join(parts)


def rows_table(
    rows: Sequence[Mapping[str, Any]],
    columns: Mapping[str, Any],
    *,
    empty: str = "Nothing to show.",
) -> None:
    """Project API dict rows down to ordered display columns, then st.dataframe.

    ``columns`` maps a display label -> either a key string or a ``callable(row)``.
    """
    if not rows:
        st.caption(empty)
        return
    out: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {}
        for label, accessor in columns.items():
            item[label] = accessor(row) if callable(accessor) else row.get(accessor)
        out.append(item)
    st.dataframe(out, use_container_width=True, hide_index=True)


def medallion_flow(flow: Mapping[str, Sequence[Mapping[str, Any]]]) -> None:
    """The hero visual: products flow Bronze -> Silver -> Gold, left to right.

    A faithful L->R medallion representation using Streamlit primitives
    (columns + bordered containers + metrics), parallel to the React MedallionFlow.
    """
    cols = st.columns([1, 0.18, 1, 0.18, 1])
    stage_cols = [cols[0], cols[2], cols[4]]
    arrow_cols = [cols[1], cols[3]]

    for arrow in arrow_cols:
        with arrow:
            st.markdown(
                "<div style='text-align:center;font-size:2rem;opacity:0.5;"
                "padding-top:2.5rem'>&rarr;</div>",
                unsafe_allow_html=True,
            )

    for (stage, label), col in zip(STAGES, stage_cols):
        nodes = sorted(flow.get(stage, []), key=lambda n: (n.get("domain", ""), n.get("id", "")))
        with col:
            with st.container(border=True):
                st.caption(label)
                st.metric("nodes", len(nodes))
                for node in nodes:
                    st.markdown(
                        f"**{node.get('id', '?')}**  \n"
                        f"<span style='opacity:0.6;font-size:0.8rem'>"
                        f"{node.get('kind', '')} · {node.get('domain', '')}</span>",
                        unsafe_allow_html=True,
                    )
