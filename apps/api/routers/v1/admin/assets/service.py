from __future__ import annotations

import mimetypes
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.i18n import t
from apps.api.http.file_stream import stream_file_response
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.routers.v1.admin.assets.repository import AdminAssetsRepository
from apps.api.routers.v1.admin.assets.schema import (
    AdminAssetDetailOut,
    AdminAssetFolderCreateRequest,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
)


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


class AdminAssetsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = AdminAssetsRepository()

    async def list_assets(
        self, *, org_id: UUID, params: PageParams, filters: AdminAssetListQuery
    ) -> PageData[AdminAssetSummaryOut]:
        folder_ids: list[UUID] | None = None
        if filters.folder_id is not None and bool(filters.include_children):
            folder_ids = await self.repo.collect_descendant_folder_ids(org_id=org_id, root_folder_id=filters.folder_id)
        qs = self.repo.query_assets(org_id=org_id, filters=filters, folder_ids=folder_ids)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetSummaryOut)

    async def list_folders(self, *, org_id: UUID) -> list[AdminAssetFolderOut]:
        rows = await self.repo.query_folders(org_id=org_id)
        return [AdminAssetFolderOut.model_validate(r, from_attributes=True) for r in rows]

    async def list_tags(self, *, org_id: UUID, q: str | None = None) -> list[AdminAssetTagOut]:
        rows = await self.repo.query_tags(org_id=org_id, q=q)
        return [AdminAssetTagOut.model_validate(r, from_attributes=True) for r in rows]

    async def create_tag(self, *, org_id: UUID, payload: AdminAssetTagCreateRequest) -> AdminAssetTagOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(message=_ts("ASSET_TAG_NAME_INVALID", "标签名称不合法"), error="ASSET_TAG_NAME_INVALID")

        exists = await self.repo.get_tag_by_name(org_id=org_id, name=name)
        if exists is not None:
            # Idempotent create: return existing to help UI get the id.
            return AdminAssetTagOut.model_validate(exists, from_attributes=True)

        tag = await self.repo.create_tag(org_id=org_id, name=name)
        return AdminAssetTagOut.model_validate(tag, from_attributes=True)

    async def get_asset_detail(self, *, org_id: UUID, asset_id: UUID) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(org_id=org_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        detail = AdminAssetDetailOut.model_validate(asset, from_attributes=True)
        meta = asset.meta if isinstance(asset.meta, dict) else {}
        desc = meta.get("description") if isinstance(meta, dict) else None
        detail.description = desc if isinstance(desc, str) else None

        tags = []
        for link in getattr(asset, "tag_links", []) or []:
            tag = getattr(link, "tag", None)
            if tag is None:
                continue
            tags.append(AdminAssetTagOut.model_validate(tag, from_attributes=True))
        detail.tags = tags
        return detail

    async def update_asset(
        self, *, org_id: UUID, asset_id: UUID, payload: AdminAssetUpdateRequest
    ) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(org_id=org_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        updates: dict = {}

        if "description" in payload.model_fields_set:
            raw = (payload.description or "").strip()
            desc = raw or None
            meta = asset.meta if isinstance(asset.meta, dict) else {}
            if not isinstance(meta, dict):
                meta = {}
            if desc is None:
                meta.pop("description", None)
            else:
                meta["description"] = desc
            updates["meta"] = meta or None

        if "tag_ids" in payload.model_fields_set:
            ids = payload.tag_ids or []
            # Keep ordering stable and avoid duplicates.
            dedup: list[UUID] = list(dict.fromkeys(ids))
            tags = await self.repo.list_tags_by_ids(org_id=org_id, tag_ids=dedup)
            if len(tags) != len(dedup):
                raise BadRequest(message=_ts("ASSET_TAG_NOT_FOUND", "标签不存在"), error="ASSET_TAG_NOT_FOUND")
            await self.repo.replace_asset_tags(asset_id=asset.id, tag_ids=dedup)

        if updates:
            asset = await self.repo.save_asset_updates(asset, updates=updates)

        # Reload to ensure tag_links/meta reflect latest state.
        return await self.get_asset_detail(org_id=org_id, asset_id=asset.id)

    async def create_folder(self, *, org_id: UUID, payload: AdminAssetFolderCreateRequest) -> AdminAssetFolderOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(
                message=_ts("ASSET_FOLDER_NAME_INVALID", "文件夹名称不合法"), error="ASSET_FOLDER_NAME_INVALID"
            )

        parent_id = payload.parent_id
        if parent_id is not None:
            parent = await self.repo.get_folder(org_id=org_id, folder_id=parent_id)
            if parent is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        exists = await self.repo.query_folders(org_id=org_id).filter(parent_id=parent_id, name=name).exists()
        if exists:
            raise Conflict(message=_ts("ASSET_FOLDER_EXISTS", "文件夹已存在"), error="ASSET_FOLDER_EXISTS")

        folder = await self.repo.create_folder(
            org_id=org_id, name=name, parent_id=parent_id, sort_order=int(payload.sort_order)
        )
        return AdminAssetFolderOut.model_validate(folder, from_attributes=True)

    async def update_folder(
        self, *, org_id: UUID, folder_id: UUID, payload: AdminAssetFolderUpdateRequest
    ) -> AdminAssetFolderOut:
        folder = await self.repo.get_folder(org_id=org_id, folder_id=folder_id)
        if folder is None:
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        updates: dict = {}
        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise BadRequest(
                    message=_ts("ASSET_FOLDER_NAME_INVALID", "文件夹名称不合法"), error="ASSET_FOLDER_NAME_INVALID"
                )
            if name != folder.name:
                exists = (
                    await self.repo.query_folders(org_id=org_id).filter(parent_id=folder.parent_id, name=name).exists()
                )
                if exists:
                    raise Conflict(message=_ts("ASSET_FOLDER_EXISTS", "文件夹已存在"), error="ASSET_FOLDER_EXISTS")
            updates["name"] = name
        if payload.sort_order is not None:
            updates["sort_order"] = int(payload.sort_order)

        if updates:
            folder = await self.repo.save_folder_updates(folder, updates=updates)
        return AdminAssetFolderOut.model_validate(folder, from_attributes=True)

    async def move_asset(self, *, org_id: UUID, asset_id: UUID, payload: AdminAssetMoveRequest) -> AdminAssetSummaryOut:
        asset = await self.repo.get_asset(org_id=org_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        folder_id = payload.folder_id
        if folder_id is not None:
            folder = await self.repo.get_folder(org_id=org_id, folder_id=folder_id)
            if folder is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        asset = await self.repo.save_asset_updates(asset, updates={"folder_id": folder_id})
        return AdminAssetSummaryOut.model_validate(asset, from_attributes=True)

    async def stream_asset_content(self, *, org_id: UUID, asset_id: UUID, range_header: str | None):
        asset = await self.repo.get_asset(org_id=org_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        # Phase 1: local provider only.
        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, asset.object_key)
        if not path.is_file():
            raise NotFound(message=_ts("ASSET_FILE_NOT_FOUND", "文件不存在"), error="ASSET_FILE_NOT_FOUND")

        media_type = asset.mime
        if not media_type:
            media_type, _enc = mimetypes.guess_type(f"file.{asset.ext or 'bin'}")
        media_type = media_type or "application/octet-stream"

        headers: dict[str, str] = {
            # Admin preview is permission-protected; keep caching conservative.
            "Cache-Control": "private, max-age=60",
        }
        if asset.checksum_sha256:
            headers["ETag"] = f'"{asset.checksum_sha256}"'

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )
