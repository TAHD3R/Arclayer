from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.assets.asset import AssetPurpose, AssetRecord, AssetVisibility
from src.models.assets.asset_folder import AssetFolderRecord
from src.modules.assets.admin.assets import service as assets_service_module
from src.modules.assets.admin.assets.schema import AdminAssetMoveRequest, AdminAssetUpdateRequest
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope

pytestmark = pytest.mark.integration


async def _create_asset(*, organization_id: UUID, folder_id: UUID | None = None) -> AssetRecord:
    return await AssetRecord.create(
        organization_id=organization_id,
        folder_id=folder_id,
        purpose=AssetPurpose.LIBRARY,
        visibility=AssetVisibility.PUBLIC,
        indexable=False,
        title="Audit asset",
        slug="audit-asset",
        original_filename="audit.png",
        mime="image/png",
        ext="png",
        size_bytes=128,
        checksum_sha256="0" * 64,
        storage_provider="local",
        object_key=f"organizations/{organization_id}/assets/{uuid4()}.png",
        meta=None,
    )


async def test_asset_metadata_move_delete_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = AdminAssetsService(settings)
    org_id = uuid4()
    actor_user_id = uuid4()
    scope = AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=org_id)

    folder = await AssetFolderRecord.create(organization_id=org_id, name="Target")
    asset = await _create_asset(organization_id=org_id)

    updated = await service.update_asset(
        scope=scope,
        asset_id=asset.id,
        payload=AdminAssetUpdateRequest(description="safe token secret password", alt_name="Display alt"),
        actor_user_id=actor_user_id,
    )
    metadata_event = await AuditEvent.filter(
        event_name="asset.metadata.updated",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset",
        entity_id=asset.id,
    ).first()
    assert updated.description == "safe token secret password"
    assert metadata_event is not None
    assert metadata_event.properties["organization_id"] == str(org_id)
    assert metadata_event.properties["scope_type"] == ASSET_SCOPE_ORGANIZATION
    assert metadata_event.properties["updated_fields"] == ["meta"]
    assert "token" not in metadata_event.properties
    assert "secret" not in metadata_event.properties
    assert "password" not in metadata_event.properties

    original_write_required_activity_event = assets_service_module.write_required_activity_event

    async def _failing_metadata_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.metadata.updated":
            raise RuntimeError("forced activity write failure: asset.metadata.updated")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.").count()
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_metadata_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.update_asset(
            scope=scope,
            asset_id=asset.id,
            payload=AdminAssetUpdateRequest(description="rolled back"),
            actor_user_id=actor_user_id,
        )
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    refetched = await AssetRecord.get(id=asset.id)
    assert await AuditEvent.filter(event_name__startswith="asset.").count() == event_count_before
    assert refetched.meta == {"description": "safe token secret password", "alt_name": "Display alt"}

    moved = await service.move_asset(
        scope=scope,
        asset_id=asset.id,
        payload=AdminAssetMoveRequest(folder_id=folder.id),
        actor_user_id=actor_user_id,
    )
    moved_event = await AuditEvent.filter(
        event_name="asset.moved",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset",
        entity_id=asset.id,
    ).first()
    assert moved.folder_id == folder.id
    assert moved_event is not None
    assert moved_event.properties["folder_id"] == str(folder.id)

    async def _failing_move_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.moved":
            raise RuntimeError("forced activity write failure: asset.moved")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.").count()
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_move_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.move_asset(
            scope=scope,
            asset_id=asset.id,
            payload=AdminAssetMoveRequest(folder_id=None),
            actor_user_id=actor_user_id,
        )
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    refetched = await AssetRecord.get(id=asset.id)
    refetched_folder_id = getattr(refetched, "folder_id")  # noqa: B009 - Tortoise exposes dynamic FK id fields.
    assert await AuditEvent.filter(event_name__startswith="asset.").count() == event_count_before
    assert refetched_folder_id == folder.id

    async def _failing_delete_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "asset.deleted":
            raise RuntimeError("forced activity write failure: asset.deleted")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="asset.").count()
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        _failing_delete_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.delete_asset(scope=scope, asset_id=asset.id, actor_user_id=actor_user_id)
    monkeypatch.setattr(
        "src.modules.assets.admin.assets.service.write_required_activity_event",
        original_write_required_activity_event,
    )

    refetched = await AssetRecord.get(id=asset.id)
    assert await AuditEvent.filter(event_name__startswith="asset.").count() == event_count_before
    assert refetched.deleted_at is None

    deleted = await service.delete_asset(scope=scope, asset_id=asset.id, actor_user_id=actor_user_id)
    deleted_event = await AuditEvent.filter(
        event_name="asset.deleted",
        organization_id=org_id,
        actor_user_id=actor_user_id,
        entity_type="asset",
        entity_id=asset.id,
    ).first()
    assert deleted.id == asset.id
    assert deleted_event is not None
    assert deleted_event.properties["deleted_at"] is not None
