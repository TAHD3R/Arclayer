from __future__ import annotations

import importlib

import pytest
from starlette.requests import Request

from src.modules.auth.tokens.service import decode_token
from tests.modules.auth.test_auth_sessions_unit import _build

UA_CHROME_MAC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)


def _build_request(headers: list[tuple[bytes, bytes]], *, client_host: str = "10.0.0.2") -> Request:
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/auth/login",
        "root_path": "",
        "query_string": b"",
        "headers": headers,
        "client": (client_host, 443),
        "server": ("testserver", 443),
    })


def test_build_auth_request_context_prefers_forwarded_for() -> None:
    try:
        request_context_module = importlib.import_module("src.modules.auth.sessions.request_context")
    except ModuleNotFoundError as exc:
        pytest.fail(f"missing request_context module: {exc}")

    request = _build_request([
        (b"x-forwarded-for", b"203.0.113.8, 10.0.0.2"),
        (b"user-agent", UA_CHROME_MAC.encode()),
    ])

    context = request_context_module.build_auth_request_context(request)

    assert context.ip_address == "203.0.113.8"
    assert context.user_agent == UA_CHROME_MAC


def test_build_device_label_for_chrome_on_macos() -> None:
    try:
        device_label_module = importlib.import_module("src.modules.auth.sessions.device_label")
    except ModuleNotFoundError as exc:
        pytest.fail(f"missing device_label module: {exc}")

    label = device_label_module.build_device_label(UA_CHROME_MAC)

    assert label == "Chrome on macOS"


async def test_list_sessions_maps_unknown_location_to_null(monkeypatch) -> None:
    auth, sessions, _, user = _build(monkeypatch)
    try:
        request_context_module = importlib.import_module("src.modules.auth.sessions.request_context")
    except ModuleNotFoundError as exc:
        pytest.fail(f"missing request_context module: {exc}")

    request_context = request_context_module.AuthRequestContext(
        ip_address="203.0.113.8",
        user_agent=UA_CHROME_MAC,
    )

    try:
        tokens = await auth.issue_token_pair_for_user(
            user.id,
            request_context=request_context,
            auth_method="password",
        )
    except TypeError as exc:
        pytest.fail(f"missing metadata-aware token issuing signature: {exc}")

    access_payload = decode_token(tokens.access_token, auth.settings.auth)
    current_sid = access_payload.get("sid")
    assert isinstance(current_sid, str)

    async def _lookup_none(*, ip_address: str | None) -> str | None:
        assert ip_address == "203.0.113.8"
        return None

    monkeypatch.setattr(sessions, "_lookup_location_label", _lookup_none, raising=False)

    listed = await sessions.list_sessions(user_id=user.id, current_session_id=current_sid)

    assert listed.total == 1
    item = listed.items[0]
    assert item.ip_address == "203.0.113.8"
    assert item.user_agent == UA_CHROME_MAC
    assert item.device_label == "Chrome on macOS"
    assert item.location_label is None
    assert item.auth_method == "password"
    assert item.revocable is False
