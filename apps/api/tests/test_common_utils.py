from __future__ import annotations

import pytest
from fastapi import FastAPI

from apps.api.common.utils import (
    ensure_unique_route_names,
    hash_password,
    redact,
    simplify_operation_ids,
    verify_password,
)


def test_redact_dict_and_list() -> None:
    payload = {
        "password": "secret",
        "token": "abc",
        "profile": {"phone": "123", "name": "ok"},
        "items": list(range(200)),
    }
    redacted = redact(payload)

    assert redacted["password"] == "***"
    assert redacted["token"] == "***"
    assert redacted["profile"]["phone"] == "***"
    assert redacted["profile"]["name"] == "ok"
    assert len(redacted["items"]) == 100


def test_password_hash_and_verify() -> None:
    hashed = hash_password("hello")
    assert verify_password("hello", hashed) is True
    assert verify_password("bad", hashed) is False


def test_ensure_unique_route_names() -> None:
    app = FastAPI()

    @app.get("/a", name="dup")
    def route_a() -> dict[str, str]:
        return {"ok": "1"}

    @app.get("/b", name="dup")
    def route_b() -> dict[str, str]:
        return {"ok": "1"}

    with pytest.raises(ValueError):
        ensure_unique_route_names(app)


def test_simplify_operation_ids() -> None:
    app = FastAPI()

    @app.get("/hello", name="hello")
    def hello() -> dict[str, str]:
        return {"ok": "1"}

    simplify_operation_ids(app)
    route = next(r for r in app.routes if getattr(r, "name", None) == "hello")
    assert route.operation_id == "hello"
