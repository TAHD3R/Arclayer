from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict, Field

from src.modules.assets.admin.assets.schema import AdminAssetFolderUpdateRequest
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope


class _Folder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    parent_id: UUID | None
    name: str
    description: str | None = None
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class _FakeQuery:
    def __init__(self, *, exists_result: bool) -> None:
        self._exists_result = exists_result

    def filter(self, **_kwargs):
        return self

    def exclude(self, **_kwargs):
        return self

    async def exists(self) -> bool:
        return self._exists_result


@pytest.mark.asyncio
async def test_update_folder_requires_existing_folder() -> None:
    from src.config import get_settings
    from src.core.exceptions import NotFound

    service = AdminAssetsService(get_settings())
    scope = AssetScope(type="workspace", id=uuid4())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return None

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(NotFound) as exc:
        await service.update_folder(
            scope=scope,
            folder_id=uuid4(),
            payload=AdminAssetFolderUpdateRequest(name="x"),
        )

    assert exc.value.error == "ASSET_FOLDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_folder_rejects_cycle_parent() -> None:
    from src.config import get_settings
    from src.core.exceptions import BadRequest

    workspace_id = uuid4()
    scope = AssetScope(type="workspace", id=workspace_id)
    target_folder_id = uuid4()
    descendant_id = uuid4()

    service = AdminAssetsService(get_settings())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            # Folder exists; parent lookup also succeeds to hit the cycle guard.
            fid = folder_id
            if fid == target_folder_id:
                return _Folder(id=fid, parent_id=None, name="A")
            return _Folder(id=fid, parent_id=None, name="parent")

        async def collect_descendant_folder_ids(self, *, scope, root_folder_id):
            return [root_folder_id, descendant_id]

        def query_folders(self, *, scope):
            return _FakeQuery(exists_result=False)

        async def save_folder_updates(self, folder, *, updates):
            for k, v in updates.items():
                setattr(folder, k, v)
            return folder

    service.repo = FakeRepo()  # type: ignore[assignment]

    payload = AdminAssetFolderUpdateRequest(parent_id=descendant_id)
    with pytest.raises(BadRequest) as exc:
        await service.update_folder(scope=scope, folder_id=target_folder_id, payload=payload)

    assert exc.value.error == "ASSET_FOLDER_PARENT_INVALID"


@pytest.mark.asyncio
async def test_update_folder_rejects_duplicate_name_under_target_parent() -> None:
    from src.config import get_settings
    from src.core.exceptions import Conflict

    workspace_id = uuid4()
    scope = AssetScope(type="workspace", id=workspace_id)
    folder_id = uuid4()

    service = AdminAssetsService(get_settings())

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return _Folder(id=folder_id, parent_id=None, name="A")

        def query_folders(self, *, scope):
            # Simulate "already exists" when checking uniqueness.
            return _FakeQuery(exists_result=True)

        async def save_folder_updates(self, folder, *, updates):
            for k, v in updates.items():
                setattr(folder, k, v)
            return folder

    service.repo = FakeRepo()  # type: ignore[assignment]

    with pytest.raises(Conflict) as exc:
        await service.update_folder(
            scope=scope,
            folder_id=folder_id,
            payload=AdminAssetFolderUpdateRequest(name="dup"),
        )

    assert exc.value.error == "ASSET_FOLDER_EXISTS"


@pytest.mark.asyncio
async def test_update_folder_trims_description_and_allows_clear() -> None:
    from src.config import get_settings

    workspace_id = uuid4()
    scope = AssetScope(type="workspace", id=workspace_id)
    folder_id = uuid4()

    service = AdminAssetsService(get_settings())

    updated: dict[str, object] = {"updates": None}

    class FakeRepo:
        async def get_folder(self, *, scope, folder_id):
            return _Folder(id=folder_id, parent_id=None, name="A", description=None)

        def query_folders(self, *, scope):
            return _FakeQuery(exists_result=False)

        async def save_folder_updates(self, folder, *, updates):
            updated["updates"] = dict(updates)
            for k, v in updates.items():
                setattr(folder, k, v)
            return folder

    service.repo = FakeRepo()  # type: ignore[assignment]

    out = await service.update_folder(
        scope=scope,
        folder_id=folder_id,
        payload=AdminAssetFolderUpdateRequest(description="  hello  "),
    )

    assert out.description == "hello"
    assert isinstance(updated["updates"], dict)
    assert (updated["updates"] or {}).get("description") == "hello"

    out2 = await service.update_folder(
        scope=scope,
        folder_id=folder_id,
        payload=AdminAssetFolderUpdateRequest(description="   "),
    )
    assert out2.description is None
