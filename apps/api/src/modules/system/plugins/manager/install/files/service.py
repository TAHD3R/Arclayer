from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Protocol

from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.plugins.manager.install.shared.service import _tp


class UploadLike(Protocol):
    filename: str | None

    async def read(self, size: int = -1) -> bytes: ...

    async def close(self) -> None: ...


class PathUpload:
    filename: str | None

    def __init__(self, path: Path, *, filename_override: str | None) -> None:
        self.filename = filename_override or path.name
        self._handle = path.open("rb")

    async def read(self, size: int = -1) -> bytes:
        return await asyncio.to_thread(self._handle.read, size)

    async def close(self) -> None:
        await asyncio.to_thread(self._handle.close)


class PluginInstallFilesMixin:
    def _sanitize_upload_filename(self, raw_filename: str) -> str:
        normalized = (raw_filename or "").replace("\\", "/")
        if ".." in Path(normalized).parts:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包文件名不合法"),
                error="PLUGIN_PACKAGE_INVALID",
                details={"filename": raw_filename},
            )
        filename = Path(normalized).name
        if not filename or filename in {".", ".."}:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包文件名不合法"),
                error="PLUGIN_PACKAGE_INVALID",
                details={"filename": raw_filename},
            )
        return filename

    async def _save_upload(self, file: UploadLike, dest: Path, *, max_bytes: int | None = None) -> tuple[str, int]:
        digest = hashlib.sha256()
        size = 0
        try:
            with dest.open("wb") as handle:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                    if max_bytes is not None and max_bytes > 0 and size > max_bytes:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_TOO_LARGE", "插件包过大"),
                            error="PLUGIN_PACKAGE_TOO_LARGE",
                            details={"max_bytes": int(max_bytes), "size": int(size)},
                        )
        finally:
            await file.close()
        return digest.hexdigest(), size
