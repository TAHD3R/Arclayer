from __future__ import annotations

import json

import httpx
import pytest

from src.modules.extensions.manifest import RemoteHookDecl
from src.modules.extensions.remote_hooks.dispatcher import dispatch_remote_hook
from src.modules.extensions.schema import (
    FailurePolicy,
    RemoteHookOperation,
    RemoteHookRequestIn,
)


@pytest.mark.unit
async def test_remote_hook_dispatch_allow_with_patch_when_allowed() -> None:
    hook = RemoteHookDecl(
        operation=RemoteHookOperation.CONTENT_ENTRY_BEFORE_SAVE,
        endpoint_url="https://example.test/hook",
        timeout_ms=500,
        failure_policy=FailurePolicy.FAIL_OPEN,
        allowed_patch_paths=["title"],
    )
    req = RemoteHookRequestIn(
        operation=hook.operation,
        payload={"title": "hello"},
        allowed_patch_paths=["title"],
    )

    async def _post(url: str, body: bytes, headers: dict[str, str], timeout_s: float) -> httpx.Response:
        assert url == hook.endpoint_url
        assert timeout_s > 0
        assert headers.get("X-Arclayer-Operation") == str(hook.operation)
        assert headers.get("X-Arclayer-Timestamp") == "1700000000"

        parsed = json.loads(body.decode("utf-8"))
        assert parsed["operation"] == str(hook.operation)

        payload = {"decision": "allow", "patch": [{"path": "title", "value": "patched"}], "warnings": []}
        return httpx.Response(200, json=payload)

    out = await dispatch_remote_hook(
        hook=hook,
        request=req,
        secret="secret",
        timestamp="1700000000",
        post_json=_post,
    )

    assert out.ok is True
    assert out.response.decision == "allow"
    assert len(out.response.patch) == 1
    assert out.response.patch[0].path == "title"


@pytest.mark.unit
async def test_remote_hook_dispatch_fail_open_on_forbidden_patch_path() -> None:
    hook = RemoteHookDecl(
        operation=RemoteHookOperation.CONTENT_ENTRY_BEFORE_SAVE,
        endpoint_url="https://example.test/hook",
        failure_policy=FailurePolicy.FAIL_OPEN,
        allowed_patch_paths=["title"],
    )
    req = RemoteHookRequestIn(operation=hook.operation, allowed_patch_paths=["title"])

    async def _post(_url: str, _body: bytes, _headers: dict[str, str], _timeout_s: float) -> httpx.Response:
        return httpx.Response(200, json={"decision": "allow", "patch": [{"path": "forbidden", "value": "x"}]})

    out = await dispatch_remote_hook(
        hook=hook,
        request=req,
        secret=None,
        timestamp="1700000000",
        post_json=_post,
    )

    assert out.ok is False
    assert out.response.decision == "allow"
    assert "remote_hook_failed" in out.response.warnings


@pytest.mark.unit
async def test_remote_hook_dispatch_fail_closed_on_http_error() -> None:
    hook = RemoteHookDecl(
        operation=RemoteHookOperation.CONTENT_ENTRY_VALIDATE,
        endpoint_url="https://example.test/hook",
        failure_policy=FailurePolicy.FAIL_CLOSED,
    )
    req = RemoteHookRequestIn(operation=hook.operation)

    async def _post(_url: str, _body: bytes, _headers: dict[str, str], _timeout_s: float) -> httpx.Response:
        return httpx.Response(500, json={"error": "nope"})

    out = await dispatch_remote_hook(
        hook=hook,
        request=req,
        secret=None,
        timestamp="1700000000",
        post_json=_post,
    )

    assert out.ok is False
    assert out.response.decision == "deny"
    assert "remote_hook_failed" in out.response.warnings
