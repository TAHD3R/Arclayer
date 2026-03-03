from __future__ import annotations

import stat
import zipfile
from pathlib import Path

import tomllib
from pydantic import ValidationError

from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.plugins_manager.install.shared.service import _tp
from apps.api.src.plugin.manifest import PluginManifest


class PluginInstallArchiveMixin:
    settings: object

    def _validate_zip(self, zip_path: Path) -> PluginManifest:
        try:
            with zipfile.ZipFile(zip_path) as zf:
                names = zf.namelist()
                if "plugin.toml" not in names:
                    raise BadRequest(
                        message=_tp("PLUGIN_TOML_MISSING", "插件包缺少 plugin.toml"),
                        error="PLUGIN_TOML_MISSING",
                    )

                try:
                    manifest = self._load_manifest_from_zip(zf)
                    self._validate_manifest(manifest)
                    return manifest
                except BadRequest:
                    raise
                except ValidationError as exc:
                    error = "PLUGIN_MANIFEST_INVALID"
                    default = "插件清单不合法"
                    for err in exc.errors():
                        loc = tuple(err.get("loc") or ())
                        msg = str(err.get("msg") or "")
                        if loc[:2] == ("plugin", "id"):
                            if "PLUGIN_ID_RESERVED" in msg:
                                error = "PLUGIN_ID_RESERVED"
                                default = "插件 ID 被保留"
                            else:
                                error = "PLUGIN_ID_INVALID"
                                default = "插件 ID 不合法"
                            break
                    raise BadRequest(
                        message=_tp(error, default), error=error, details={"errors": exc.errors()}
                    ) from exc
                except (tomllib.TOMLDecodeError, UnicodeDecodeError, OSError) as exc:
                    raise BadRequest(
                        message=_tp("PLUGIN_MANIFEST_INVALID", "插件清单不合法"),
                        error="PLUGIN_MANIFEST_INVALID",
                        details=str(exc),
                    ) from exc
        except zipfile.BadZipFile as exc:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
                details=str(exc),
            ) from exc

    def _load_manifest_from_zip(self, zf: zipfile.ZipFile) -> PluginManifest:
        raw = zf.read("plugin.toml")
        payload = tomllib.loads(raw.decode("utf-8"))
        return PluginManifest.model_validate(payload)

    def _validate_manifest(self, manifest: PluginManifest) -> None:
        self._get_entry_root(manifest)

    def _get_entry_root(self, manifest: PluginManifest) -> str:
        entrypoint = manifest.plugin.entrypoint
        entry_module = entrypoint.split(":", 1)[0]
        entry_root = entry_module.split(".", 1)[0]
        if not entry_root:
            raise BadRequest(
                message=_tp("PLUGIN_ENTRYPOINT_INVALID", "插件入口不合法"),
                error="PLUGIN_ENTRYPOINT_INVALID",
            )
        return entry_root

    def _safe_extract(self, zf: zipfile.ZipFile, target: Path) -> None:
        max_files = int(getattr(getattr(self.settings, "plugin", object()), "package_max_files", 0) or 0)
        max_total = int(
            getattr(getattr(self.settings, "plugin", object()), "package_max_total_uncompressed_bytes", 0) or 0
        )
        max_single = int(getattr(getattr(self.settings, "plugin", object()), "package_max_single_file_bytes", 0) or 0)

        target_resolved = target.resolve()
        total_uncompressed = 0
        file_count = 0
        total_written = 0

        for member in zf.infolist():
            raw_name = member.filename
            name = raw_name.replace("\\", "/")
            if not name:
                continue
            if name.startswith("/"):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"), error="PLUGIN_PACKAGE_INVALID"
                )

            normalized = Path(name)
            if ".." in normalized.parts:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"), error="PLUGIN_PACKAGE_INVALID"
                )

            resolved = (target / normalized).resolve()
            if not self._is_relative_to(resolved, target_resolved):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"), error="PLUGIN_PACKAGE_INVALID"
                )

            if member.is_dir():
                resolved.mkdir(parents=True, exist_ok=True)
                continue

            if self._is_symlink(member):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_HAS_SYMLINK", "插件包包含不安全的符号链接"),
                    error="PLUGIN_PACKAGE_HAS_SYMLINK",
                )

            file_count += 1
            if max_files and file_count > max_files:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_TOO_MANY_FILES", "插件包文件过多"),
                    error="PLUGIN_PACKAGE_TOO_MANY_FILES",
                    details={"max_files": max_files, "files": file_count},
                )

            file_size = int(getattr(member, "file_size", 0) or 0)
            if max_single and file_size > max_single:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_FILE_TOO_LARGE", "插件包文件过大"),
                    error="PLUGIN_PACKAGE_FILE_TOO_LARGE",
                    details={"max_bytes": max_single, "size": file_size, "path": raw_name},
                )

            total_uncompressed += file_size
            if max_total and total_uncompressed > max_total:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE", "插件包解压后体积过大"),
                    error="PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE",
                    details={"max_bytes": max_total, "size": total_uncompressed},
                )

            resolved.parent.mkdir(parents=True, exist_ok=True)
            written = 0
            with zf.open(member, "r") as src, resolved.open("wb") as dst:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    written += len(chunk)
                    total_written += len(chunk)
                    if max_single and written > max_single:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_FILE_TOO_LARGE", "插件包文件过大"),
                            error="PLUGIN_PACKAGE_FILE_TOO_LARGE",
                            details={"max_bytes": max_single, "size": written, "path": raw_name},
                        )
                    if max_total and total_written > max_total:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE", "插件包解压后体积过大"),
                            error="PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE",
                            details={"max_bytes": max_total, "size": total_written},
                        )

    @staticmethod
    def _is_relative_to(path: Path, base: Path) -> bool:
        try:
            return path.is_relative_to(base)
        except AttributeError:
            return str(path).startswith(str(base))

    @staticmethod
    def _is_symlink(info: zipfile.ZipInfo) -> bool:
        mode = (info.external_attr >> 16) & 0o170000
        return mode == stat.S_IFLNK
