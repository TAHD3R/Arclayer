from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import ValidationError

from apps.api.src.core.logging import get_logger
from apps.api.src.modules.extensions.manifest import RemoteHookDecl
from apps.api.src.modules.extensions.schema import (
    FailurePolicy,
    RemoteHookDecision,
    RemoteHookRequestIn,
    RemoteHookResponseOut,
)

logger = get_logger(__name__)

SIGNATURE_HEADER = "X-Arclayer-Signature"
TIMESTAMP_HEADER = "X-Arclayer-Timestamp"
TRACE_ID_HEADER = "X-Arclayer-Trace-Id"
OPERATION_HEADER = "X-Arclayer-Operation"

MAX_PATCH_ITEMS = 50
MAX_WARNINGS = 20


class RemoteHookDispatchError(RuntimeError):
    pass


@dataclass(frozen=True)
class RemoteHookDispatchOutcome:
    response: RemoteHookResponseOut
    ok: bool
    error: str | None = None


async def dispatch_remote_hook(
    *,
    hook: RemoteHookDecl,
    request: RemoteHookRequestIn,
    secret: str | None,
    timestamp: str,
    post_json: Callable[[str, bytes, dict[str, str], float], Awaitable[httpx.Response]] | None = None,
) -> RemoteHookDispatchOutcome:
    """
    Dispatch a governed sync remote hook callout.

    Notes:
    - Failure semantics are explicit via hook.failure_policy.
    - Restricted patch paths are enforced after parsing the provider response.
    """

    body = _encode_request(request)
    headers = _build_headers(request=request, secret=secret, timestamp=timestamp, body=body)
    timeout_s = max(int(hook.timeout_ms), 1) / 1000.0

    async def _post(url: str) -> httpx.Response:
        if post_json is not None:
            return await post_json(url, body, headers, timeout_s)
        return await _post_json(url, body=body, headers=headers, timeout_s=timeout_s)

    try:
        resp = await _post(hook.endpoint_url)
        if resp.status_code < 200 or resp.status_code >= 300:
            raise RemoteHookDispatchError(f"HTTP_{resp.status_code}")
        parsed = _parse_response(resp)
        _validate_patch(parsed, allowed_paths=_resolve_allowed_patch_paths(hook=hook, request=request))
        _validate_warnings(parsed)
        return RemoteHookDispatchOutcome(response=parsed, ok=True, error=None)
    except RemoteHookDispatchError as exc:
        logger.warning(
            "Remote hook dispatch failed",
            action="remote_hook_dispatch",
            operation=str(request.operation),
            endpoint=hook.endpoint_url,
            error=str(exc),
        )
        return _handle_failure(hook=hook, error=str(exc))
    except (httpx.HTTPError, ValidationError, TypeError, ValueError) as exc:
        logger.warning(
            "Remote hook dispatch error",
            action="remote_hook_dispatch",
            operation=str(request.operation),
            endpoint=hook.endpoint_url,
            error=str(exc),
        )
        return _handle_failure(hook=hook, error=str(exc))


def _handle_failure(*, hook: RemoteHookDecl, error: str) -> RemoteHookDispatchOutcome:
    if hook.failure_policy == FailurePolicy.FAIL_CLOSED:
        return RemoteHookDispatchOutcome(
            response=RemoteHookResponseOut(
                decision=RemoteHookDecision.DENY,
                warnings=["remote_hook_failed"],
                diagnostics={"error": error},
            ),
            ok=False,
            error=error,
        )
    return RemoteHookDispatchOutcome(
        response=RemoteHookResponseOut(
            decision=RemoteHookDecision.ALLOW,
            warnings=["remote_hook_failed"],
            diagnostics={"error": error},
        ),
        ok=False,
        error=error,
    )


def _encode_request(request: RemoteHookRequestIn) -> bytes:
    payload = request.model_dump()
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def _build_headers(
    *,
    request: RemoteHookRequestIn,
    secret: str | None,
    timestamp: str,
    body: bytes,
) -> dict[str, str]:
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        TIMESTAMP_HEADER: timestamp,
        OPERATION_HEADER: str(request.operation),
    }

    trace_id = (request.context.trace_id or "").strip()
    if trace_id:
        headers[TRACE_ID_HEADER] = trace_id

    if secret and secret.strip():
        headers[SIGNATURE_HEADER] = _sign(secret=secret, timestamp=timestamp, body=body)

    return headers


def _sign(*, secret: str, timestamp: str, body: bytes) -> str:
    msg = timestamp.encode("utf-8") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), msg=msg, digestmod=hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def _post_json(url: str, *, body: bytes, headers: dict[str, str], timeout_s: float) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.post(url, content=body, headers=headers)
    return resp


def _parse_response(resp: httpx.Response) -> RemoteHookResponseOut:
    try:
        raw: Any = resp.json()
    except ValueError as exc:
        raise RemoteHookDispatchError("INVALID_JSON") from exc
    if raw is None:
        raise RemoteHookDispatchError("EMPTY_RESPONSE")
    if not isinstance(raw, dict):
        raise RemoteHookDispatchError("INVALID_RESPONSE_SHAPE")
    return RemoteHookResponseOut.model_validate(raw)


def _resolve_allowed_patch_paths(*, hook: RemoteHookDecl, request: RemoteHookRequestIn) -> set[str]:
    from_request = {str(p) for p in (request.allowed_patch_paths or []) if str(p).strip()}
    from_policy = {str(p) for p in (hook.allowed_patch_paths or []) if str(p).strip()}
    if not from_policy:
        return from_request
    if not from_request:
        return from_policy
    return from_request.intersection(from_policy)


def _validate_patch(response: RemoteHookResponseOut, *, allowed_paths: set[str]) -> None:
    patch = list(response.patch or [])
    if not patch:
        return
    if len(patch) > MAX_PATCH_ITEMS:
        raise RemoteHookDispatchError("PATCH_TOO_LARGE")
    if not allowed_paths:
        raise RemoteHookDispatchError("PATCH_NOT_ALLOWED")
    for item in patch:
        path = str(item.path or "").strip()
        if not path:
            raise RemoteHookDispatchError("PATCH_PATH_EMPTY")
        if path not in allowed_paths:
            raise RemoteHookDispatchError(f"PATCH_PATH_FORBIDDEN:{path}")


def _validate_warnings(response: RemoteHookResponseOut) -> None:
    warnings = list(response.warnings or [])
    if not warnings:
        return
    if len(warnings) > MAX_WARNINGS:
        raise RemoteHookDispatchError("WARNINGS_TOO_MANY")
