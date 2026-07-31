from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.models.analytics.audit_event import AuditEvent
from src.models.platform_saved_views import PlatformSavedView
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_saved_views.schema import (
    PlatformSavedViewDraft,
    PlatformSavedViewFilter,
    PlatformSavedViewOrdering,
)
from src.modules.platform_saved_views.service import PlatformSavedViewsService


def _actor(*, actor_id: UUID | None = None, is_instance_owner: bool = True) -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=actor_id or uuid4(),
        session_id=uuid4(),
        operator_id=None if is_instance_owner else uuid4(),
        is_instance_owner=is_instance_owner,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )


def _draft(**overrides: object) -> PlatformSavedViewDraft:
    values: dict[str, object] = {
        "name": "Needs attention",
        "filter_schema_revision": "1",
        "column_schema_revision": "1",
        "filters": (PlatformSavedViewFilter(code="source_lifecycle", value="unresolved"),),
        "ordering": PlatformSavedViewOrdering(code="completed_at", direction="asc"),
        "visible_columns": ("severity", "priority"),
        "column_order": ("priority", "severity"),
        "density": "comfortable",
    }
    values.update(overrides)
    return PlatformSavedViewDraft(**values)


def _service() -> PlatformSavedViewsService:
    return PlatformSavedViewsService(settings=get_settings(), identity_repository=PlatformIdentityRepository())


@pytest.mark.asyncio
async def test_create_update_delete_are_actor_private_revisioned_and_audited(db_schema) -> None:
    service = _service()
    actor = _actor()
    created = await service.create(actor=actor, capability_id="operations.signals", draft=_draft())

    assert created.revision == 1
    assert created.column_order == ("priority", "severity")
    assert await AuditEvent.filter(event_name="platform.saved_view.created", entity_id=created.id).exists()

    updated = await service.update(
        actor=actor,
        view_id=created.id,
        expected_revision=1,
        draft=_draft(name="Updated view", density="compact"),
    )
    assert updated.name == "Updated view"
    assert updated.revision == 2
    assert await AuditEvent.filter(event_name="platform.saved_view.updated", entity_id=created.id).exists()

    await service.delete(actor=actor, view_id=created.id, expected_revision=2)
    assert await PlatformSavedView.filter(id=created.id).exists() is False
    assert await AuditEvent.filter(event_name="platform.saved_view.deleted", entity_id=created.id).exists()


@pytest.mark.asyncio
async def test_actor_cannot_read_or_mutate_another_actors_saved_view(db_schema) -> None:
    service = _service()
    owner = _actor()
    other_actor = _actor()
    created = await service.create(actor=owner, capability_id="operations.signals", draft=_draft())

    with pytest.raises(NotFound, match="PLATFORM_SAVED_VIEW_NOT_FOUND"):
        await service.get(actor=other_actor, view_id=created.id)
    with pytest.raises(NotFound, match="PLATFORM_SAVED_VIEW_NOT_FOUND"):
        await service.update(actor=other_actor, view_id=created.id, expected_revision=1, draft=_draft())
    with pytest.raises(NotFound, match="PLATFORM_SAVED_VIEW_NOT_FOUND"):
        await service.delete(actor=other_actor, view_id=created.id, expected_revision=1)


@pytest.mark.asyncio
async def test_rejects_unknown_capability_schema_filter_and_column_contracts(db_schema) -> None:
    service = _service()
    actor = _actor()

    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_CAPABILITY_INVALID"):
        await service.create(actor=actor, capability_id="monitoring.unknown", draft=_draft())
    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_FILTER_SCHEMA_REVISION_INVALID"):
        await service.create(actor=actor, capability_id="operations.signals", draft=_draft(filter_schema_revision="2"))
    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_FILTER_INVALID"):
        await service.create(
            actor=actor,
            capability_id="operations.signals",
            draft=_draft(filters=(PlatformSavedViewFilter(code="raw_sql", value="select 1"),)),
        )
    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_COLUMN_INVALID"):
        await service.create(
            actor=actor,
            capability_id="operations.signals",
            draft=_draft(visible_columns=("severity", "secret"), column_order=("severity", "secret")),
        )

    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_ORDERING_INVALID"):
        await service.create(
            actor=actor,
            capability_id="tenant.workspaces",
            draft=_draft(
                filters=(),
                ordering=PlatformSavedViewOrdering(code="last_activity_at", direction="desc"),
                visible_columns=("name",),
                column_order=("name",),
            ),
        )


@pytest.mark.asyncio
async def test_rejects_stale_revision_and_currently_unauthorized_capability(db_schema) -> None:
    service = _service()
    actor = _actor()
    created = await service.create(actor=actor, capability_id="operations.signals", draft=_draft())

    with pytest.raises(Conflict, match="PLATFORM_SAVED_VIEW_REVISION_CONFLICT"):
        await service.update(actor=actor, view_id=created.id, expected_revision=2, draft=_draft())

    with pytest.raises(Forbidden, match="PLATFORM_SAVED_VIEW_CAPABILITY_UNAUTHORIZED"):
        await service.update(
            actor=_actor(actor_id=actor.actor_id, is_instance_owner=False),
            view_id=created.id,
            expected_revision=1,
            draft=_draft(),
        )


@pytest.mark.asyncio
async def test_reads_omit_stale_schema_and_permission_lost_conditions_without_rewriting_storage(db_schema) -> None:
    service = _service()
    actor = _actor()
    created = await service.create(actor=actor, capability_id="operations.signals", draft=_draft())
    await PlatformSavedView.filter(id=created.id).update(filter_schema_revision="0")

    stale = await service.get(actor=actor, view_id=created.id)
    assert stale.applicable is False
    assert stale.effective is not None
    assert stale.effective.filters == ()
    assert stale.omissions[0].kind == "filter_schema"
    assert (await PlatformSavedView.get(id=created.id)).filter_schema_revision == "0"

    permission_lost = await service.list(
        actor=_actor(actor_id=actor.actor_id, is_instance_owner=False), capability_id="operations.signals"
    )
    assert permission_lost[0].applicable is False
    assert permission_lost[0].effective is None
    assert permission_lost[0].omissions[0].reason == "unauthorized"
