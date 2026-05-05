from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.assets.asset_folder import AssetFolderRecord
from src.modules.assets.admin.assets import service as assets_service_module
from src.modules.assets.admin.assets.schema import (
    AdminAssetFolderCreateRequest,
    AdminAssetFolderUpdateRequest,
)
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope

pytestmark = pytest.mark.integration


async def test_asset_folder_activity_readback_and_create_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = AdminAssetsService(settings)
    org_id = uuid4()
    actor_user_id = uuid4()
    scope = AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=org_id)

    folder = await service.create_folder(
        scope=scope,
        payload=AdminAssetFolderCreateRequest(name="Activity", description="visible", sort_order=2),
        actor_user_id=actor_user_id,
    )
    created_event = await AuditEvent.filter(
        event_name="asset.folder.created",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset_folder",
        entity_id=folder.id,
    ).first()
    assert created_event is not None
    assert created_event.properties["name"] == "Activity"
    assert created_event.properties["organization_id"] == str(org_id)
    assert created_event.properties["scope_type"] == ASSET_SCOPE_ORGANIZATION

    updated = await service.update_folder(
        scope=scope,
        folder_id=folder.id,
        payload=AdminAssetFolderUpdateRequest(name="Activity Updated"),
        actor_user_id=actor_user_id,
    )
    updated_event = await AuditEvent.filter(
        event_name="asset.folder.updated",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset_folder",
        entity_id=folder.id,
    ).first()
    assert updated_event is not None
    assert updated.name == "Activity Updated"
    assert updated_event.properties["updated_fields"] == ["name"]

    original_write_required_activity_event = assets_service_module.write_required_activity_event

    async def _failing_update_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.folder.updated":
            raise RuntimeError("forced activity write failure: asset.folder.updated")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.folder.").count()
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_update_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.update_folder(
            scope=scope,
            folder_id=folder.id,
            payload=AdminAssetFolderUpdateRequest(name="Rollback Update"),
            actor_user_id=actor_user_id,
        )
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    refetched = await AssetFolderRecord.get(id=folder.id)
    assert await AuditEvent.filter(event_name__startswith="asset.folder.").count() == event_count_before
    assert refetched.name == "Activity Updated"

    async def _failing_delete_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.folder.deleted":
            raise RuntimeError("forced activity write failure: asset.folder.deleted")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.folder.").count()
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_delete_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.delete_folder(scope=scope, folder_id=folder.id, actor_user_id=actor_user_id)
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    assert await AuditEvent.filter(event_name__startswith="asset.folder.").count() == event_count_before
    assert await AssetFolderRecord.filter(id=folder.id).exists()

    deleted = await service.delete_folder(scope=scope, folder_id=folder.id, actor_user_id=actor_user_id)
    deleted_event = await AuditEvent.filter(
        event_name="asset.folder.deleted",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset_folder",
        entity_id=folder.id,
    ).first()
    assert deleted.id == folder.id
    assert deleted_event is not None
    assert not await AssetFolderRecord.filter(id=folder.id).exists()

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.folder.").count()

    async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.folder.created":
            raise RuntimeError("forced activity write failure: asset.folder.created")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_write_required_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.create_folder(
            scope=scope,
            payload=AdminAssetFolderCreateRequest(name="Rollback", description=None, sort_order=0),
            actor_user_id=actor_user_id,
        )
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    assert await AuditEvent.filter(event_name__startswith="asset.folder.").count() == event_count_before
    assert not await AssetFolderRecord.filter(organization_id=org_id, name="Rollback").exists()
