from __future__ import annotations

from typing import Any
from uuid import UUID

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.core.extensions.tenant_registry import TenantAwareMiddlewareRegistry
from src.core.logging import get_logger

logger = get_logger(__name__)

_WS_ID_ATTR = "workspace_id"
_USER_ID_ATTR = "user_id"

# Sensitive auth attributes that hooks must not mutate.
_SECURE_ATTRS = (_WS_ID_ATTR, _USER_ID_ATTR, "workspace_membership_id", "organization_id")


def _read_workspace_id(scope: Scope) -> UUID | None:
    """Extract workspace_id from scope state, handling both dict and State."""
    state = scope.get("state")
    if state is None:
        return None
    if hasattr(state, "_state"):
        raw = state._state.get(_WS_ID_ATTR)
    else:
        raw = state.get(_WS_ID_ATTR) if isinstance(state, dict) else None
    if isinstance(raw, UUID):
        return raw
    if isinstance(raw, str):
        try:
            return UUID(raw)
        except ValueError:
            return None
    return None


def _snapshot_auth_context(request: Request) -> dict[str, Any]:
    """Capture auth-related state before hooks run."""
    snap: dict[str, Any] = {}
    if hasattr(request.state, "_state"):
        for attr in _SECURE_ATTRS:
            if attr in request.state._state:
                snap[attr] = request.state._state[attr]
    return snap


def _restore_auth_context(request: Request, snapshot: dict[str, Any]) -> None:
    """Restore auth state after hooks run, discarding any hook mutations."""
    if hasattr(request.state, "_state"):
        for attr, value in snapshot.items():
            request.state._state[attr] = value
        # Remove any secure attrs injected by hooks that weren't there before
        for attr in _SECURE_ATTRS:
            if attr not in snapshot and attr in request.state._state:
                del request.state._state[attr]


class TenantAwareExtensionMiddlewareDispatcher:
    """First-party ASGI middleware that dispatches requests to Extension hooks.

    Placement: after WorkspaceContextMiddleware (which sets
    ``request.state.workspace_id``), before Extension route handlers.

    Extension hooks never see requests from workspaces where the extension is
    not activated.  Unauthenticated requests (no ``workspace_id``) skip
    extension hooks entirely.  Auth context is frozen before hooks run and
    restored afterward — hooks cannot mutate workspace_id, user_id, or
    membership state.

    Streaming responses (SSE, file downloads) pass through without buffering.
    For non-streaming responses, the dispatcher captures the response so
    after_response hooks can inspect/modify it.

    Hook contract (Phase 2):
        before_route(request) -> request
        after_response(request, response) -> response
    """

    def __init__(self, app: ASGIApp, *, registry: TenantAwareMiddlewareRegistry) -> None:
        self.app = app
        self._registry = registry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        ws_id = _read_workspace_id(scope)
        if ws_id is None:
            await self.app(scope, receive, send)
            return

        hooks = self._registry.get_active_hooks(ws_id, hook_type="request")
        if not hooks:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        # Freeze auth context before hooks run.
        auth_snapshot = _snapshot_auth_context(request)

        # before_route pass
        for hook in hooks:
            if hasattr(hook, "before_route"):
                try:
                    request = await hook.before_route(request)
                except Exception:
                    logger.exception("Extension before_route hook failed", workspace_id=str(ws_id))
                    raise

        # Restore auth context — hooks must not mutate it.
        _restore_auth_context(request, auth_snapshot)

        if not self._any_after_hooks(hooks):
            await self.app(scope, receive, send)
            return

        # Capture response; pass through streaming responses detected by Content-Type.
        captured_status: list[int] = []
        captured_headers: list[list[tuple[bytes, bytes]]] = []
        captured_body: list[bytes] = []
        passthrough_streaming = False

        def _is_streaming_response(hdrs: list[tuple[bytes, bytes]]) -> bool:
            ct = next(
                (v.decode("latin-1").lower() for k, v in hdrs if k.lower() == b"content-type"),
                "",
            )
            return ct.startswith("text/event-stream") or ct.startswith("application/octet-stream")

        async def _inner_send(message: Message) -> None:
            nonlocal passthrough_streaming
            if message["type"] == "http.response.start":
                hdrs = message.get("headers", [])
                if _is_streaming_response(hdrs):
                    passthrough_streaming = True
                    await send(message)
                    return
                captured_status.append(message["status"])
                captured_headers.append(hdrs)
                return

            if message["type"] == "http.response.body":
                if passthrough_streaming:
                    await send(message)
                    return
                captured_body.append(message.get("body", b""))

        await self.app(scope, receive, _inner_send)
        if passthrough_streaming:
            return

        status = captured_status[0] if captured_status else 200
        raw_headers = captured_headers[0] if captured_headers else []
        body = b"".join(captured_body)

        # Rebuild response preserving multi-value headers.
        response = Response(content=body, status_code=status)
        for k, v in raw_headers:
            key = k.decode("latin-1")
            val = v.decode("latin-1")
            if key.lower() in response.headers:
                response.headers.append(key, val)
            else:
                response.headers[key] = val

        # after_response pass (reverse order)
        for hook in reversed(hooks):
            if hasattr(hook, "after_response"):
                try:
                    response = await hook.after_response(request, response)
                except Exception:
                    logger.exception("Extension after_response hook failed", workspace_id=str(ws_id))
                    raise

        # Replay through real send, preserving multi-value headers.
        replay_headers: list[tuple[bytes, bytes]] = []
        for k, v in response.headers.items():
            replay_headers.append((k.encode("latin-1"), v.encode("latin-1")))

        await send({
            "type": "http.response.start",
            "status": response.status_code,
            "headers": replay_headers,
        })
        await send({
            "type": "http.response.body",
            "body": response.body,
            "more_body": False,
        })

    @staticmethod
    def _any_after_hooks(hooks: list) -> bool:
        return any(hasattr(h, "after_response") for h in hooks)
