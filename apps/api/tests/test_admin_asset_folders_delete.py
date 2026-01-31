from __future__ import annotations

from uuid import uuid4

import pytest

from apps.api.routers.v1.admin.assets.service import AdminAssetsService


def test_admin_assets_router_exposes_folder_delete_endpoint() -> None:
    from fastapi.routing import APIRoute

    from apps.api.routers.v1.admin.assets.router import router

    routes = [r for r in router.routes if isinstance(r, APIRoute)]
    paths = {(r.path, tuple(sorted(r.methods or []))) for r in routes}

    assert ("/asset-folders/{folder_id}", ("DELETE",)) in paths


@pytest.mark.asyncio
async def test_delete_folder_requires_existing_folder() -> None:
    from apps.api.config import get_settings
    from apps.api.core.exceptions import NotFound

    settings = get_settings()
    service = AdminAssetsService(settings)

    class FakeRepo:
        async def get_folder(self, *, org_id, folder_id):
            return None

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(NotFound) as exc:
        await service.delete_folder(org_id=uuid4(), folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_folder_rejects_non_empty_folder_children() -> None:
    from apps.api.config import get_settings
    from apps.api.core.exceptions import Conflict

    settings = get_settings()
    service = AdminAssetsService(settings)

    class FakeRepo:
        async def get_folder(self, *, org_id, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, org_id, folder_id):
            return True

        async def folder_has_assets(self, *, org_id, folder_id):
            return False

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(Conflict) as exc:
        await service.delete_folder(org_id=uuid4(), folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_EMPTY"


@pytest.mark.asyncio
async def test_delete_folder_rejects_non_empty_folder_assets() -> None:
    from apps.api.config import get_settings
    from apps.api.core.exceptions import Conflict

    settings = get_settings()
    service = AdminAssetsService(settings)

    class FakeRepo:
        async def get_folder(self, *, org_id, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, org_id, folder_id):
            return False

        async def folder_has_assets(self, *, org_id, folder_id):
            return True

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(Conflict) as exc:
        await service.delete_folder(org_id=uuid4(), folder_id=uuid4())

    assert exc.value.error == "ASSET_FOLDER_NOT_EMPTY"


@pytest.mark.asyncio
async def test_delete_folder_deletes_when_empty() -> None:
    from apps.api.config import get_settings

    settings = get_settings()
    service = AdminAssetsService(settings)

    deleted: dict[str, object] = {"called": False, "folder_id": None}

    folder_id = uuid4()

    class FakeRepo:
        async def get_folder(self, *, org_id, folder_id):
            return {"id": folder_id}

        async def folder_has_children(self, *, org_id, folder_id):
            return False

        async def folder_has_assets(self, *, org_id, folder_id):
            return False

        async def delete_folder(self, *, org_id, folder_id):
            deleted["called"] = True
            deleted["folder_id"] = folder_id

    service.repo = FakeRepo()  # type: ignore[assignment]

    out = await service.delete_folder(org_id=uuid4(), folder_id=folder_id)

    assert deleted["called"] is True
    assert deleted["folder_id"] == folder_id
    assert out.id == folder_id
