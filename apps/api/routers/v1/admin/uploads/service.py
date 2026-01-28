from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.common.utils.assets import (
    build_asset_object_key,
    build_upload_part_object_key,
    compute_total_parts,
    slugify,
)
from apps.api.common.utils.ids import uuid7
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.infra.assets.thumbnails import generate_image_thumbnails
from apps.api.infra.storage.local import LocalStorageProvider, safe_object_key_to_path
from apps.api.infra.storage.merge import merge_parts_to_file
from apps.api.models.asset import AssetPurpose, AssetRecord, AssetVisibility
from apps.api.models.upload import UploadSessionRecord, UploadStatus
from apps.api.routers.v1.admin.uploads.policy import (
    build_upload_policy,
    normalize_original_filename,
    validate_sha256_hex,
    validate_upload_metadata,
)
from apps.api.routers.v1.admin.uploads.repository import UploadsRepository

logger = get_logger(__name__)

_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif"}


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def normalize_visibility_and_indexable(
    *,
    purpose: str,
    requested_visibility: str | None,
    requested_indexable: bool | None,
) -> tuple[str, bool]:
    """
    Normalize visibility/indexing policy for an upload.

    Rules:
    - avatar/site_logo/favicon are always public and noindex.
    - indexable is only allowed when visibility is public.
    - invalid visibility falls back to private.
    """

    forced_public = purpose in {"avatar", "site_logo", "favicon"}
    if forced_public:
        return ("public", False)

    visibility = (requested_visibility or "").strip().lower()
    if visibility not in {"public", "private", "shared"}:
        visibility = "private"

    indexable = bool(requested_indexable) if requested_indexable is not None else False
    if visibility != "public":
        indexable = False
    return (visibility, indexable)


class UploadsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = UploadsRepository()

        # Local-only (phase 1). S3 will be added later.
        self._tmp_provider = LocalStorageProvider(root_dir=self.settings.storage.local_tmp_dir)

    def _chunk_size_bytes(self) -> int:
        return int(self.settings.storage.upload_chunk_size_mb) * 1024 * 1024

    def _expires_at(self) -> datetime:
        return datetime.now(tz=UTC) + timedelta(seconds=self.settings.storage.upload_session_ttl_seconds)

    async def init_upload(
        self,
        *,
        org_id: UUID,
        actor_user_id: UUID,
        purpose: str,
        filename: str,
        mime: str | None,
        size_bytes: int,
        expected_sha256: str | None,
        requested_visibility: str | None,
        requested_indexable: bool | None,
        target_folder_id: UUID | None,
    ) -> UploadSessionRecord:
        normalized_filename = normalize_original_filename(filename)
        expected_sha256 = validate_sha256_hex(expected_sha256)

        global_max_bytes = int(self.settings.storage.upload_max_file_size_mb) * 1024 * 1024
        policy = build_upload_policy(
            purpose=purpose,
            global_max_size_bytes=global_max_bytes,
            max_avatar_size_bytes=int(self.settings.storage.upload_max_avatar_size_mb) * 1024 * 1024,
            max_site_logo_size_bytes=int(self.settings.storage.upload_max_site_logo_size_mb) * 1024 * 1024,
            max_favicon_size_bytes=int(self.settings.storage.upload_max_favicon_size_mb) * 1024 * 1024,
        )
        validate_upload_metadata(purpose=purpose, filename=normalized_filename, size_bytes=size_bytes, policy=policy)

        chunk_size = self._chunk_size_bytes()
        total_parts = compute_total_parts(size_bytes=size_bytes, chunk_size_bytes=chunk_size)

        if policy.forced_visibility is not None:
            visibility = policy.forced_visibility
            indexable = bool(policy.forced_indexable) if policy.forced_indexable is not None else False
        else:
            visibility, indexable = normalize_visibility_and_indexable(
                purpose=purpose,
                requested_visibility=requested_visibility,
                requested_indexable=requested_indexable,
            )

        return await self.repo.create_session(
            org_id=org_id,
            actor_user_id=actor_user_id,
            purpose=purpose,
            filename=normalized_filename,
            mime=mime,
            size_bytes=size_bytes,
            expected_sha256=expected_sha256,
            chunk_size=chunk_size,
            total_parts=total_parts,
            expires_at=self._expires_at(),
            target_folder_id=target_folder_id,
            storage_provider=self.settings.storage.provider,
            visibility=visibility,
            indexable=indexable,
        )

    async def get_status(self, *, upload_id: UUID, org_id: UUID) -> tuple[UploadSessionRecord, list[int]]:
        session = await self.repo.get_session(upload_id=upload_id, org_id=org_id)
        if session is None:
            raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")

        if session.expires_at < datetime.now(tz=UTC):
            await self.repo.set_session_status(session, status=UploadStatus.EXPIRED)
            raise BadRequest(message=_ts("UPLOAD_EXPIRED", "上传会话已过期"), error="UPLOAD_EXPIRED")

        parts = await self.repo.query_parts(session_id=session.id).values_list("part_number", flat=True)
        uploaded = {int(x) for x in parts}
        missing = [i for i in range(1, int(session.total_parts) + 1) if i not in uploaded]
        return session, missing

    async def put_part(
        self,
        *,
        upload_id: UUID,
        org_id: UUID,
        part_number: int,
        data: bytes,
    ) -> None:
        session, _missing = await self.get_status(upload_id=upload_id, org_id=org_id)
        if session.status in {UploadStatus.COMPLETED, UploadStatus.ABORTED, UploadStatus.EXPIRED}:
            raise BadRequest(message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"), error="UPLOAD_NOT_WRITABLE")

        if part_number <= 0 or part_number > int(session.total_parts):
            raise BadRequest(message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"), error="UPLOAD_PART_INVALID")

        # Defensive chunk size enforcement:
        # - Non-last parts must match chunk_size exactly.
        # - Last part must not exceed chunk_size.
        max_len = int(session.chunk_size)
        if len(data) > max_len:
            raise BadRequest(message=_ts("UPLOAD_CHUNK_TOO_LARGE", "分片大小超过限制"), error="UPLOAD_CHUNK_TOO_LARGE")
        if part_number < int(session.total_parts) and len(data) != max_len:
            raise BadRequest(
                message=_ts("UPLOAD_CHUNK_SIZE_MISMATCH", "分片大小不匹配"),
                error="UPLOAD_CHUNK_SIZE_MISMATCH",
            )

        object_key = build_upload_part_object_key(org_id=org_id, upload_id=upload_id, part_number=part_number)
        self._tmp_provider.put_bytes(object_key=object_key, data=data)
        await self.repo.upsert_part(
            session_id=session.id,
            part_number=part_number,
            object_key=object_key,
            size_bytes=len(data),
        )
        await self.repo.set_session_status(session, status=UploadStatus.UPLOADING)

    async def complete(self, *, upload_id: UUID, org_id: UUID) -> UUID:
        session, missing = await self.get_status(upload_id=upload_id, org_id=org_id)
        if session.status == UploadStatus.COMPLETED and session.asset_id is not None:
            return session.asset_id
        if missing:
            raise BadRequest(
                message=_ts("UPLOAD_INCOMPLETE", "仍有分片未上传"),
                error="UPLOAD_INCOMPLETE",
                meta={"missing_parts": missing},
            )

        await self.repo.set_session_status(session, status=UploadStatus.COMPLETING)

        # Determine final asset metadata.
        filename = session.filename
        ext = (Path(filename).suffix.lstrip(".") or "bin").lower()
        stem = Path(filename).stem or "asset"
        slug = slugify(stem)

        asset_id = uuid7()
        try:
            purpose = AssetPurpose(session.purpose)
        except ValueError:
            purpose = AssetPurpose.LIBRARY

        try:
            visibility = AssetVisibility(str(session.visibility))
        except ValueError:
            visibility = AssetVisibility.PRIVATE
        indexable = bool(session.indexable) if visibility == AssetVisibility.PUBLIC else False

        asset = await AssetRecord.create(
            id=asset_id,
            org_id=org_id,
            owner_user_id=session.actor_user_id,
            folder_id=session.target_folder_id,
            purpose=purpose,
            visibility=visibility,
            indexable=indexable,
            title=None,
            slug=slug,
            original_filename=filename,
            mime=session.mime,
            ext=ext,
            size_bytes=session.size_bytes,
            checksum_sha256=None,
            storage_provider=session.storage_provider,
            object_key=build_asset_object_key(org_id=org_id, asset_id=asset_id, ext=ext),
            variants=None,
            meta=None,
            deleted_at=None,
        )

        # Merge tmp parts into final file.
        part_rows = await self.repo.query_parts(session_id=session.id).order_by("part_number")
        total_uploaded = sum(int(r.size_bytes) for r in part_rows)
        if total_uploaded != int(session.size_bytes):
            # Keep session writable for retry; do not create a dangling asset.
            await asset.delete()
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING)
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={"declared_size_bytes": int(session.size_bytes), "uploaded_size_bytes": total_uploaded},
            )

        part_keys = [row.object_key for row in part_rows]
        part_paths = [safe_object_key_to_path(self.settings.storage.local_tmp_dir, k) for k in part_keys]

        out_path = safe_object_key_to_path(self.settings.storage.local_root_dir, asset.object_key)
        try:
            digest = merge_parts_to_file(part_paths=part_paths, out_path=out_path)
        except Exception as exc:
            # Revert to UPLOADING so the client can retry complete after re-uploading parts if needed.
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass
            try:
                await asset.delete()
            except Exception:
                pass
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING)
            raise BadRequest(message=_ts("UPLOAD_MERGE_FAILED", "合并分片失败"), error="UPLOAD_MERGE_FAILED") from exc

        # Verify checksum if provided by the client (best-effort integrity check).
        if session.expected_sha256 and digest.lower() != str(session.expected_sha256).lower():
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass
            try:
                await asset.delete()
            except Exception:
                pass
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING)
            raise BadRequest(
                message=_ts("UPLOAD_SHA256_MISMATCH", "文件校验失败"),
                error="UPLOAD_SHA256_MISMATCH",
                meta={"expected_sha256": session.expected_sha256, "actual_sha256": digest},
            )

        # Update checksum and mark session completed.
        asset.checksum_sha256 = digest
        await asset.save(update_fields=["checksum_sha256", "updated_at"])
        await self.repo.mark_completed(session, asset_id=asset.id)

        # Best-effort cleanup of tmp files.
        for p in part_paths:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                continue
        return asset.id

    async def abort(self, *, upload_id: UUID, org_id: UUID) -> UploadSessionRecord:
        session = await self.repo.get_session(upload_id=upload_id, org_id=org_id)
        if session is None:
            raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")
        await self.repo.set_session_status(session, status=UploadStatus.ABORTED)

        # Best-effort cleanup: remove directory under tmp if present.
        # This is safe because we scope by org_id and upload_id in object_key.
        upload_dir = safe_object_key_to_path(
            self.settings.storage.local_tmp_dir,
            f"org/{org_id}/uploads/{upload_id}",
        )
        try:
            if upload_dir.is_dir():
                for child in upload_dir.rglob("*"):
                    if child.is_file():
                        child.unlink(missing_ok=True)
                for child in sorted(upload_dir.rglob("*"), reverse=True):
                    if child.is_dir():
                        child.rmdir()
                upload_dir.rmdir()
        except Exception:
            pass
        return session

    async def post_process_asset(self, *, org_id: UUID, asset_id: UUID) -> None:
        """
        Best-effort background post-processing.

        Current scope:
        - Generate image thumbnails (variants) to reduce bandwidth for the asset library waterfall view.
        """

        asset = await AssetRecord.get_or_none(id=asset_id, org_id=org_id, deleted_at=None)
        if asset is None:
            return

        # Only local provider for now.
        if asset.storage_provider != "local":
            return

        # Skip if already generated.
        if isinstance(asset.variants, dict) and asset.variants.get("thumbnails"):
            return

        ext = (asset.ext or "").lstrip(".").lower()
        if not ((asset.mime or "").startswith("image/") or ext in _IMAGE_EXTS):
            return

        in_path = safe_object_key_to_path(self.settings.storage.local_root_dir, asset.object_key)
        if not in_path.is_file():
            return

        def _out_path_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
            out_ext = "png" if alpha else "jpg"
            key = f"org/{org_id}/assets/{asset_id}/thumb-{width}.{out_ext}"
            return safe_object_key_to_path(self.settings.storage.local_root_dir, key), key

        try:
            variants_payload, meta_payload = generate_image_thumbnails(
                in_path=in_path,
                out_path_for_width=_out_path_for_width,
                widths=[320, 640],
            )
        except Exception as exc:
            logger.warning(
                "Asset thumbnail generation failed",
                asset_id=str(asset_id),
                org_id=str(org_id),
                error=str(exc),
            )
            return

        variants: dict = asset.variants if isinstance(asset.variants, dict) else {}
        variants.update(variants_payload)

        meta: dict = asset.meta if isinstance(asset.meta, dict) else {}
        meta.update(meta_payload)

        asset.variants = variants
        asset.meta = meta
        await asset.save(update_fields=["variants", "meta", "updated_at"])
