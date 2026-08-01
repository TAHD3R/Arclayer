from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.routing import APIRoute

from src.config import get_settings
from src.core.middleware.guard_decorators import guard_decorator
from src.core.registry import create_app
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user
from src.modules.feedback.service import FeedbackService
from tests.utils.asgi_client import asgi_client


def _configure_guard_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "0")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("TASKIQ__ENABLED", "0")
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_PENETRATION_DETECTION", "1")
    monkeypatch.setenv("SECURITY__ENABLE_IP_BANNING", "0")
    monkeypatch.setenv("SECURITY__ENABLE_REDIS", "0")
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "0")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "0")
    get_settings.cache_clear()


def _valid_feedback_payload() -> dict[str, object]:
    return {
        "clientRequestId": "guard-feedback-check-1",
        "source": "header",
        "contextType": "global",
        "intent": "idea",
        "message": "The feedback center should remain accessible.",
        "contextUrl": "/system/feedback",
        "context": {"route": "/system/feedback"},
    }


async def _current_user() -> User:
    return cast(
        User,
        SimpleNamespace(
            id=uuid4(),
            email="guard-feedback-user@example.test",
            username="guard-feedback-user",
            display_name="Guard feedback user",
            avatar_url=None,
        ),
    )


def _feedback_route(app: FastAPI) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == "/api/v1/feedback" and "POST" in route.methods
    )


def test_feedback_route_bypasses_only_penetration_detection(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    route = _feedback_route(create_app())
    route_id = cast(str, vars(route.endpoint)["_guard_route_id"])
    route_config = guard_decorator.get_route_config(route_id)

    assert route_config is not None
    assert route_config.bypassed_checks == {"penetration"}
    assert route_config.rate_limit == 12
    assert route_config.rate_limit_window == 60


async def test_system_feedback_context_reaches_business_endpoint(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    app = create_app()
    app.dependency_overrides[get_current_user] = _current_user
    submit = AsyncMock(side_effect=HTTPException(status_code=409, detail="business endpoint reached"))

    with patch.object(FeedbackService, "submit", new=submit):
        async with asgi_client(app) as client:
            response = await client.post("/api/v1/feedback", json=_valid_feedback_payload())

    assert response.status_code == 409
    submit.assert_awaited_once()


async def test_same_system_context_is_blocked_on_other_routes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    app = create_app()

    @app.post("/guard-feedback-probe")
    async def guard_feedback_probe(payload: dict[str, object]) -> dict[str, bool]:
        return {"reached": bool(payload)}

    async with asgi_client(app) as client:
        response = await client.post("/guard-feedback-probe", json=_valid_feedback_payload())

    assert response.status_code == 400
    assert "Suspicious activity detected" in response.text


async def test_feedback_authentication_remains_required(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    app = create_app()
    submit = AsyncMock()

    with patch.object(FeedbackService, "submit", new=submit):
        async with asgi_client(app) as client:
            response = await client.post("/api/v1/feedback", json=_valid_feedback_payload())

    assert response.status_code == 401
    submit.assert_not_awaited()


async def test_feedback_csrf_protection_remains_active(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_current_user] = _current_user
    submit = AsyncMock()

    with patch.object(FeedbackService, "submit", new=submit):
        async with asgi_client(app) as client:
            response = await client.post("/api/v1/feedback", json=_valid_feedback_payload())

    assert response.status_code == 403
    assert response.json().get("error") == "CSRF_FAILED"
    submit.assert_not_awaited()


async def test_feedback_schema_validation_remains_active(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    app = create_app()
    app.dependency_overrides[get_current_user] = _current_user
    submit = AsyncMock()
    payload = {**_valid_feedback_payload(), "message": "x"}

    with patch.object(FeedbackService, "submit", new=submit):
        async with asgi_client(app) as client:
            response = await client.post("/api/v1/feedback", json=payload)

    assert response.status_code == 422
    submit.assert_not_awaited()


async def test_feedback_route_rate_limit_remains_active(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_guard_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "1")
    monkeypatch.setenv("SECURITY__RATE_LIMIT", "100")
    monkeypatch.setenv("SECURITY__RATE_LIMIT_WINDOW", "60")
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_current_user] = _current_user
    submit = AsyncMock(side_effect=HTTPException(status_code=409, detail="business endpoint reached"))

    with patch.object(FeedbackService, "submit", new=submit):
        async with asgi_client(app) as client:
            responses = [await client.post("/api/v1/feedback", json=_valid_feedback_payload()) for _ in range(13)]

    assert [response.status_code for response in responses[:12]] == [409] * 12
    assert responses[-1].status_code == 429
    submit.assert_awaited()
    assert submit.await_count == 12
