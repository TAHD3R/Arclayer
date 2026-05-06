from __future__ import annotations

from fastapi import Request
from pydantic import BaseModel, ConfigDict


class AuthRequestContext(BaseModel):
    model_config = ConfigDict(frozen=True)
    ip_address: str | None
    user_agent: str | None


def _first_forwarded_ip(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    first = raw.split(",", 1)[0].strip()
    return first or None


def _normalize_user_agent(value: str | None) -> str | None:
    raw = (value or "").strip()
    return raw or None


def build_auth_request_context(request: Request) -> AuthRequestContext:
    forwarded_ip = _first_forwarded_ip(request.headers.get("x-forwarded-for"))
    client_host = None if request.client is None else request.client.host
    return AuthRequestContext(
        ip_address=forwarded_ip or client_host,
        user_agent=_normalize_user_agent(request.headers.get("user-agent")),
    )
