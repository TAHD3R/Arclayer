from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.events import Event
from src.core.services import (
    BaseService,
    RequiredDomainEventPublishFailed,
    RequiredEventPublisherMissing,
    ServiceActorContext,
)

_BASE_SERVICE_MODULE = BaseService.__module__


class _FakePublisher:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        if self.fail:
            raise RuntimeError("publish failed")
        self.events.append(event)


class _FakeTxService(BaseService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[object]:
        if conn is not None:
            yield conn
            return
        yield object()


@pytest.mark.asyncio
async def test_tx_reuses_existing_connection() -> None:
    service = _FakeTxService(Settings())
    conn = object()

    async with service.tx(conn=conn) as tx_conn:
        assert tx_conn is conn


@pytest.mark.asyncio
async def test_publish_domain_event_builds_expected_envelope() -> None:
    publisher = _FakePublisher()
    service = BaseService(Settings(), event_publisher=publisher)
    actor_id = uuid4()

    context = ServiceActorContext(actor_user_id=actor_id, trace_id="trace-123", source="system-job")
    event = await service.publish_domain_event(
        name="workspace.member.invited",
        payload={"workspace_id": "ws_1"},
        actor_context=context,
    )

    assert event.name == "workspace.member.invited"
    assert event.payload == {"workspace_id": "ws_1"}
    assert event.source == "system-job"
    assert event.trace_id == "trace-123"
    assert event.actor_user_id == str(actor_id)
    assert publisher.events[0].name == "workspace.member.invited"


@pytest.mark.asyncio
async def test_publish_domain_event_requires_publisher_for_required_events() -> None:
    service = BaseService(Settings(), event_publisher=None)

    with pytest.raises(RequiredEventPublisherMissing):
        await service.publish_domain_event(name="auth.login.succeeded", payload={"organization_id": "org_1"})


@pytest.mark.asyncio
async def test_publish_optional_domain_event_skips_when_publisher_missing() -> None:
    service = BaseService(Settings(), event_publisher=None)

    event = await service.publish_optional_domain_event(
        name="observability.metric",
        payload={"name": "requests_total"},
    )

    assert event.name == "observability.metric"


@pytest.mark.asyncio
async def test_required_domain_event_publish_failure_surfaces() -> None:
    service = BaseService(Settings(), event_publisher=_FakePublisher(fail=True))

    with pytest.raises(RequiredDomainEventPublishFailed):
        await service.publish_domain_event(name="workspace.member.invited", payload={"workspace_id": "ws_1"})


@pytest.mark.asyncio
async def test_resolve_actor_context_prefers_explicit_override(monkeypatch: pytest.MonkeyPatch) -> None:
    service = BaseService(Settings())

    monkeypatch.setattr(
        f"{_BASE_SERVICE_MODULE}.get_contextvars",
        lambda: {
            "user_id": str(uuid4()),
            "organization_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "project_id": str(uuid4()),
            "tenant_runtime_id": str(uuid4()),
            "tenant_site_id": str(uuid4()),
            "trace_id": "trace-from-context",
            "source": "api",
        },
    )
    monkeypatch.setattr(f"{_BASE_SERVICE_MODULE}.correlation_id", SimpleNamespace(get=lambda _=None: None))

    actor_override = uuid4()
    org_override = uuid4()
    context = service.resolve_actor_context(actor_user_id=actor_override, organization_id=org_override, source="job")

    assert context.actor_user_id == actor_override
    assert context.organization_id == org_override
    assert context.source == "job"
    assert context.trace_id == "trace-from-context"
