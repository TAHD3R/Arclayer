from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from structlog.contextvars import bind_contextvars

from src.common.constants.auth import TOKEN_TYPE_ACCESS
from src.core.exceptions import APIError
from src.core.extensions.tenant_registry import TenantAwareMiddlewareRegistry
from src.core.logging import get_logger

logger = get_logger(__name__)

_WS_ID_ATTR = "workspace_id"
_USER_ID_ATTR = "user_id"

# Sensitive auth attributes that hooks must not mutate.
_SECURE_ATTRS = (_WS_ID_ATTR, _USER_ID_ATTR, "workspace_membership_id", "organization_id")


class VerifiedExtensionRequestContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    workspace_id: UUID
    user_id: UUID
    workspace_membership_id: UUID
    organization_id: UUID


def _read_state_value(scope: Scope, attr: str) -> Any | None:
    state = scope.get("state")
    if state is None:
        return None
    if hasattr(state, "_state"):
        return state._state.get(attr)
    if isinstance(state, dict):
        return state.get(attr)
    return None


def _write_state_value(scope: Scope, attr: str, value: Any) -> None:
    scope.setdefault("state", {})
    state = scope["state"]
    if hasattr(state, "_state"):
        state._state[attr] = value
        return
    if isinstance(state, dict):
        state[attr] = value


def _read_workspace_id(scope: Scope) -> UUID | None:
    """Extract workspace_id from scope state, handling both dict and State."""
    raw = _read_state_value(scope, _WS_ID_ATTR)
    if isinstance(raw, UUID):
        return raw
    if isinstance(raw, str):
        try:
            return UUID(raw)
        except ValueError:
            return None
    return None


def _extract_bearer_token(scope: Scope) -> str | None:
    headers = scope.get("headers") or []
    raw_auth = next((v for k, v in headers if k.lower() == b"authorization"), None)
    if raw_auth is None:
        return None
    try:
        auth = raw_auth.decode("latin-1").strip()
    except UnicodeDecodeError:
        return None
    prefix = "bearer "
    if not auth.lower().startswith(prefix):
        return None
    token = auth[len(prefix) :].strip()
    return token or None


def _parse_user_id(raw: object | None) -> UUID | None:
    if raw is None:
        return None
    try:
        return UUID(str(raw))
    except (TypeError, ValueError):
        return None


async def _resolve_verified_context(scope: Scope, workspace_id: UUID) -> VerifiedExtensionRequestContext | None:
    token = _extract_bearer_token(scope)
    if token is None:
        return None

    try:
        from src.config import get_settings
        from src.models.organization.user import UserStatus
        from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
        from src.modules.auth.repository import UserRepository
        from src.modules.auth.tokens.service import decode_token

        settings = get_settings()
        payload = decode_token(token, settings.auth)
        if payload.get("typ") != TOKEN_TYPE_ACCESS:
            return None

        user_id = _parse_user_id(payload.get("sub"))
        if user_id is None:
            return None

        user = await UserRepository().get_by_id(user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            return None
        if user.token_version != payload.get("ver"):
            return None

        workspace = await Workspace.get_or_none(id=workspace_id, deleted_at__isnull=True)
        if workspace is None or not workspace.is_active:
            return None

        membership = await WorkspaceMembership.get_or_none(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if membership is None:
            return None

        return VerifiedExtensionRequestContext(
            workspace_id=workspace_id,
            user_id=user_id,
            workspace_membership_id=UUID(str(membership.id)),
            organization_id=UUID(str(workspace.organization_id)),
        )
    except APIError:
        return None


def _apply_verified_context(scope: Scope, context: VerifiedExtensionRequestContext) -> None:
    _write_state_value(scope, _WS_ID_ATTR, context.workspace_id)
    _write_state_value(scope, _USER_ID_ATTR, context.user_id)
    _write_state_value(scope, "workspace_membership_id", context.workspace_membership_id)
    _write_state_value(scope, "organization_id", context.organization_id)
    bind_contextvars(
        workspace_id=str(context.workspace_id),
        organization_id=str(context.organization_id),
        workspace_membership_id=str(context.workspace_membership_id),
        user_id=str(context.user_id),
    )


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

    Placement: after WorkspaceContextMiddleware (which sets a candidate
    ``request.state.workspace_id`` from the route path), before Extension route
    handlers.

    Extension hooks never see requests from workspaces where the extension is
    not activated.  When hooks exist for the candidate workspace, the dispatcher
    verifies the bearer token, active user, active workspace, and workspace
    membership before invoking hooks.  Requests that cannot be verified skip
    hooks and continue to the route layer, where the normal auth dependency
    returns the user-facing 401/403.  Auth context is frozen before hooks run
    and restored afterward — hooks cannot mutate workspace_id, user_id, or
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

        verified_context = await _resolve_verified_context(scope, ws_id)
        if verified_context is None:
            logger.info("Extension hooks skipped for unverified workspace request", workspace_id=str(ws_id))
            await self.app(scope, receive, send)
            return
        _apply_verified_context(scope, verified_context)

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
