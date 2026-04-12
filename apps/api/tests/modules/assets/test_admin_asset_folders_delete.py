from __future__ import annotations

from uuid import uuid4

import pytest

from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope


def test_admin_assets_router_exposes_folder_delete_endpoint() -> None:
    from fastapi.routing import APIRoute

    from src.modules.assets.admin.assets.router import router

    routes = [r for r in router.routes if isinstance(r, APIRoute)]
    paths = {(r.path, tuple(sorted(r.methods or []))) for r in routes}

    assert ("/workspaces/{workspace_id}/asset-folders/{folder_id}", ("DELETE",)) in paths
    assert ("/workspaces/{workspace_id}/asset-folders/{folder_id}/delete", ("POST",)) in paths


@pytest.mark.asyncio
async def test_delete_folder_requires_existing_folder() -> None:
    from src.config import get_settings
    from src.core.exceptions import NotFound

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return None

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(NotFound) as exc:
        await service.delete_folder(scope=scope, folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_folder_rejects_non_empty_folder_children() -> None:
    from src.config import get_settings
    from src.core.exceptions import Conflict

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, scope, folder_id):
            return True

        async def folder_has_assets(self, *, scope, folder_id):
            return False

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(Conflict) as exc:
        await service.delete_folder(scope=scope, folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_EMPTY"


@pytest.mark.asyncio
async def test_delete_folder_rejects_non_empty_folder_assets() -> None:
    from src.config import get_settings
    from src.core.exceptions import Conflict

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, scope, folder_id):
            return False

        async def folder_has_assets(self, *, scope, folder_id):
            return True

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(Conflict) as exc:
        await service.delete_folder(scope=scope, folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_EMPTY"


@pytest.mark.asyncio
async def test_delete_folder_deletes_when_empty() -> None:
    from src.config import get_settings

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())

    deleted: dict[str, object] = {"called": False, "folder_id": None}

    folder_id = uuid4()

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, scope, folder_id):
            return False

        async def folder_has_assets(self, *, scope, folder_id):
            return False

        async def delete_folder(self, *, scope, folder_id):
            deleted["called"] = True
            deleted["folder_id"] = folder_id

    service.repo = FakeRepo()  # type: ignore[assignment]

    out = await service.delete_folder(scope=scope, folder_id=folder_id)

    assert deleted["called"] is True
    assert deleted["folder_id"] == folder_id
    assert out.id == folder_id


@pytest.mark.asyncio
async def test_delete_folder_can_move_contents_to_root_before_delete() -> None:
    from src.config import get_settings
    from src.modules.assets.admin.assets.schema import AdminAssetFolderDeleteRequest

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())
    folder_id = uuid4()

    moved: dict[str, object] = {"children": None, "assets": None, "deleted": False}

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return {"id": folder_id}

        async def move_child_folders(self, *, scope, from_folder_id, to_parent_id, updated_at):
            moved["children"] = (from_folder_id, to_parent_id)
            return 2

        async def move_assets_in_folder(self, *, scope, from_folder_id, to_folder_id, updated_at):
            moved["assets"] = (from_folder_id, to_folder_id)
            return 3

        async def delete_folder(self, *, scope, folder_id):
            moved["deleted"] = True

    service.repo = FakeRepo()  # type: ignore[assignment]

    out = await service.delete_folder(
        scope=scope,
        folder_id=folder_id,
        payload=AdminAssetFolderDeleteRequest(destination_folder_id=None),
    )

    assert moved["children"] == (folder_id, None)
    assert moved["assets"] == (folder_id, None)
    assert moved["deleted"] is True
    assert out.id == folder_id


@pytest.mark.asyncio
async def test_delete_folder_rejects_descendant_destination() -> None:
    from src.config import get_settings
    from src.core.exceptions import BadRequest
    from src.modules.assets.admin.assets.schema import AdminAssetFolderDeleteRequest

    settings = get_settings()
    service = AdminAssetsService(settings)
    scope = AssetScope(type="workspace", id=uuid4())
    folder_id = uuid4()
    child_id = uuid4()

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return {"id": folder_id}

        async def collect_descendant_folder_ids(self, *, scope, root_folder_id):
            return [folder_id, child_id]

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(BadRequest) as exc:
        await service.delete_folder(
            scope=scope,
            folder_id=folder_id,
            payload=AdminAssetFolderDeleteRequest(destination_folder_id=child_id),
        )

    assert exc.value.error == "ASSET_FOLDER_PARENT_INVALID"
