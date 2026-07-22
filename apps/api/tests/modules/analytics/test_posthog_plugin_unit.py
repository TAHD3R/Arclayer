from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from src.core.connectors import ConnectorKind, ConnectorTrustLevel
from src.core.events import Event, EventBus
from src.core.exceptions import ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.core.runtime_init import close_domain_runtime, init_analytics_connector_runtime


async def _registration(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("POSTHOG__ENABLED", "true")
    monkeypatch.setenv("POSTHOG__PROJECT_API_KEY", "phc_test")
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-posthog")
    await manager.register_all(app=None)
    registration = manager.registry.connectors.resolve("analytics.posthog")
    assert registration is not None
    return registration


@pytest.mark.asyncio
async def test_posthog_plugin_registers_official_analytics_connector(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registration = await _registration(monkeypatch)

    assert registration.extension == "arclayer-posthog"
    assert registration.definition.kind is ConnectorKind.ANALYTICS
    assert registration.definition.trust_level is ConnectorTrustLevel.OFFICIAL
    assert registration.definition.capabilities == (
        "capture",
        "identify_by_actor",
        "group_properties",
    )
    connector = registration.factory()
    assert connector.enabled is True
    await connector.close()


@pytest.mark.asyncio
async def test_posthog_connector_captures_sanitized_domain_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registration = await _registration(monkeypatch)
    connector = registration.factory()
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": 1})

    connector._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector._owns_client = True
    event = Event(
        name="project.created",
        actor_user_id="user-1",
        trace_id="trace-1",
        source="projects",
        occurred_at=datetime(2026, 7, 22, tzinfo=UTC),
        payload={
            "projectId": "project-1",
            "workspaceId": "workspace-1",
            "accessToken": "must-not-leave-process",
        },
    )

    await connector.capture_event(event)
    await connector.close()

    assert len(requests) == 1
    body = json.loads(requests[0].content)
    assert body["api_key"] == "phc_test"
    assert body["event"] == "project.created"
    assert body["properties"]["distinct_id"] == "user-1"
    assert body["properties"]["$groups"] == {
        "workspace": "workspace-1",
        "project": "project-1",
    }
    assert "accessToken" not in body["properties"]


@pytest.mark.asyncio
async def test_posthog_connector_exposes_invalid_delivery_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registration = await _registration(monkeypatch)
    connector = registration.factory()

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": 0})

    connector._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector._owns_client = True

    with pytest.raises(ServiceUnavailable, match="POSTHOG_INVALID_RESPONSE"):
        await connector.capture_event(Event(name="project.failed"))
    await connector.close()


@pytest.mark.asyncio
async def test_posthog_plugin_requires_project_key_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTHOG__ENABLED", "true")
    monkeypatch.delenv("POSTHOG__PROJECT_API_KEY", raising=False)
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-posthog")
    await manager.register_all(app=None)
    registration = manager.registry.connectors.resolve("analytics.posthog")
    assert registration is not None

    with pytest.raises(ValidationError, match="POSTHOG__PROJECT_API_KEY"):
        registration.factory()


@pytest.mark.asyncio
async def test_posthog_runtime_resolves_registered_connector_and_closes_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTHOG__ENABLED", "true")
    monkeypatch.setenv("POSTHOG__PROJECT_API_KEY", "phc_runtime")
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-posthog")
    await manager.register_all(app=None)
    app = FastAPI()
    app.state.extension_manager = manager
    event_bus = EventBus()

    await init_analytics_connector_runtime(app, event_bus=event_bus)
    runtime = app.state.analytics_connector_runtime
    connector = runtime._connectors[0]
    await close_domain_runtime(app, event_bus=event_bus)

    assert len(runtime._connectors) == 0
    assert connector._client.is_closed is True
