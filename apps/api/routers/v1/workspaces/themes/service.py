from __future__ import annotations

import json
import mimetypes
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from starlette.responses import RedirectResponse, Response

from apps.api.common.services.base import BaseService
from apps.api.common.utils.assets import build_asset_object_key, slugify
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.http.content_disposition import build_attachment_content_disposition
from apps.api.core.http.file_stream import stream_file_response
from apps.api.infra.storage.factory import build_storage_provider, build_storage_provider_for
from apps.api.infra.storage.local import LocalStorageProvider, safe_object_key_to_path
from apps.api.infra.storage.s3 import S3StorageProvider
from apps.api.models.asset import AssetPurpose, AssetRecord, AssetVisibility
from apps.api.models.setting import SettingRecord
from apps.api.routers.v1.workspaces.themes.repository import WorkspaceThemesRepository
from apps.api.routers.v1.workspaces.themes.schema import (
    ThemeManifestIn,
    ThemeVariantPayloadIn,
    WorkspaceThemeOut,
)
from apps.api.settings.runtime import get_effective_settings
from apps.api.settings.scopes import SCOPE_TYPE_SITE

THEME_ACTIVE_NAMESPACE = "theme.active"

_FORBIDDEN_EXTS = {
    # Explicit v0 contract: theme packages must be static artifacts.
    ".js",
    ".ts",
    ".mjs",
    ".cjs",
    ".wasm",
}


def _normalize_zip_name(name: str) -> str:
    """
    Normalize a zip entry name (POSIX-style) and enforce a strict "no traversal" policy.
    """

    raw = (name or "").strip().replace("\\", "/")
    while raw.startswith("./"):
        raw = raw[2:]
    raw = raw.lstrip("/")
    if not raw:
        raise ValueError("invalid zip entry name")
    parts = [p for p in raw.split("/") if p]
    for p in parts:
        if p in {".", ".."}:
            raise ValueError("zip entry traversal is not allowed")
        if "\x00" in p:
            raise ValueError("zip entry contains null byte")
    return "/".join(parts)


def _detect_root_prefix(names: set[str]) -> str:
    """
    Support both:
    - manifest.json at archive root
    - single top-level folder containing manifest.json (common in theme zips)
    """

    if "manifest.json" in names:
        return ""

    candidates = [n for n in names if n.endswith("/manifest.json")]
    prefixes = {c.split("/", 1)[0] for c in candidates if "/" in c}
    if len(prefixes) == 1:
        prefix = next(iter(prefixes))
        if f"{prefix}/manifest.json" in names:
            return f"{prefix}/"
    raise ValueError("manifest.json not found at archive root")


def _join_under_prefix(*, prefix: str, rel: str) -> str:
    s = (rel or "").strip().replace("\\", "/")
    while s.startswith("./"):
        s = s[2:]
    s = s.lstrip("/")
    if not s:
        raise ValueError("invalid path in manifest")
    # Validate path parts to avoid traversal (same as zip entry checks).
    _normalize_zip_name(s)
    return f"{prefix}{s}" if prefix else s


def _guess_mime(path: str, *, fallback: str) -> str:
    mime, _enc = mimetypes.guess_type(path)
    return mime or fallback


@dataclass(frozen=True)
class _ExtractedEntrypoints:
    tokens_css_bytes: bytes
    base_css_bytes: bytes | None
    preview_image_bytes: bytes | None
    preview_image_ext: str | None


class WorkspaceThemesService(BaseService):
    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.repo = WorkspaceThemesRepository()

    async def list_themes(self, *, workspace_id: UUID) -> list[WorkspaceThemeOut]:
        rows = await self.repo.list_theme_packages(workspace_id=workspace_id)
        return [self._to_out(x) for x in rows]

    async def get_theme(self, *, workspace_id: UUID, theme_id: str, version: str) -> WorkspaceThemeOut:
        rec = await self.repo.get_theme_package(workspace_id=workspace_id, theme_id=theme_id, version=version)
        if rec is None:
            raise NotFound(message="Theme not found", error="THEME_NOT_FOUND")
        return self._to_out(rec)

    async def import_theme_from_asset(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
        asset_id: UUID,
    ) -> WorkspaceThemeOut:
        asset = await self.repo.get_zip_asset(workspace_id=workspace_id, asset_id=asset_id)
        if asset is None:
            raise NotFound(message="Zip asset not found", error="THEME_IMPORT_ASSET_NOT_FOUND")
        if (asset.ext or "").lower().lstrip(".") != "zip":
            raise BadRequest(message="Theme package must be a .zip file", error="THEME_IMPORT_NOT_ZIP")

        zip_path = await self._materialize_asset_to_local_path(asset)

        try:
            manifest, variants_payload, presets_payload, entrypoints = self._read_and_validate_theme_zip(zip_path)
        except BadRequest:
            raise
        except Exception as exc:
            # Keep the external error stable; log the details.
            self.logger.warning("theme_import_failed", extra={"asset_id": str(asset_id), "error": str(exc)})
            raise BadRequest(message="Invalid theme package", error="THEME_IMPORT_INVALID") from None

        # Ensure uniqueness (workspace-scoped).
        existing = await self.repo.get_theme_package(
            workspace_id=workspace_id, theme_id=manifest.theme_id, version=manifest.version
        )
        if existing is not None:
            raise Conflict(
                message="Theme already installed",
                error="THEME_ALREADY_INSTALLED",
                meta={"themeId": manifest.theme_id, "version": manifest.version},
            )

        # Persist as immutable assets:
        # - artifact zip (private)
        # - tokens/base css + preview image (public, immutable caching)
        artifact_asset_id = await self._store_artifact_zip(
            workspace_id=workspace_id,
            src_zip_path=zip_path,
            checksum_sha256=asset.checksum_sha256,
        )
        tokens_css_asset_id = await self._store_public_asset(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            title=f"{manifest.theme_id}@{manifest.version} tokens.css",
            ext="css",
            mime="text/css",
            data=entrypoints.tokens_css_bytes,
        )
        base_css_asset_id: UUID | None = None
        if entrypoints.base_css_bytes is not None:
            base_css_asset_id = await self._store_public_asset(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                title=f"{manifest.theme_id}@{manifest.version} base.css",
                ext="css",
                mime="text/css",
                data=entrypoints.base_css_bytes,
            )
        preview_image_asset_id: UUID | None = None
        if entrypoints.preview_image_bytes is not None:
            ext = (entrypoints.preview_image_ext or "png").lstrip(".").lower() or "png"
            preview_image_asset_id = await self._store_public_asset(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                title=f"{manifest.theme_id}@{manifest.version} preview.{ext}",
                ext=ext,
                mime=_guess_mime(f"preview.{ext}", fallback="application/octet-stream"),
                data=entrypoints.preview_image_bytes,
            )

        created = await self.repo.create_theme_package(
            workspace_id=workspace_id,
            theme_id=manifest.theme_id,
            version=manifest.version,
            name=manifest.name,
            description=manifest.description,
            author=manifest.author,
            manifest=json.loads(manifest.model_dump_json(by_alias=True)),
            artifact_hash=(asset.checksum_sha256 or None),
            artifact_asset_id=artifact_asset_id,
            tokens_css_asset_id=tokens_css_asset_id,
            base_css_asset_id=base_css_asset_id,
            preview_image_asset_id=preview_image_asset_id,
            presets=presets_payload,
            variants=variants_payload,
            created_by=actor_user_id,
        )
        return self._to_out(created)

    async def delete_theme(self, *, workspace_id: UUID, theme_id: str, version: str) -> None:
        # Prevent uninstall if any site in the workspace is using this theme.
        sites = await self.repo.list_sites_by_workspace(workspace_id=workspace_id)
        site_ids = [s.id for s in sites]
        if site_ids:
            rows = await SettingRecord.filter(
                scope_type=SCOPE_TYPE_SITE,
                scope_id__in=site_ids,
                namespace=THEME_ACTIVE_NAMESPACE,
            ).all()
            for r in rows:
                if not isinstance(r.value, dict):
                    continue
                if str(r.value.get("themeId") or "") == theme_id and str(r.value.get("version") or "") == version:
                    raise Conflict(
                        message="Theme is in use by at least one site",
                        error="THEME_IN_USE",
                        meta={"siteId": str(r.scope_id)},
                    )

        deleted = await self.repo.delete_theme_package(workspace_id=workspace_id, theme_id=theme_id, version=version)
        if deleted <= 0:
            raise NotFound(message="Theme not found", error="THEME_NOT_FOUND")

    async def download_theme_artifact(self, *, workspace_id: UUID, theme_id: str, version: str) -> Response:
        rec = await self.repo.get_theme_package(workspace_id=workspace_id, theme_id=theme_id, version=version)
        if rec is None or rec.artifact_asset_id is None:
            raise NotFound(message="Theme not found", error="THEME_NOT_FOUND")

        asset = await AssetRecord.get_or_none(id=rec.artifact_asset_id, workspace_id=workspace_id, deleted_at=None)
        if asset is None:
            raise NotFound(message="Theme artifact not found", error="THEME_ARTIFACT_NOT_FOUND")

        filename = f"{theme_id.replace('/', '__')}@{version}.zip"
        disposition = build_attachment_content_disposition(filename)

        if str(asset.storage_provider) == "s3":
            effective = await get_effective_settings(self.settings)
            try:
                provider = build_storage_provider_for(effective, provider="s3")
            except Exception:
                raise NotFound(message="Theme artifact not found", error="THEME_ARTIFACT_NOT_FOUND")
            if not isinstance(provider, S3StorageProvider):
                raise NotFound(message="Theme artifact not found", error="THEME_ARTIFACT_NOT_FOUND")
            url = await provider.presign_get_object(
                object_key=asset.object_key,
                expires_in=900,
                response_content_type="application/zip",
                response_content_disposition=disposition,
            )
            return RedirectResponse(url=url, status_code=302, headers={"Cache-Control": "private, max-age=60"})

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, asset.object_key)
        if not path.is_file():
            raise NotFound(message="Theme artifact not found", error="THEME_ARTIFACT_NOT_FOUND")

        return await stream_file_response(
            path=path,
            content_type="application/zip",
            range_header=None,
            extra_headers={
                "Cache-Control": "private, max-age=60",
                "Content-Disposition": disposition,
            },
        )

    # ---- internal helpers ----

    def _to_out(self, rec) -> WorkspaceThemeOut:
        return WorkspaceThemeOut(
            themeId=str(rec.theme_id),
            version=str(rec.version),
            name=rec.name,
            description=rec.description,
            artifactHash=rec.artifact_hash,
            artifactAssetId=rec.artifact_asset_id,
            tokensCssAssetId=rec.tokens_css_asset_id,
            baseCssAssetId=rec.base_css_asset_id,
            previewImageAssetId=rec.preview_image_asset_id,
            presets=rec.presets if isinstance(rec.presets, dict) else None,
            variants=rec.variants if isinstance(rec.variants, dict) else None,
            manifest=rec.manifest if isinstance(rec.manifest, dict) else {},
        )

    async def _materialize_asset_to_local_path(self, asset: AssetRecord) -> Path:
        if str(asset.storage_provider) == "s3":
            effective = await get_effective_settings(self.settings)
            try:
                provider = build_storage_provider_for(effective, provider="s3")
            except Exception:
                raise NotFound(message="Theme import asset not accessible", error="THEME_IMPORT_STORAGE_UNAVAILABLE")
            if not isinstance(provider, S3StorageProvider):
                raise NotFound(message="Theme import asset not accessible", error="THEME_IMPORT_STORAGE_UNAVAILABLE")

            out_path = (
                self.settings.storage.local_tmp_dir / "themes" / "imports" / f"{asset.workspace_id}" / f"{asset.id}.zip"
            )
            await provider.download_object_to_path(object_key=asset.object_key, out_path=out_path)
            return out_path

        root_dir = self.settings.storage.local_root_dir
        return safe_object_key_to_path(root_dir, asset.object_key)

    def _read_and_validate_theme_zip(
        self, zip_path: Path
    ) -> tuple[ThemeManifestIn, dict[str, Any] | None, dict[str, Any] | None, _ExtractedEntrypoints]:
        if not zip_path.is_file():
            raise BadRequest(message="Theme package file not found", error="THEME_IMPORT_FILE_NOT_FOUND")

        # Size guardrail: avoid reading huge archives into memory during import.
        size = zip_path.stat().st_size
        max_bytes = int(self.settings.storage.upload_max_file_size_mb) * 1024 * 1024
        if max_bytes > 0 and size > max_bytes:
            raise BadRequest(message="Theme package too large", error="THEME_IMPORT_TOO_LARGE")

        with zipfile.ZipFile(zip_path, "r") as zf:
            raw_names = [n for n in zf.namelist() if n and not n.endswith("/")]
            names: set[str] = set()
            for n in raw_names:
                nn = _normalize_zip_name(n)
                ext = Path(nn).suffix.lower()
                if ext in _FORBIDDEN_EXTS:
                    raise BadRequest(
                        message="Executable files are forbidden in theme packages (v0)",
                        error="THEME_IMPORT_FORBIDDEN_FILE",
                        meta={"path": nn},
                    )
                names.add(nn)

            prefix = _detect_root_prefix(names)

            manifest_path = _join_under_prefix(prefix=prefix, rel="manifest.json")
            if manifest_path not in names:
                raise BadRequest(message="manifest.json not found", error="THEME_IMPORT_MANIFEST_NOT_FOUND")

            manifest_raw = zf.read(manifest_path)
            try:
                manifest_obj = json.loads(manifest_raw.decode("utf-8"))
            except Exception:
                raise BadRequest(message="manifest.json must be valid JSON", error="THEME_IMPORT_MANIFEST_INVALID")

            try:
                manifest = ThemeManifestIn.model_validate(manifest_obj)
            except Exception as exc:
                raise BadRequest(
                    message="manifest.json validation failed",
                    error="THEME_IMPORT_MANIFEST_VALIDATION_FAILED",
                    meta={"reason": str(exc)},
                )

            # Entrypoints (required tokens.css).
            tokens_css_path = _join_under_prefix(prefix=prefix, rel=manifest.entrypoints.tokens_css)
            if tokens_css_path not in names:
                raise BadRequest(message="tokensCss not found", error="THEME_IMPORT_TOKENS_CSS_NOT_FOUND")
            if Path(tokens_css_path).suffix.lower() != ".css":
                raise BadRequest(message="tokensCss must be a .css file", error="THEME_IMPORT_TOKENS_CSS_INVALID")
            tokens_css_bytes = zf.read(tokens_css_path)

            base_css_bytes: bytes | None = None
            if manifest.entrypoints.base_css:
                base_css_path = _join_under_prefix(prefix=prefix, rel=manifest.entrypoints.base_css)
                if base_css_path not in names:
                    raise BadRequest(message="baseCss not found", error="THEME_IMPORT_BASE_CSS_NOT_FOUND")
                if Path(base_css_path).suffix.lower() != ".css":
                    raise BadRequest(message="baseCss must be a .css file", error="THEME_IMPORT_BASE_CSS_INVALID")
                base_css_bytes = zf.read(base_css_path)

            preview_bytes: bytes | None = None
            preview_ext: str | None = None
            if manifest.entrypoints.preview_image:
                preview_path = _join_under_prefix(prefix=prefix, rel=manifest.entrypoints.preview_image)
                if preview_path not in names:
                    raise BadRequest(message="previewImage not found", error="THEME_IMPORT_PREVIEW_NOT_FOUND")
                preview_ext = Path(preview_path).suffix.lstrip(".").lower() or None
                preview_bytes = zf.read(preview_path)

            # Variants (optional) - validate using PageRevision subset schema.
            variants_payload: dict[str, Any] | None = None
            if manifest.variants:
                variants_payload = {}
                seen: set[str] = set()
                for decl in manifest.variants:
                    if decl.variant_id in seen:
                        raise BadRequest(
                            message="Duplicate variantId",
                            error="THEME_IMPORT_VARIANT_DUPLICATE",
                            meta={"variantId": decl.variant_id},
                        )
                    seen.add(decl.variant_id)
                    var_path = _join_under_prefix(prefix=prefix, rel=decl.path)
                    if var_path not in names:
                        raise BadRequest(
                            message="Variant file not found",
                            error="THEME_IMPORT_VARIANT_FILE_NOT_FOUND",
                            meta={"variantId": decl.variant_id, "path": decl.path},
                        )
                    try:
                        var_obj = json.loads(zf.read(var_path).decode("utf-8"))
                    except Exception:
                        raise BadRequest(
                            message="Variant JSON must be valid",
                            error="THEME_IMPORT_VARIANT_JSON_INVALID",
                            meta={"variantId": decl.variant_id},
                        )
                    try:
                        payload = ThemeVariantPayloadIn.model_validate(var_obj)
                    except Exception as exc:
                        raise BadRequest(
                            message="Variant payload validation failed",
                            error="THEME_IMPORT_VARIANT_VALIDATION_FAILED",
                            meta={"variantId": decl.variant_id, "reason": str(exc)},
                        )
                    variants_payload[decl.variant_id] = json.loads(payload.model_dump_json(by_alias=True))

            # Presets (optional) - store raw JSON objects, validation can be phased in.
            presets_payload: dict[str, Any] | None = None
            if manifest.presets:
                presets_payload = {}
                seen_p: set[str] = set()
                for decl in manifest.presets:
                    if decl.id in seen_p:
                        raise BadRequest(
                            message="Duplicate preset id",
                            error="THEME_IMPORT_PRESET_DUPLICATE",
                            meta={"presetId": decl.id},
                        )
                    seen_p.add(decl.id)
                    p_path = _join_under_prefix(prefix=prefix, rel=decl.path)
                    if p_path not in names:
                        raise BadRequest(
                            message="Preset file not found",
                            error="THEME_IMPORT_PRESET_FILE_NOT_FOUND",
                            meta={"presetId": decl.id, "path": decl.path},
                        )
                    try:
                        obj = json.loads(zf.read(p_path).decode("utf-8"))
                    except Exception:
                        raise BadRequest(
                            message="Preset JSON must be valid",
                            error="THEME_IMPORT_PRESET_JSON_INVALID",
                            meta={"presetId": decl.id},
                        )
                    if not isinstance(obj, dict):
                        raise BadRequest(
                            message="Preset JSON must be an object",
                            error="THEME_IMPORT_PRESET_INVALID",
                            meta={"presetId": decl.id},
                        )
                    presets_payload[decl.id] = obj

        entrypoints = _ExtractedEntrypoints(
            tokens_css_bytes=tokens_css_bytes,
            base_css_bytes=base_css_bytes,
            preview_image_bytes=preview_bytes,
            preview_image_ext=preview_ext,
        )
        return manifest, variants_payload, presets_payload, entrypoints

    async def _store_public_asset(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
        title: str,
        ext: str,
        mime: str,
        data: bytes,
    ) -> UUID:
        from apps.api.common.utils.ids import uuid7

        asset_id = uuid7()
        object_key = build_asset_object_key(workspace_id=workspace_id, asset_id=asset_id, ext=ext)

        provider = build_storage_provider(self.settings)
        await self._put_bytes(
            provider=provider,
            object_key=object_key,
            data=data,
            content_type=mime,
            public_read=True,
            cache_control="public, max-age=31536000, immutable",
        )

        checksum = _sha256_hex(data)
        slug = slugify(title)
        await AssetRecord.create(
            id=asset_id,
            workspace_id=workspace_id,
            owner_user_id=actor_user_id,
            purpose=AssetPurpose.LIBRARY,
            visibility=AssetVisibility.PUBLIC,
            indexable=False,
            title=title,
            slug=slug,
            original_filename=f"{slug}.{ext}",
            mime=mime,
            ext=ext,
            size_bytes=len(data),
            checksum_sha256=checksum,
            storage_provider=getattr(provider, "provider", "local"),
            object_key=object_key,
            variants=None,
            meta={"kind": "theme_entrypoint"},
            deleted_at=None,
        )
        return asset_id

    async def _store_artifact_zip(self, *, workspace_id: UUID, src_zip_path: Path, checksum_sha256: str | None) -> UUID:
        from apps.api.common.utils.ids import uuid7

        asset_id = uuid7()
        object_key = build_asset_object_key(workspace_id=workspace_id, asset_id=asset_id, ext="zip")
        data = src_zip_path.read_bytes()
        provider = build_storage_provider(self.settings)
        await self._put_bytes(
            provider=provider,
            object_key=object_key,
            data=data,
            content_type="application/zip",
            public_read=False,
            cache_control=None,
        )
        await AssetRecord.create(
            id=asset_id,
            workspace_id=workspace_id,
            owner_user_id=None,
            purpose=AssetPurpose.LIBRARY,
            visibility=AssetVisibility.PRIVATE,
            indexable=False,
            title=f"theme-package-{asset_id}",
            slug=f"theme-package-{asset_id}",
            original_filename=f"theme-package-{asset_id}.zip",
            mime="application/zip",
            ext="zip",
            size_bytes=len(data),
            checksum_sha256=(checksum_sha256 or _sha256_hex(data)),
            storage_provider=getattr(provider, "provider", "local"),
            object_key=object_key,
            variants=None,
            meta={"kind": "theme_package_artifact"},
            deleted_at=None,
        )
        return asset_id

    async def _put_bytes(
        self,
        *,
        provider: Any,
        object_key: str,
        data: bytes,
        content_type: str | None,
        public_read: bool,
        cache_control: str | None,
    ) -> None:
        if isinstance(provider, LocalStorageProvider):
            provider.put_bytes(object_key=object_key, data=data)
            return
        if isinstance(provider, S3StorageProvider):
            await provider.put_object_bytes(
                object_key=object_key,
                data=data,
                content_type=content_type,
                public_read=public_read,
                cache_control=cache_control,
            )
            return
        raise RuntimeError("unknown storage provider")


def _sha256_hex(data: bytes) -> str:
    import hashlib

    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()
