from __future__ import annotations

import json
import shutil
import time
import zipfile
from pathlib import Path

from fastapi import UploadFile

from apps.api.src.common.utils.ids import uuid7
from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.modules.system.plugins_manager.install.files.service import PathUpload
from apps.api.src.modules.system.plugins_manager.install.shared.service import _tp, logger
from apps.api.src.plugin.manifest import PluginManifest


class PluginInstallStagingMixin:
    root_dir: Path
    manager: object

    async def validate_upload_to_staging(
        self,
        *,
        file: UploadFile,
        checksum: str | None,
        ttl_seconds: int = 10 * 60,
    ) -> tuple[str, str, int, PluginManifest]:
        if not file.filename:
            raise BadRequest(message=_tp("PLUGIN_PACKAGE_REQUIRED", "缺少插件包文件"), error="PLUGIN_PACKAGE_REQUIRED")
        raw_filename = file.filename
        filename = self._sanitize_upload_filename(raw_filename)
        if not filename.endswith(".zip"):
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"), error="PLUGIN_PACKAGE_INVALID"
            )

        token = uuid7().hex
        staging_dir = self.root_dir / ".staging" / "validate" / token
        staging_dir.mkdir(parents=True, exist_ok=True)
        zip_path = staging_dir / filename

        sha256, size = await self._save_upload(file, zip_path, max_bytes=self.settings.plugin.package_max_zip_bytes)
        if checksum and checksum.lower() != sha256:
            raise BadRequest(
                message=_tp("PLUGIN_CHECKSUM_MISMATCH", "插件包校验失败"), error="PLUGIN_CHECKSUM_MISMATCH"
            )

        manifest = self._validate_zip(zip_path)
        self._assert_safe_plugin_target_dir(manifest.plugin.id)

        entry_root = self._get_entry_root(manifest)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                names = [n.replace("\\\\", "/") for n in zf.namelist() if n]
        except zipfile.BadZipFile as exc:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
                details=str(exc),
            ) from exc

        has_entry = any(n.startswith(f"{entry_root}/") for n in names) or any(
            n.startswith(f"src/{entry_root}/") for n in names
        )
        if not has_entry:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_MISSING", "插件包缺少主包目录"), error="PLUGIN_PACKAGE_MISSING"
            )

        if self.manager is not None:
            if not self.manager.descriptors:
                self.manager.discover()
            slug = manifest.plugin.slug
            owner = self.manager.slug_to_id.get(slug)
            if owner and owner != manifest.plugin.id:
                raise BadRequest(
                    message=_tp("PLUGIN_SLUG_CONFLICT", "插件 slug 冲突"),
                    error="PLUGIN_SLUG_CONFLICT",
                    details={"slug": slug, "conflicts_with": owner},
                )

        meta = {
            "token": token,
            "filename": filename,
            "sha256": sha256,
            "size": int(size),
            "created_at": int(time.time()),
            "ttl_seconds": int(ttl_seconds),
        }
        try:
            (staging_dir / "validate.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        except (OSError, TypeError, ValueError) as exc:
            logger.warning(
                "Plugin validate metadata write failed",
                token=token,
                staging_dir=str(staging_dir),
                action="write_validate_metadata",
                error=str(exc),
            )

        return token, sha256, int(size), manifest

    async def install_from_staging_token(
        self,
        *,
        token: str,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        raw = (token or "").strip().lower()
        if not raw or any(c not in "0123456789abcdef" for c in raw):
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"), error="PLUGIN_VALIDATE_TOKEN_INVALID"
            )

        staging_dir = self.root_dir / ".staging" / "validate" / raw
        if not staging_dir.is_dir():
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"), error="PLUGIN_VALIDATE_TOKEN_INVALID"
            )

        meta_path = staging_dir / "validate.json"
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
        except (OSError, TypeError, ValueError) as exc:
            logger.warning(
                "Plugin validate metadata read failed",
                token=raw,
                meta_path=str(meta_path),
                action="read_validate_metadata",
                error=str(exc),
            )
            meta = {}

        created_at = int(meta.get("created_at") or 0) if isinstance(meta, dict) else 0
        ttl = int(meta.get("ttl_seconds") or 0) if isinstance(meta, dict) else 0
        if created_at and ttl and int(time.time()) > created_at + ttl:
            shutil.rmtree(staging_dir, ignore_errors=True)
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_EXPIRED", "校验令牌已过期"), error="PLUGIN_VALIDATE_TOKEN_EXPIRED"
            )

        filename = str(meta.get("filename") or "") if isinstance(meta, dict) else ""
        sha256 = str(meta.get("sha256") or "") if isinstance(meta, dict) else ""

        zips = sorted(staging_dir.glob("*.zip"))
        zip_path = zips[0] if zips else None
        if zip_path is None or not zip_path.is_file():
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"), error="PLUGIN_VALIDATE_TOKEN_INVALID"
            )

        upload = PathUpload(zip_path, filename_override=filename if filename else None)
        try:
            return await self.install_plugin(file=upload, checksum=sha256 or None, enable=enable)
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)
