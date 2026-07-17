"""Thin REST client for the governed DCT control-plane API.

Both the AppKit (React) UI and this Streamlit UI are thin clients over the SAME
``/api/*`` surface exposed by the ``@dct/appkit-app`` server. This module holds NO
business logic — it only injects the dev-auth persona headers and forwards the
request. The contract, engine, and governance all live server-side, so both UIs
render identical governed truth by construction. Alignment is structural.

Config (env):
    MMP_API_BASE   base URL of the appkit server (default http://localhost:8137)
    MMP_PERSONA    dev-auth persona key (default ``alice`` — a modeler)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests

DEFAULT_API_BASE = "http://localhost:8137"
DEFAULT_PERSONA = "alice"
REQUEST_TIMEOUT = 15  # seconds


# ---------------------------------------------------------------------------
# Personas (dev-auth) — mirror of apps/appkit/client/src/lib/api.ts PERSONAS.
# Same identities/roles/domains so a Streamlit page and the AppKit page render
# identical data for a given persona (that IS the alignment guarantee).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Persona:
    key: str
    label: str
    sub: str
    roles: list[str]
    domains: list[str]


PERSONAS: dict[str, Persona] = {
    "viewer": Persona("viewer", "Viewer (read-only)", "viewer", ["viewer"], ["*"]),
    "alice": Persona("alice", "Alice — Modeler", "alice", ["modeler"], ["*"]),
    "bob": Persona("bob", "Bob — Steward (reference)", "bob", ["steward"], ["reference"]),
    "frank": Persona("frank", "Frank — Steward (trading)", "frank", ["steward"], ["trading"]),
    "carol": Persona(
        "carol", "Carol — Domain Owner", "carol", ["domain_owner"], ["reference", "trading"]
    ),
    "dana": Persona(
        "dana", "Dana — Chief Data Architect", "dana", ["chief_data_architect"], ["*"]
    ),
    "pat": Persona("pat", "Pat — Platform Engineer", "pat", ["platform_engineer"], ["*"]),
}


def api_base() -> str:
    """Base URL of the governed API, from ``MMP_API_BASE`` (trailing slash trimmed)."""
    return os.environ.get("MMP_API_BASE", DEFAULT_API_BASE).rstrip("/")


def persona_key() -> str:
    """Active persona key from ``MMP_PERSONA``, falling back to the default modeler."""
    key = os.environ.get("MMP_PERSONA", DEFAULT_PERSONA)
    return key if key in PERSONAS else DEFAULT_PERSONA


def active_persona() -> Persona:
    """The persona whose headers this UI sends (env-driven default)."""
    return PERSONAS[persona_key()]


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


class ApiError(RuntimeError):
    """Raised for any non-2xx response or transport failure.

    ``status`` is the HTTP status code, or ``0`` for a transport/network error.
    """

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


def _headers(persona: Persona) -> dict[str, str]:
    """The dev-auth headers the AppKit persona switcher also sends."""
    return {
        "x-dct-user": persona.sub,
        "x-dct-roles": ",".join(persona.roles),
        "x-dct-domains": ",".join(persona.domains),
    }


class ApiClient:
    """A minimal, stateless client over ``/api/*``.

    One instance per (base, persona). Endpoint helpers mirror the AppKit
    TypeScript client one-to-one so the two UIs stay mechanically aligned.
    """

    def __init__(self, base: str | None = None, persona: Persona | None = None) -> None:
        self.base = (base or api_base()).rstrip("/")
        self.persona = persona or active_persona()

    # -- low-level ----------------------------------------------------------

    def _url(self, path: str, params: dict[str, Any] | None = None) -> str:
        url = f"{self.base}{path}"
        clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        if clean:
            url = f"{url}?{urlencode(clean)}"
        return url

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        body: Any | None = None,
    ) -> Any:
        url = self._url(path, params)
        try:
            resp = requests.request(
                method,
                url,
                headers=_headers(self.persona),
                json=body if method == "POST" else None,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:  # transport failure (server down, DNS, timeout)
            raise ApiError(f"cannot reach {url}: {exc}", 0) from exc

        data: Any = None
        if resp.content:
            try:
                data = resp.json()
            except ValueError:
                data = None

        if not resp.ok:
            message = f"{resp.status_code} {resp.reason}"
            if isinstance(data, dict) and isinstance(data.get("error"), str):
                message = data["error"]
            raise ApiError(message, resp.status_code)
        return data

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, body: Any | None = None) -> Any:
        return self._request("POST", path, body=body if body is not None else {})

    # -- endpoint helpers (mirror apps/appkit/client/src/lib/api.ts) --------

    def meta(self) -> Any:
        return self.get("/api/meta")

    def catalog(self) -> Any:
        return self.get("/api/catalog")

    def domains(self) -> Any:
        return self.get("/api/domains")

    def registry(self) -> Any:
        return self.get("/api/registry")

    def mappings(self) -> Any:
        return self.get("/api/mappings")

    def dq(self) -> Any:
        return self.get("/api/dq")

    def erd(self) -> Any:
        return self.get("/api/erd")

    def runs(self) -> Any:
        return self.get("/api/runs")

    def trigger_run(self) -> Any:
        return self.post("/api/runs", {})

    def access(self) -> Any:
        return self.get("/api/access")

    def access_check(self, sub: str, capability: str, domain: str | None = None) -> Any:
        return self.get(
            "/api/access/check",
            {"sub": sub, "capability": capability, "domain": domain},
        )

    def changesets(self) -> Any:
        return self.get("/api/changesets")

    def migration(self) -> Any:
        return self.get("/api/migration")

    def products(self) -> Any:
        return self.get("/api/products")
