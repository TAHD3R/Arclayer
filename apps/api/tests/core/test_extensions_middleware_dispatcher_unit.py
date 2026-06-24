"""Unit/integration tests for TenantAwareExtensionMiddlewareDispatcher."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.testclient import TestClient
from starlette.types import ASGIApp, Receive, Scope, Send

from src.core.extensions.middleware_dispatcher import TenantAwareExtensionMiddlewareDispatcher
from src.core.extensions.tenant_registry import TenantAwareMiddlewareRegistry


class _InjectWorkspaceId:
    """Raw ASGI middleware that injects workspace_id into scope state."""

    def __init__(self, app: ASGIApp, ws_id: str) -> None:
        self.app = app
        self._ws_id = ws_id

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            scope.setdefault("state", {})
            scope["state"]["workspace_id"] = self._ws_id
        await self.app(scope, receive, send)


# ——— Hook classes for testing ——————————————————————————————————————————


class _BeforeAfterHook:
    def __init__(self, hook_type: str = "request", name: str = "") -> None:
        self.hook_type = hook_type
        self.name = name
        self.before_calls: list[str] = []
        self.after_calls: list[str] = []

    async def before_route(self, request: Request) -> Request:
        self.before_calls.append(self.name)
        return request

    async def after_response(self, request: Request, response: Response) -> Response:
        self.after_calls.append(self.name)
        return response


class _InjectHeaderHook:
    hook_type = "request"

    async def before_route(self, request: Request) -> Request:
        request.state.injected_by_hook = "yes"
        return request

    async def after_response(self, request: Request, response: Response) -> Response:
        response.headers["x-hook"] = "executed"
        return response


class _ModifyResponseHook:
    hook_type = "request"

    async def before_route(self, request: Request) -> Request:
        return request

    async def after_response(self, request: Request, response: Response) -> Response:
        response.headers["x-modified"] = "1"
        return response


class _FailingBeforeHook:
    hook_type = "request"

    async def before_route(self, request: Request) -> Request:
        raise RuntimeError("before hook failure")

    async def after_response(self, request: Request, response: Response) -> Response:
        return response


# ——— Helpers ————————————————————————————————————————————————————————————


def _build_app(registry: TenantAwareMiddlewareRegistry) -> Starlette:
    async def home(request: Request) -> Response:
        injected = getattr(request.state, "injected_by_hook", None)
        return JSONResponse({"ok": True, "injected": injected})

    return Starlette(
        routes=[Route("/", home)],
        middleware=[Middleware(TenantAwareExtensionMiddlewareDispatcher, registry=registry)],
    )


def _build_app_with_ws(registry: TenantAwareMiddlewareRegistry, ws_id: UUID) -> Starlette:
    async def home(request: Request) -> Response:
        injected = getattr(request.state, "injected_by_hook", None)
        return JSONResponse({"ok": True, "injected": injected})

    return Starlette(
        routes=[Route("/", home)],
        middleware=[
            Middleware(_InjectWorkspaceId, ws_id=str(ws_id)),
            Middleware(TenantAwareExtensionMiddlewareDispatcher, registry=registry),
        ],
    )


# ——— Tests —————————————————————————————————————————————————————————————


class TestMiddlewareDispatcher:
    def test_pass_through_when_no_workspace_id(self):
        reg = TenantAwareMiddlewareRegistry()
        reg.register("ext", "hook", _BeforeAfterHook)
        reg.set_active("ext", uuid4())

        app = _build_app(reg)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200

    def test_pass_through_when_no_active_hooks(self):
        reg = TenantAwareMiddlewareRegistry()
        app = _build_app(reg)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200

    def test_before_route_is_called(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        hook = _BeforeAfterHook(name="h1")
        reg.register("ext", "h1", lambda: hook)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200
        assert hook.before_calls == ["h1"]

    def test_after_response_is_called(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        hook = _BeforeAfterHook(name="h1")
        reg.register("ext", "h1", lambda: hook)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200
        assert hook.after_calls == ["h1"]

    def test_before_hook_can_inject_state(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        reg.register("ext", "inject", _InjectHeaderHook)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["injected"] == "yes"
        assert resp.headers.get("x-hook") == "executed"

    def test_after_response_can_modify_response(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        reg.register("ext", "modify", _ModifyResponseHook)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.headers.get("x-modified") == "1"

    def test_hooks_called_in_correct_order(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        h1 = _BeforeAfterHook(name="h1")
        h2 = _BeforeAfterHook(name="h2")
        reg.register("ext", "h1", lambda: h1)
        reg.register("ext", "h2", lambda: h2)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=False)
        client.get("/")

        assert h1.before_calls == ["h1"]
        assert h2.before_calls == ["h2"]
        assert h1.after_calls == ["h1"]
        assert h2.after_calls == ["h2"]

    def test_inactive_workspace_hooks_not_called(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_active = uuid4()
        ws_test = uuid4()
        hook = _BeforeAfterHook(name="h1")
        reg.register("ext", "h1", lambda: hook)
        reg.set_active("ext", ws_active)

        app = _build_app_with_ws(reg, ws_test)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/")
        assert resp.status_code == 200
        assert hook.before_calls == []
        assert hook.after_calls == []

    def test_before_hook_failure_propagates(self):
        reg = TenantAwareMiddlewareRegistry()
        ws_id = uuid4()
        reg.register("ext", "fail", _FailingBeforeHook)
        reg.set_active("ext", ws_id)

        app = _build_app_with_ws(reg, ws_id)
        client = TestClient(app, raise_server_exceptions=True)
        with pytest.raises(RuntimeError, match="before hook failure"):
            client.get("/")
