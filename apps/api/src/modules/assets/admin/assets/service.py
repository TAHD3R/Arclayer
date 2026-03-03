from __future__ import annotations

import mimetypes
from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.src.core.http.file_stream import stream_file_response
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.src.core.i18n import t
from apps.api.src.infra.storage.factory import build_storage_provider_for
from apps.api.src.infra.storage.local import safe_object_key_to_path
from apps.api.src.infra.storage.s3 import S3StorageProvider
from apps.api.src.infra.storage.s3_stream import stream_s3_object
from apps.api.src.models.organization.user import User
from apps.api.src.modules.assets.admin.assets.repository import AdminAssetsRepository
from apps.api.src.modules.assets.admin.assets.schema import (
    AdminAssetBulkDeleteOut,
    AdminAssetBulkDeleteRequest,
    AdminAssetBulkMoveOut,
    AdminAssetBulkMoveRequest,
    AdminAssetBulkUpdateOut,
    AdminAssetBulkUpdateRequest,
    AdminAssetDeleteOut,
    AdminAssetDetailOut,
    AdminAssetFolderCreateRequest,
    AdminAssetFolderDeleteOut,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
)
from apps.api.src.settings.runtime import get_effective_settings


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


class AdminAssetsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = AdminAssetsRepository()

    @staticmethod
    def _collect_thumbnail_object_keys(variants: object) -> list[str]:
        out: list[str] = []
        if not isinstance(variants, dict):
            return out
        thumbs = variants.get("thumbnails")
        if not isinstance(thumbs, list):
            return out
        for item in thumbs:
            if not isinstance(item, dict):
                continue
            k = str(item.get("object_key") or "").strip()
            if not k:
                continue
            out.append(k)
        # Keep ordering stable and avoid duplicates.
        return list(dict.fromkeys(out))

    def _build_public_direct_url(self, *, base_url: str | None, object_key: str | None) -> str | None:
        b = (base_url or "").strip().rstrip("/")
        k = (object_key or "").strip().lstrip("/")
        if not b or not k:
            return None
        return f"{b}/{k}"

    def _can_direct_deliver(self, *, effective: Settings, storage_bucket: str | None) -> bool:
        mode = str(getattr(effective.storage, "public_delivery_mode", "auto") or "auto").strip().lower()
        if mode == "presign":
            return False
        base = (effective.storage.public_base_url or "").strip()
        if not base:
            return False

        public_bucket = (effective.storage.s3_public_bucket or "").strip() or None
        if not public_bucket:
            # Safety default:
            # When using S3-compatible storage, we only direct-deliver when a dedicated public bucket
            # is configured, otherwise it is too easy to accidentally redirect to a private bucket URL.
            return False
        b = (storage_bucket or "").strip() or None
        return b == public_bucket

    async def _sync_s3_bucket_for_visibility(
        self,
        *,
        effective: Settings,
        provider: S3StorageProvider,
        asset,
        target_visibility: str,
    ) -> str | None:
        """
        Keep S3 object placement consistent with our dual-bucket strategy.

        Rules:
        - If s3_public_bucket is not configured: do nothing (we will rely on `/assets/*` presign fallback).
        - If configured:
          - visibility=public  => object must be in s3_public_bucket
          - visibility!=public => object must be in s3_bucket (private bucket)

        Returns the target bucket (when a move is required), or None when no action is needed.
        """

        public_bucket = (effective.storage.s3_public_bucket or "").strip() or None
        if not public_bucket:
            return None

        private_bucket = (effective.storage.s3_bucket or "").strip() or None
        if not private_bucket:
            raise BadRequest(
                message=_ts("ASSET_VISIBILITY_SYNC_FAILED", "存储配置异常，无法更新资源可见性"),
                error="ASSET_VISIBILITY_SYNC_FAILED",
            )

        next_visibility = str(target_visibility or "").strip().lower()
        target_bucket = public_bucket if next_visibility == "public" else private_bucket

        current_bucket = str(getattr(asset, "storage_bucket", "") or "").strip() or None
        if not current_bucket:
            # Back-compat for old rows: treat as private bucket.
            current_bucket = private_bucket

        object_key = str(getattr(asset, "object_key", "") or "").strip()
        if not object_key:
            return None

        if current_bucket == target_bucket:
            return None

        src = provider.with_bucket(current_bucket)
        dest = provider.with_bucket(target_bucket)
        await dest.ensure_bucket()

        object_keys = [object_key]
        object_keys.extend(self._collect_thumbnail_object_keys(getattr(asset, "variants", None)))

        # Copy first (to avoid data loss), then delete source. Any failure aborts the visibility update.
        for k in object_keys:
            await dest.copy_object_from(source_bucket=current_bucket, source_key=k, dest_key=k)
        for k in object_keys:
            await src.delete_object(object_key=k)

        return target_bucket

    async def list_assets(
        self, *, workspace_id: UUID, params: PageParams, filters: AdminAssetListQuery
    ) -> PageData[AdminAssetSummaryOut]:
        folder_ids: list[UUID] | None = None
        if filters.folder_id is not None and bool(filters.include_children):
            folder_ids = await self.repo.collect_descendant_folder_ids(
                workspace_id=workspace_id,
                root_folder_id=filters.folder_id,
            )
        qs = self.repo.query_assets(workspace_id=workspace_id, filters=filters, folder_ids=folder_ids)
        # We implement pagination here (instead of paginate_queryset) so we can enrich uploader info
        # without changing the shared pagination utility.
        total = int(await qs.count())
        pages = ceil(total / params.size) if params.size else 0

        if total == 0 or params.page > pages:
            items: list[AdminAssetSummaryOut] = []
        else:
            rows = await qs.limit(params.limit).offset(params.offset)
            items = [AdminAssetSummaryOut.model_validate(r, from_attributes=True) for r in rows]

            # Best-effort: compute a direct URL for public assets (CDN/S3 base URL).
            # This is intentionally not a computed_field because it requires effective runtime settings.
            effective = await get_effective_settings(self.settings)
            base_url = effective.storage.public_base_url
            for out, row in zip(items, rows, strict=False):
                try:
                    provider = str(getattr(row, "storage_provider", "") or "")
                    object_key = str(getattr(row, "object_key", "") or "")
                    storage_bucket = str(getattr(row, "storage_bucket", "") or "") or None
                except Exception:
                    continue
                if out.visibility == "public" and provider == "s3":
                    if self._can_direct_deliver(effective=effective, storage_bucket=storage_bucket):
                        out.public_direct_url = self._build_public_direct_url(base_url=base_url, object_key=object_key)
                    else:
                        out.public_direct_url = None

            # Best-effort uploader name (avoid N+1; load all users for current page in one query).
            user_ids = {x.owner_user_id for x in items if x.owner_user_id is not None}
            if user_ids:
                users = await User.filter(id__in=list(user_ids)).values("id", "username", "display_name")
                id_to_name: dict[UUID, str] = {}
                for u in users:
                    uid = u.get("id")
                    if uid is None:
                        continue
                    name = (u.get("display_name") or u.get("username") or "") if isinstance(u, dict) else ""
                    if isinstance(name, str) and name.strip():
                        id_to_name[uid] = name.strip()
                for out in items:
                    if out.owner_user_id is None:
                        continue
                    out.uploader_name = id_to_name.get(out.owner_user_id)

        next_page: int | None = None
        prev_page: int | None = None
        if pages > 0:
            if params.page < pages:
                next_page = params.page + 1
            if params.page > 1:
                prev_page = min(params.page - 1, pages)
        return PageData[AdminAssetSummaryOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def list_folders(self, *, workspace_id: UUID, params: PageParams) -> PageData[AdminAssetFolderOut]:
        qs = self.repo.query_folders(workspace_id=workspace_id)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetFolderOut)

    async def list_tags(
        self, *, workspace_id: UUID, params: PageParams, q: str | None = None
    ) -> PageData[AdminAssetTagOut]:
        qs = self.repo.query_tags(workspace_id=workspace_id, q=q)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetTagOut)

    async def create_tag(self, *, workspace_id: UUID, payload: AdminAssetTagCreateRequest) -> AdminAssetTagOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(message=_ts("ASSET_TAG_NAME_INVALID", "标签名称不合法"), error="ASSET_TAG_NAME_INVALID")

        exists = await self.repo.get_tag_by_name(workspace_id=workspace_id, name=name)
        if exists is not None:
            # Idempotent create: return existing to help UI get the id.
            return AdminAssetTagOut.model_validate(exists, from_attributes=True)

        tag = await self.repo.create_tag(workspace_id=workspace_id, name=name)
        return AdminAssetTagOut.model_validate(tag, from_attributes=True)

    async def get_asset_detail(self, *, workspace_id: UUID, asset_id: UUID) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(workspace_id=workspace_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        detail = AdminAssetDetailOut.model_validate(asset, from_attributes=True)
        if detail.visibility == "public" and str(getattr(asset, "storage_provider", "") or "") == "s3":
            effective = await get_effective_settings(self.settings)
            if self._can_direct_deliver(
                effective=effective, storage_bucket=str(getattr(asset, "storage_bucket", "") or "") or None
            ):
                detail.public_direct_url = self._build_public_direct_url(
                    base_url=effective.storage.public_base_url,
                    object_key=str(getattr(asset, "object_key", "") or ""),
                )
            else:
                detail.public_direct_url = None
        if detail.owner_user_id is not None:
            user = await User.get_or_none(id=detail.owner_user_id)
            if user is not None:
                detail.uploader_name = (user.display_name or user.username or None) if user else None
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
        self, *, workspace_id: UUID, asset_id: UUID, payload: AdminAssetUpdateRequest
    ) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(workspace_id=workspace_id, asset_id=asset_id)
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
            tags = await self.repo.list_tags_by_ids(workspace_id=workspace_id, tag_ids=dedup)
            if len(tags) != len(dedup):
                raise BadRequest(message=_ts("ASSET_TAG_NOT_FOUND", "标签不存在"), error="ASSET_TAG_NOT_FOUND")
            await self.repo.replace_asset_tags(asset_id=asset.id, tag_ids=dedup)

        if "visibility" in payload.model_fields_set:
            if payload.visibility is None:
                raise BadRequest(
                    message=_ts("ASSET_VISIBILITY_INVALID", "可见性不合法"),
                    error="ASSET_VISIBILITY_INVALID",
                )
            if str(getattr(asset, "storage_provider", "") or "") == "s3":
                effective = await get_effective_settings(self.settings)
                provider_impl = build_storage_provider_for(effective, provider="s3")
                if not isinstance(provider_impl, S3StorageProvider):
                    raise BadRequest(
                        message=_ts("ASSET_VISIBILITY_SYNC_FAILED", "存储配置异常，无法更新资源可见性"),
                        error="ASSET_VISIBILITY_SYNC_FAILED",
                    )
                moved_to = await self._sync_s3_bucket_for_visibility(
                    effective=effective,
                    provider=provider_impl,
                    asset=asset,
                    target_visibility=str(payload.visibility),
                )
                if moved_to:
                    updates["storage_bucket"] = moved_to
            updates["visibility"] = payload.visibility
            if str(payload.visibility) != "public":
                updates["indexable"] = False

        if "purpose" in payload.model_fields_set:
            if payload.purpose is None:
                raise BadRequest(
                    message=_ts("ASSET_PURPOSE_INVALID", "用途不合法"),
                    error="ASSET_PURPOSE_INVALID",
                )
            updates["purpose"] = payload.purpose

        if updates:
            asset = await self.repo.save_asset_updates(asset, updates=updates)

        # Reload to ensure tag_links/meta reflect latest state.
        return await self.get_asset_detail(workspace_id=workspace_id, asset_id=asset.id)

    async def bulk_update_assets(
        self,
        *,
        workspace_id: UUID,
        payload: AdminAssetBulkUpdateRequest,
    ) -> AdminAssetBulkUpdateOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        updates: dict = {}
        if payload.visibility is not None:
            updates["visibility"] = payload.visibility
        if payload.purpose is not None:
            updates["purpose"] = payload.purpose
        if not updates:
            raise BadRequest(
                message=_ts("ASSET_BULK_UPDATE_INVALID", "请至少选择一个要修改的字段"),
                error="ASSET_BULK_UPDATE_INVALID",
            )

        rows = await self.repo.get_assets_by_ids(workspace_id=workspace_id, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        # If visibility changes and S3 dual-bucket is enabled, we must move objects between buckets;
        # a pure DB bulk update would leave private blobs in the public bucket (security risk).
        if payload.visibility is not None:
            effective = await get_effective_settings(self.settings)
            provider_impl = None
            if str(getattr(effective.storage, "provider", "") or "") == "s3":
                built = build_storage_provider_for(effective, provider="s3")
                provider_impl = built if isinstance(built, S3StorageProvider) else None

            # Fast path: when storage isn't S3 dual-bucket (or provider init failed), we can safely
            # do a single DB-level bulk update.
            if provider_impl is None:
                now = datetime.now(tz=UTC)
                bulk_updates = dict(updates)
                if str(payload.visibility) != "public":
                    bulk_updates["indexable"] = False
                updated = await self.repo.bulk_update_assets_fields(
                    workspace_id=workspace_id,
                    asset_ids=asset_ids,
                    updates=bulk_updates,
                    updated_at=now,
                )
            else:
                updated = 0
                for asset in rows:
                    per_updates: dict = {}
                    if payload.visibility is not None:
                        per_updates["visibility"] = payload.visibility
                        if str(payload.visibility) != "public":
                            per_updates["indexable"] = False

                    if payload.purpose is not None:
                        per_updates["purpose"] = payload.purpose

                    if str(getattr(asset, "storage_provider", "") or "") == "s3" and str(
                        getattr(asset, "object_key", "") or ""
                    ):
                        moved_to = await self._sync_s3_bucket_for_visibility(
                            effective=effective,
                            provider=provider_impl,
                            asset=asset,
                            target_visibility=str(payload.visibility),
                        )
                        if moved_to:
                            per_updates["storage_bucket"] = moved_to

                    if per_updates:
                        await self.repo.save_asset_updates(asset, updates=per_updates)
                        updated += 1
        else:
            now = datetime.now(tz=UTC)
            updated = await self.repo.bulk_update_assets_fields(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                updates=updates,
                updated_at=now,
            )

        return AdminAssetBulkUpdateOut(
            updated_count=updated,
            updated_asset_ids=asset_ids,
            visibility=payload.visibility,
            purpose=payload.purpose,
        )

    async def delete_asset(self, *, workspace_id: UUID, asset_id: UUID) -> AdminAssetDeleteOut:
        asset = await self.repo.get_asset(workspace_id=workspace_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        if asset.deleted_at is None:
            asset.deleted_at = datetime.now(tz=UTC)
            await asset.save(update_fields=["deleted_at", "updated_at"])

        return AdminAssetDeleteOut(id=asset.id, deleted_at=asset.deleted_at)

    async def create_folder(self, *, workspace_id: UUID, payload: AdminAssetFolderCreateRequest) -> AdminAssetFolderOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(
                message=_ts("ASSET_FOLDER_NAME_INVALID", "文件夹名称不合法"), error="ASSET_FOLDER_NAME_INVALID"
            )

        parent_id = payload.parent_id
        if parent_id is not None:
            parent = await self.repo.get_folder(workspace_id=workspace_id, folder_id=parent_id)
            if parent is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        description = payload.description.strip() if isinstance(payload.description, str) else None
        if description == "":
            description = None

        exists = (
            await self.repo.query_folders(workspace_id=workspace_id).filter(parent_id=parent_id, name=name).exists()
        )
        if exists:
            raise Conflict(message=_ts("ASSET_FOLDER_EXISTS", "文件夹已存在"), error="ASSET_FOLDER_EXISTS")

        folder = await self.repo.create_folder(
            workspace_id=workspace_id,
            name=name,
            parent_id=parent_id,
            description=description,
            sort_order=int(payload.sort_order),
        )
        return AdminAssetFolderOut.model_validate(folder, from_attributes=True)

    async def update_folder(
        self, *, workspace_id: UUID, folder_id: UUID, payload: AdminAssetFolderUpdateRequest
    ) -> AdminAssetFolderOut:
        folder = await self.repo.get_folder(workspace_id=workspace_id, folder_id=folder_id)
        if folder is None:
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        updates: dict = {}

        next_parent_id = folder.parent_id
        if "parent_id" in payload.model_fields_set:
            next_parent_id = payload.parent_id
            if next_parent_id == folder.id:
                raise BadRequest(
                    message=_ts("ASSET_FOLDER_PARENT_INVALID", "文件夹父级不合法"),
                    error="ASSET_FOLDER_PARENT_INVALID",
                )
            if next_parent_id is not None:
                parent = await self.repo.get_folder(workspace_id=workspace_id, folder_id=next_parent_id)
                if parent is None:
                    raise NotFound(
                        message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"),
                        error="ASSET_FOLDER_NOT_FOUND",
                    )

                # Prevent cycles: parent cannot be this folder or any of its descendants.
                descendants = await self.repo.collect_descendant_folder_ids(
                    workspace_id=workspace_id, root_folder_id=folder.id
                )
                if next_parent_id in descendants:
                    raise BadRequest(
                        message=_ts("ASSET_FOLDER_PARENT_INVALID", "文件夹父级不合法"),
                        error="ASSET_FOLDER_PARENT_INVALID",
                    )
            updates["parent_id"] = next_parent_id

        next_name = folder.name
        if payload.name is not None:
            next_name = payload.name.strip()
            if not next_name:
                raise BadRequest(
                    message=_ts("ASSET_FOLDER_NAME_INVALID", "文件夹名称不合法"),
                    error="ASSET_FOLDER_NAME_INVALID",
                )
            updates["name"] = next_name

        # Name/parent unique constraint: (workspace_id, parent_id, name).
        if ("name" in updates) or ("parent_id" in updates):
            exists = (
                await self.repo
                .query_folders(workspace_id=workspace_id)
                .filter(parent_id=next_parent_id, name=next_name)
                .exclude(id=folder.id)
                .exists()
            )
            if exists:
                raise Conflict(message=_ts("ASSET_FOLDER_EXISTS", "文件夹已存在"), error="ASSET_FOLDER_EXISTS")

        if "description" in payload.model_fields_set:
            desc = payload.description
            if isinstance(desc, str):
                cleaned = desc.strip()
                updates["description"] = cleaned or None
            else:
                updates["description"] = None

        if payload.sort_order is not None:
            updates["sort_order"] = int(payload.sort_order)

        if updates:
            folder = await self.repo.save_folder_updates(folder, updates=updates)
        return AdminAssetFolderOut.model_validate(folder, from_attributes=True)

    async def delete_folder(self, *, workspace_id: UUID, folder_id: UUID) -> AdminAssetFolderDeleteOut:
        folder = await self.repo.get_folder(workspace_id=workspace_id, folder_id=folder_id)
        if folder is None:
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        has_children = await self.repo.folder_has_children(workspace_id=workspace_id, folder_id=folder_id)
        if has_children:
            raise Conflict(
                message=_ts("ASSET_FOLDER_NOT_EMPTY", "文件夹非空，无法删除"), error="ASSET_FOLDER_NOT_EMPTY"
            )

        has_assets = await self.repo.folder_has_assets(workspace_id=workspace_id, folder_id=folder_id)
        if has_assets:
            raise Conflict(
                message=_ts("ASSET_FOLDER_NOT_EMPTY", "文件夹非空，无法删除"), error="ASSET_FOLDER_NOT_EMPTY"
            )

        await self.repo.delete_folder(workspace_id=workspace_id, folder_id=folder_id)
        return AdminAssetFolderDeleteOut(id=folder_id)

    async def move_asset(
        self, *, workspace_id: UUID, asset_id: UUID, payload: AdminAssetMoveRequest
    ) -> AdminAssetSummaryOut:
        asset = await self.repo.get_asset(workspace_id=workspace_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        folder_id = payload.folder_id
        if folder_id is not None:
            folder = await self.repo.get_folder(workspace_id=workspace_id, folder_id=folder_id)
            if folder is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        asset = await self.repo.save_asset_updates(asset, updates={"folder_id": folder_id})
        return AdminAssetSummaryOut.model_validate(asset, from_attributes=True)

    async def bulk_move_assets(
        self,
        *,
        workspace_id: UUID,
        payload: AdminAssetBulkMoveRequest,
    ) -> AdminAssetBulkMoveOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        folder_id = payload.folder_id
        if folder_id is not None:
            folder = await self.repo.get_folder(workspace_id=workspace_id, folder_id=folder_id)
            if folder is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        rows = await self.repo.get_assets_by_ids(workspace_id=workspace_id, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        now = datetime.now(tz=UTC)
        moved = await self.repo.bulk_update_assets_folder(
            workspace_id=workspace_id,
            asset_ids=asset_ids,
            folder_id=folder_id,
            updated_at=now,
        )

        return AdminAssetBulkMoveOut(
            moved_count=moved,
            folder_id=folder_id,
            moved_asset_ids=asset_ids,
        )

    async def bulk_delete_assets(
        self,
        *,
        workspace_id: UUID,
        payload: AdminAssetBulkDeleteRequest,
    ) -> AdminAssetBulkDeleteOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        rows = await self.repo.get_assets_by_ids(workspace_id=workspace_id, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        now = datetime.now(tz=UTC)
        deleted = await self.repo.bulk_soft_delete_assets(
            workspace_id=workspace_id,
            asset_ids=asset_ids,
            deleted_at=now,
            updated_at=now,
        )

        return AdminAssetBulkDeleteOut(
            deleted_count=deleted,
            deleted_asset_ids=asset_ids,
        )

    async def stream_asset_content(self, *, workspace_id: UUID, asset_id: UUID, range_header: str | None):
        asset = await self.repo.get_asset(workspace_id=workspace_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

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

        if asset.storage_provider == "s3":
            effective = await get_effective_settings(self.settings)
            provider = build_storage_provider_for(effective, provider="s3")
            if not isinstance(provider, S3StorageProvider):
                raise NotFound(message=_ts("ASSET_FILE_NOT_FOUND", "文件不存在"), error="ASSET_FILE_NOT_FOUND")
            bucket = str(getattr(asset, "storage_bucket", "") or "") or None
            if bucket:
                provider = provider.with_bucket(bucket)
            return await stream_s3_object(
                provider=provider,
                object_key=asset.object_key,
                content_type=media_type,
                range_header=range_header,
                extra_headers=headers,
            )

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, asset.object_key)
        if not path.is_file():
            raise NotFound(message=_ts("ASSET_FILE_NOT_FOUND", "文件不存在"), error="ASSET_FILE_NOT_FOUND")

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )
