from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from apps.api.src.modules.assets.admin.assets.service import AdminAssetsService


def test_admin_assets_service_exposes_bulk_ops() -> None:
    # TDD guard: make sure we add explicit service APIs for bulk operations.
    assert hasattr(AdminAssetsService, "bulk_move_assets")
    assert hasattr(AdminAssetsService, "bulk_delete_assets")
    assert hasattr(AdminAssetsService, "bulk_update_assets")


def test_admin_assets_router_exposes_bulk_endpoints() -> None:
    # We test the APIRouter directly to avoid requiring integration DB/auth here.
    # router.routes is typed as BaseRoute[], but only APIRoute exposes `.path` in the stubs.
    from fastapi.routing import APIRoute

    from apps.api.src.modules.assets.admin.assets.router import router

    paths = {r.path for r in router.routes if isinstance(r, APIRoute)}

    assert "/workspaces/{workspace_id}/assets/bulk/move" in paths
    assert "/workspaces/{workspace_id}/assets/bulk/delete" in paths
    assert "/workspaces/{workspace_id}/assets/bulk/update" in paths


@pytest.mark.asyncio
async def test_bulk_move_assets_validates_folder_exists(monkeypatch) -> None:
    # Behavior: folder_id provided but folder does not exist => NotFound.
    from apps.api.src.config import get_settings
    from apps.api.src.core.exceptions import NotFound
    from apps.api.src.modules.assets.admin.assets.schema import AdminAssetBulkMoveRequest

    settings = get_settings()
    service = AdminAssetsService(settings)

    class FakeRepo:
        async def get_folder(self, *, workspace_id, folder_id):
            return None

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(NotFound) as exc:
        await service.bulk_move_assets(  # type: ignore[attr-defined]
            workspace_id=uuid4(),
            payload=AdminAssetBulkMoveRequest(asset_ids=[uuid4()], folder_id=uuid4()),
        )

    assert exc.value.error == "ASSET_FOLDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_bulk_delete_assets_marks_assets_deleted(monkeypatch) -> None:
    # Behavior: bulk delete should call repository layer once and return deleted ids/count.
    from apps.api.src.config import get_settings
    from apps.api.src.modules.assets.admin.assets.schema import AdminAssetBulkDeleteRequest

    settings = get_settings()
    service = AdminAssetsService(settings)

    deleted = {"count": 0, "ids": []}

    class FakeRepo:
        async def bulk_soft_delete_assets(self, *, workspace_id, asset_ids, deleted_at, updated_at):
            deleted["count"] = len(asset_ids)
            deleted["ids"] = list(asset_ids)
            return len(asset_ids)

        async def get_assets_by_ids(self, *, workspace_id, asset_ids):
            # Pretend all exist.
            return [{"id": x} for x in asset_ids]

    service.repo = FakeRepo()  # type: ignore[assignment]

    ids = [uuid4(), uuid4()]
    out = await service.bulk_delete_assets(  # type: ignore[attr-defined]
        workspace_id=uuid4(),
        payload=AdminAssetBulkDeleteRequest(asset_ids=ids),
    )

    assert out.deleted_count == 2
    assert set(out.deleted_asset_ids) == set(ids)


@pytest.mark.asyncio
async def test_bulk_update_assets_requires_fields(monkeypatch) -> None:
    # Behavior: must provide at least one of visibility/purpose.
    from apps.api.src.config import get_settings
    from apps.api.src.core.exceptions import BadRequest
    from apps.api.src.modules.assets.admin.assets.schema import AdminAssetBulkUpdateRequest

    settings = get_settings()
    service = AdminAssetsService(settings)

    class FakeRepo:
        async def get_assets_by_ids(self, *, workspace_id, asset_ids):
            return [{"id": x} for x in asset_ids]

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(BadRequest) as exc:
        await service.bulk_update_assets(  # type: ignore[attr-defined]
            workspace_id=uuid4(),
            payload=AdminAssetBulkUpdateRequest(asset_ids=[uuid4()]),
        )

    assert exc.value.error == "ASSET_BULK_UPDATE_INVALID"


@pytest.mark.asyncio
async def test_bulk_update_assets_updates_repo(monkeypatch) -> None:
    # Behavior: bulk update should call repository once and return updated ids/count.
    from apps.api.src.config import get_settings
    from apps.api.src.modules.assets.admin.assets.schema import AdminAssetBulkUpdateRequest
    from apps.api.src.modules.assets.models.asset import AssetVisibility

    settings = get_settings()
    service = AdminAssetsService(settings)

    called_count = 0
    called_ids: list[UUID] = []
    called_updates: dict[str, object] = {}

    class FakeRepo:
        async def bulk_update_assets_fields(self, *, workspace_id, asset_ids, updates, updated_at):
            nonlocal called_count, called_ids, called_updates
            called_count = len(asset_ids)
            called_ids = list(asset_ids)
            called_updates = dict(updates)
            return len(asset_ids)

        async def get_assets_by_ids(self, *, workspace_id, asset_ids):
            return [{"id": x} for x in asset_ids]

    service.repo = FakeRepo()  # type: ignore[assignment]

    ids = [uuid4(), uuid4(), uuid4()]
    out = await service.bulk_update_assets(  # type: ignore[attr-defined]
        workspace_id=uuid4(),
        payload=AdminAssetBulkUpdateRequest(asset_ids=ids, visibility=AssetVisibility.PRIVATE),
    )

    assert out.updated_count == 3
    assert set(out.updated_asset_ids) == set(ids)
    assert called_count == 3
    assert set(called_ids) == set(ids)
    assert called_updates == {"visibility": AssetVisibility.PRIVATE, "indexable": False}
