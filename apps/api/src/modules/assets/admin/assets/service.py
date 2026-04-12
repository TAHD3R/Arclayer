from __future__ import annotations

import mimetypes
from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from src.common.services import BaseService
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.file_stream import stream_file_response
from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.core.i18n import t
from src.infra.storage.factory import build_storage_provider_for
from src.infra.storage.local import safe_object_key_to_path
from src.infra.storage.s3 import S3StorageProvider
from src.infra.storage.s3_stream import stream_s3_object
from src.models.assets.asset import AssetRecord
from src.models.organization.user import User
from src.modules.assets.admin.assets.repository import AdminAssetsRepository
from src.modules.assets.admin.assets.schema import (
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
    AdminAssetFolderDeleteRequest,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
)
from src.modules.assets.admin.uploads.policy.service import normalize_original_filename
from src.modules.assets.scope import AssetScope
from src.settings.runtime import get_effective_settings


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


_SYSTEM_PURPOSES = frozenset({"avatar", "site_logo", "workspace_icon", "favicon"})


def _is_system_purpose(purpose: object) -> bool:
    return str(purpose or "").strip().lower() in _SYSTEM_PURPOSES


def _compute_next_access_state_for_patch(
    *,
    asset: AssetRecord,
    payload: AdminAssetUpdateRequest,
) -> tuple[object, object, bool]:
    fields = getattr(payload, "model_fields_set", set())
    visibility_in = "visibility" in fields
    purpose_in = "purpose" in fields
    indexable_in = "indexable" in fields

    next_visibility = payload.visibility if visibility_in else getattr(asset, "visibility", None)
    next_purpose = payload.purpose if purpose_in else getattr(asset, "purpose", None)
    if indexable_in:
        if payload.indexable is None:
            raise BadRequest(
                message=_ts("ASSET_INDEXABLE_INVALID", "可索引标记不合法"),
                error="ASSET_INDEXABLE_INVALID",
            )
        next_indexable = bool(payload.indexable)
    else:
        next_indexable = bool(getattr(asset, "indexable", False))

    # Back-compat: toggling visibility away from public implicitly enforces noindex.
    if visibility_in and str(payload.visibility) != "public" and not indexable_in:
        next_indexable = False

    return next_visibility, next_purpose, next_indexable


def _compute_next_access_state_for_bulk_patch(
    *,
    row: AssetRecord,
    payload: AdminAssetBulkUpdateRequest,
) -> tuple[object, object, bool]:
    next_visibility = payload.visibility if payload.visibility is not None else getattr(row, "visibility", None)
    next_purpose = payload.purpose if payload.purpose is not None else getattr(row, "purpose", None)
    if payload.indexable is not None:
        next_indexable = bool(payload.indexable)
    else:
        next_indexable = bool(getattr(row, "indexable", False))

    # Back-compat: toggling visibility away from public implicitly enforces noindex.
    if payload.visibility is not None and str(payload.visibility) != "public" and payload.indexable is None:
        next_indexable = False

    return next_visibility, next_purpose, next_indexable


def _raise_if_access_state_invalid(
    *,
    next_visibility: object,
    next_purpose: object,
    next_indexable: bool,
    details: dict[str, object] | None = None,
) -> None:
    if next_indexable and str(next_visibility) != "public":
        raise BadRequest(
            message=_ts("ASSET_INDEXABLE_REQUIRES_PUBLIC", "仅公开资源可设置为可索引"),
            error="ASSET_INDEXABLE_REQUIRES_PUBLIC",
            details=details or {"visibility": str(next_visibility), "indexable": next_indexable},
        )

    if _is_system_purpose(next_purpose) and (str(next_visibility) != "public" or next_indexable):
        raise BadRequest(
            message=_ts("ASSET_SYSTEM_PURPOSE_INVARIANT", "该用途的资源必须为公开且不可索引"),
            error="ASSET_SYSTEM_PURPOSE_INVARIANT",
            details=details
            or {"purpose": str(next_purpose), "visibility": str(next_visibility), "indexable": next_indexable},
        )


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
        self, *, scope: AssetScope, params: PageParams, filters: AdminAssetListQuery
    ) -> PageData[AdminAssetSummaryOut]:
        folder_ids: list[UUID] | None = None
        if filters.folder_id is not None and bool(filters.include_children):
            folder_ids = await self.repo.collect_descendant_folder_ids(
                scope=scope,
                root_folder_id=filters.folder_id,
            )
        qs = self.repo.query_assets(scope=scope, filters=filters, folder_ids=folder_ids)
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
                users = await User.filter(id__in=list(user_ids)).values(
                    "id",
                    "username",
                    "display_name",
                    "avatar_url",
                    "email",
                )
                id_to_name: dict[UUID, str] = {}
                id_to_avatar_url: dict[UUID, str] = {}
                id_to_email: dict[UUID, str] = {}
                for u in users:
                    uid = u.get("id")
                    if uid is None:
                        continue
                    name = (u.get("display_name") or u.get("username") or "") if isinstance(u, dict) else ""
                    avatar_url = u.get("avatar_url") if isinstance(u, dict) else None
                    email = u.get("email") if isinstance(u, dict) else None
                    if isinstance(name, str) and name.strip():
                        id_to_name[uid] = name.strip()
                    if isinstance(avatar_url, str) and avatar_url.strip():
                        id_to_avatar_url[uid] = avatar_url.strip()
                    if isinstance(email, str) and email.strip():
                        id_to_email[uid] = email.strip()
                for out in items:
                    if out.owner_user_id is None:
                        continue
                    out.uploader_name = id_to_name.get(out.owner_user_id)
                    out.uploader_avatar_url = id_to_avatar_url.get(out.owner_user_id)
                    out.uploader_email = id_to_email.get(out.owner_user_id)

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

    async def list_folders(self, *, scope: AssetScope, params: PageParams) -> PageData[AdminAssetFolderOut]:
        qs = self.repo.query_folders(scope=scope)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetFolderOut)

    async def list_tags(
        self, *, scope: AssetScope, params: PageParams, q: str | None = None
    ) -> PageData[AdminAssetTagOut]:
        qs = self.repo.query_tags(scope=scope, q=q)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetTagOut)

    async def create_tag(self, *, scope: AssetScope, payload: AdminAssetTagCreateRequest) -> AdminAssetTagOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(message=_ts("ASSET_TAG_NAME_INVALID", "标签名称不合法"), error="ASSET_TAG_NAME_INVALID")

        exists = await self.repo.get_tag_by_name(scope=scope, name=name)
        if exists is not None:
            # Idempotent create: return existing to help UI get the id.
            return AdminAssetTagOut.model_validate(exists, from_attributes=True)

        tag = await self.repo.create_tag(scope=scope, name=name)
        return AdminAssetTagOut.model_validate(tag, from_attributes=True)

    async def get_asset_detail(self, *, scope: AssetScope, asset_id: UUID) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(scope=scope, asset_id=asset_id)
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
                detail.uploader_name = user.display_name or user.username or None
                detail.uploader_avatar_url = user.avatar_url
                detail.uploader_email = user.email
        meta = asset.meta if isinstance(asset.meta, dict) else {}
        desc = meta.get("description") if isinstance(meta, dict) else None
        detail.description = desc if isinstance(desc, str) else None
        alt_name = meta.get("alt_name") if isinstance(meta, dict) else None
        detail.alt_name = alt_name if isinstance(alt_name, str) else None

        tags = []
        for link in getattr(asset, "tag_links", []) or []:
            tag = getattr(link, "tag", None)
            if tag is None:
                continue
            tags.append(AdminAssetTagOut.model_validate(tag, from_attributes=True))
        detail.tags = tags
        return detail

    def _build_meta_updates_for_patch(
        self,
        *,
        asset: AssetRecord,
        payload: AdminAssetUpdateRequest,
    ) -> dict[str, object]:
        fields = getattr(payload, "model_fields_set", set())
        raw = (payload.description or "").strip()
        desc = raw or None
        meta = asset.meta if isinstance(getattr(asset, "meta", None), dict) else {}
        if not isinstance(meta, dict):
            meta = {}
        updates: dict[str, object] = {}

        if "description" in fields:
            if desc is None:
                meta.pop("description", None)
            else:
                meta["description"] = desc
            updates["meta"] = meta or None

        if "alt_name" in fields:
            raw_alt_name = (payload.alt_name or "").strip()
            alt_name = raw_alt_name or None
            if alt_name is None:
                meta.pop("alt_name", None)
            else:
                meta["alt_name"] = alt_name
            updates["meta"] = meta or None

        if "original_filename" in fields:
            if payload.original_filename is None:
                raise BadRequest(
                    message=_ts("UPLOAD_FILENAME_INVALID", "文件名不合法"),
                    error="UPLOAD_FILENAME_INVALID",
                )
            updates["original_filename"] = normalize_original_filename(payload.original_filename)

        return updates

    async def _apply_tag_patch(self, *, scope: AssetScope, asset_id: UUID, payload: AdminAssetUpdateRequest) -> None:
        fields = getattr(payload, "model_fields_set", set())
        if "tag_ids" not in fields:
            return

        ids = payload.tag_ids or []
        dedup: list[UUID] = list(dict.fromkeys(ids))
        tags = await self.repo.list_tags_by_ids(scope=scope, tag_ids=dedup)
        if len(tags) != len(dedup):
            raise BadRequest(message=_ts("ASSET_TAG_NOT_FOUND", "标签不存在"), error="ASSET_TAG_NOT_FOUND")
        await self.repo.replace_asset_tags(asset_id=asset_id, tag_ids=dedup)

    async def _build_access_updates_for_patch(
        self,
        *,
        asset: AssetRecord,
        payload: AdminAssetUpdateRequest,
    ) -> dict[str, object]:
        fields = getattr(payload, "model_fields_set", set())
        updates: dict[str, object] = {}

        if "visibility" in fields:
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

        if "purpose" in fields:
            if payload.purpose is None:
                raise BadRequest(
                    message=_ts("ASSET_PURPOSE_INVALID", "用途不合法"),
                    error="ASSET_PURPOSE_INVALID",
                )
            updates["purpose"] = payload.purpose

        if "indexable" in fields:
            if payload.indexable is None:
                raise BadRequest(
                    message=_ts("ASSET_INDEXABLE_INVALID", "可索引标记不合法"),
                    error="ASSET_INDEXABLE_INVALID",
                )
            updates["indexable"] = bool(payload.indexable)

        return updates

    async def update_asset(
        self, *, scope: AssetScope, asset_id: UUID, payload: AdminAssetUpdateRequest
    ) -> AdminAssetDetailOut:
        asset = await self.repo.get_asset_with_tags(scope=scope, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        next_visibility, next_purpose, next_indexable = _compute_next_access_state_for_patch(
            asset=asset, payload=payload
        )
        _raise_if_access_state_invalid(
            next_visibility=next_visibility,
            next_purpose=next_purpose,
            next_indexable=next_indexable,
        )

        updates: dict[str, object] = {}
        updates.update(self._build_meta_updates_for_patch(asset=asset, payload=payload))
        await self._apply_tag_patch(scope=scope, asset_id=asset.id, payload=payload)
        updates.update(await self._build_access_updates_for_patch(asset=asset, payload=payload))

        if updates:
            asset = await self.repo.save_asset_updates(asset, updates=updates)

        # Reload to ensure tag_links/meta reflect latest state.
        return await self.get_asset_detail(scope=scope, asset_id=asset.id)

    def _build_bulk_access_updates(self, *, payload: AdminAssetBulkUpdateRequest) -> dict[str, object]:
        if payload.indexable is True and payload.visibility is not None and str(payload.visibility) != "public":
            raise BadRequest(
                message=_ts("ASSET_INDEXABLE_REQUIRES_PUBLIC", "仅公开资源可设置为可索引"),
                error="ASSET_INDEXABLE_REQUIRES_PUBLIC",
                details={"visibility": str(payload.visibility), "indexable": True},
            )

        updates: dict[str, object] = {}
        if payload.visibility is not None:
            updates["visibility"] = payload.visibility
        if payload.purpose is not None:
            updates["purpose"] = payload.purpose
        if payload.indexable is not None:
            updates["indexable"] = bool(payload.indexable)
        if not updates:
            raise BadRequest(
                message=_ts("ASSET_BULK_UPDATE_INVALID", "请至少选择一个要修改的字段"),
                error="ASSET_BULK_UPDATE_INVALID",
            )
        return updates

    def _collect_bulk_governance_offenders(
        self,
        *,
        rows: list[AssetRecord],
        payload: AdminAssetBulkUpdateRequest,
    ) -> list[str]:
        offenders: list[str] = []
        for row in rows:
            next_visibility, next_purpose, next_indexable = _compute_next_access_state_for_bulk_patch(
                row=row, payload=payload
            )
            try:
                _raise_if_access_state_invalid(
                    next_visibility=next_visibility,
                    next_purpose=next_purpose,
                    next_indexable=next_indexable,
                )
            except BadRequest:
                offenders.append(encode_uuid(UUID(str(row.id))))
        return offenders

    async def _bulk_update_assets_fields(
        self, *, scope: AssetScope, asset_ids: list[UUID], updates: dict[str, object]
    ) -> int:
        now = datetime.now(tz=UTC)
        return await self.repo.bulk_update_assets_fields(
            scope=scope,
            asset_ids=asset_ids,
            updates=updates,
            updated_at=now,
        )

    async def _bulk_update_assets_when_visibility_changes(
        self,
        *,
        scope: AssetScope,
        payload: AdminAssetBulkUpdateRequest,
        asset_ids: list[UUID],
        rows: list[AssetRecord],
        updates: dict[str, object],
    ) -> int:
        effective = await get_effective_settings(self.settings)
        provider_impl = None
        if str(getattr(effective.storage, "provider", "") or "") == "s3":
            built = build_storage_provider_for(effective, provider="s3")
            provider_impl = built if isinstance(built, S3StorageProvider) else None

        if provider_impl is None:
            bulk_updates = dict(updates)
            if str(payload.visibility) != "public":
                bulk_updates["indexable"] = False
            return await self._bulk_update_assets_fields(scope=scope, asset_ids=asset_ids, updates=bulk_updates)

        updated = 0
        for asset in rows:
            per_updates: dict[str, object] = dict(updates)
            if str(payload.visibility) != "public":
                per_updates["indexable"] = False

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
        return updated

    @staticmethod
    def _compute_bulk_applied_indexable(payload: AdminAssetBulkUpdateRequest) -> bool | None:
        if payload.indexable is not None:
            return bool(payload.indexable)
        if payload.visibility is not None and str(payload.visibility) != "public":
            return False
        return None

    async def bulk_update_assets(
        self,
        *,
        scope: AssetScope,
        payload: AdminAssetBulkUpdateRequest,
    ) -> AdminAssetBulkUpdateOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        updates = self._build_bulk_access_updates(payload=payload)

        rows = await self.repo.get_assets_by_ids(scope=scope, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        offenders = self._collect_bulk_governance_offenders(rows=rows, payload=payload)

        if offenders:
            raise BadRequest(
                message=_ts("ASSET_BULK_UPDATE_GOVERNANCE_FAILED", "部分资源不满足用途/可见性/索引规则"),
                error="ASSET_BULK_UPDATE_GOVERNANCE_FAILED",
                details={"invalidAssetIds": offenders[:5], "invalidCount": len(offenders)},
            )

        if payload.visibility is not None:
            updated = await self._bulk_update_assets_when_visibility_changes(
                scope=scope,
                payload=payload,
                asset_ids=asset_ids,
                rows=rows,
                updates=updates,
            )
        else:
            updated = await self._bulk_update_assets_fields(scope=scope, asset_ids=asset_ids, updates=updates)

        return AdminAssetBulkUpdateOut(
            updated_count=updated,
            updated_asset_ids=asset_ids,
            visibility=payload.visibility,
            purpose=payload.purpose,
            indexable=self._compute_bulk_applied_indexable(payload),
        )

    async def delete_asset(self, *, scope: AssetScope, asset_id: UUID) -> AdminAssetDeleteOut:
        asset = await self.repo.get_asset(scope=scope, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        if asset.deleted_at is None:
            asset.deleted_at = datetime.now(tz=UTC)
            await asset.save(update_fields=["deleted_at", "updated_at"])

        return AdminAssetDeleteOut(id=asset.id, deleted_at=asset.deleted_at)

    async def create_folder(self, *, scope: AssetScope, payload: AdminAssetFolderCreateRequest) -> AdminAssetFolderOut:
        name = payload.name.strip()
        if not name:
            raise BadRequest(
                message=_ts("ASSET_FOLDER_NAME_INVALID", "文件夹名称不合法"), error="ASSET_FOLDER_NAME_INVALID"
            )

        parent_id = payload.parent_id
        if parent_id is not None:
            parent = await self.repo.get_folder(scope=scope, folder_id=parent_id)
            if parent is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        description = payload.description.strip() if isinstance(payload.description, str) else None
        if description == "":
            description = None

        exists = await self.repo.query_folders(scope=scope).filter(parent_id=parent_id, name=name).exists()
        if exists:
            raise Conflict(message=_ts("ASSET_FOLDER_EXISTS", "文件夹已存在"), error="ASSET_FOLDER_EXISTS")

        folder = await self.repo.create_folder(
            scope=scope,
            name=name,
            parent_id=parent_id,
            description=description,
            sort_order=int(payload.sort_order),
        )
        return AdminAssetFolderOut.model_validate(folder, from_attributes=True)

    async def update_folder(
        self, *, scope: AssetScope, folder_id: UUID, payload: AdminAssetFolderUpdateRequest
    ) -> AdminAssetFolderOut:
        folder = await self.repo.get_folder(scope=scope, folder_id=folder_id)
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
                parent = await self.repo.get_folder(scope=scope, folder_id=next_parent_id)
                if parent is None:
                    raise NotFound(
                        message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"),
                        error="ASSET_FOLDER_NOT_FOUND",
                    )

                # Prevent cycles: parent cannot be this folder or any of its descendants.
                descendants = await self.repo.collect_descendant_folder_ids(scope=scope, root_folder_id=folder.id)
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
                .query_folders(scope=scope)
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

    async def _validate_folder_delete_destination(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        destination_folder_id: UUID | None,
    ) -> None:
        if destination_folder_id is None:
            return

        if destination_folder_id == folder_id:
            raise BadRequest(
                message=_ts("ASSET_FOLDER_PARENT_INVALID", "文件夹父级不合法"),
                error="ASSET_FOLDER_PARENT_INVALID",
            )

        destination = await self.repo.get_folder(scope=scope, folder_id=destination_folder_id)
        if destination is None:
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        descendants = await self.repo.collect_descendant_folder_ids(scope=scope, root_folder_id=folder_id)
        if destination_folder_id in descendants:
            raise BadRequest(
                message=_ts("ASSET_FOLDER_PARENT_INVALID", "文件夹父级不合法"),
                error="ASSET_FOLDER_PARENT_INVALID",
            )

    async def _move_folder_contents(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        destination_folder_id: UUID | None,
    ) -> None:
        now = datetime.now(tz=UTC)
        await self.repo.move_child_folders(
            scope=scope,
            from_folder_id=folder_id,
            to_parent_id=destination_folder_id,
            updated_at=now,
        )
        await self.repo.move_assets_in_folder(
            scope=scope,
            from_folder_id=folder_id,
            to_folder_id=destination_folder_id,
            updated_at=now,
        )

    async def delete_folder(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        payload: AdminAssetFolderDeleteRequest | None = None,
    ) -> AdminAssetFolderDeleteOut:
        folder = await self.repo.get_folder(scope=scope, folder_id=folder_id)
        if folder is None:
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        if payload is not None:
            await self._validate_folder_delete_destination(
                scope=scope,
                folder_id=folder_id,
                destination_folder_id=payload.destination_folder_id,
            )
            await self._move_folder_contents(
                scope=scope,
                folder_id=folder_id,
                destination_folder_id=payload.destination_folder_id,
            )
            await self.repo.delete_folder(scope=scope, folder_id=folder_id)
            return AdminAssetFolderDeleteOut(id=folder_id)

        has_children = await self.repo.folder_has_children(scope=scope, folder_id=folder_id)
        if has_children:
            raise Conflict(
                message=_ts("ASSET_FOLDER_NOT_EMPTY", "文件夹非空，无法删除"), error="ASSET_FOLDER_NOT_EMPTY"
            )

        has_assets = await self.repo.folder_has_assets(scope=scope, folder_id=folder_id)
        if has_assets:
            raise Conflict(
                message=_ts("ASSET_FOLDER_NOT_EMPTY", "文件夹非空，无法删除"), error="ASSET_FOLDER_NOT_EMPTY"
            )

        await self.repo.delete_folder(scope=scope, folder_id=folder_id)
        return AdminAssetFolderDeleteOut(id=folder_id)

    async def move_asset(
        self, *, scope: AssetScope, asset_id: UUID, payload: AdminAssetMoveRequest
    ) -> AdminAssetSummaryOut:
        asset = await self.repo.get_asset(scope=scope, asset_id=asset_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        folder_id = payload.folder_id
        if folder_id is not None:
            folder = await self.repo.get_folder(scope=scope, folder_id=folder_id)
            if folder is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        asset = await self.repo.save_asset_updates(asset, updates={"folder_id": folder_id})
        return AdminAssetSummaryOut.model_validate(asset, from_attributes=True)

    async def bulk_move_assets(
        self,
        *,
        scope: AssetScope,
        payload: AdminAssetBulkMoveRequest,
    ) -> AdminAssetBulkMoveOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        folder_id = payload.folder_id
        if folder_id is not None:
            folder = await self.repo.get_folder(scope=scope, folder_id=folder_id)
            if folder is None:
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        rows = await self.repo.get_assets_by_ids(scope=scope, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        now = datetime.now(tz=UTC)
        moved = await self.repo.bulk_update_assets_folder(
            scope=scope,
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
        scope: AssetScope,
        payload: AdminAssetBulkDeleteRequest,
    ) -> AdminAssetBulkDeleteOut:
        asset_ids = list(dict.fromkeys(payload.asset_ids))
        if not asset_ids:
            raise BadRequest(message=_ts("ASSET_IDS_INVALID", "资源 ID 列表不合法"), error="ASSET_IDS_INVALID")

        rows = await self.repo.get_assets_by_ids(scope=scope, asset_ids=asset_ids)
        if len(rows) != len(asset_ids):
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        now = datetime.now(tz=UTC)
        deleted = await self.repo.bulk_soft_delete_assets(
            scope=scope,
            asset_ids=asset_ids,
            deleted_at=now,
            updated_at=now,
        )

        return AdminAssetBulkDeleteOut(
            deleted_count=deleted,
            deleted_asset_ids=asset_ids,
        )

    async def stream_asset_content(self, *, scope: AssetScope, asset_id: UUID, range_header: str | None):
        asset = await self.repo.get_asset(scope=scope, asset_id=asset_id)
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
