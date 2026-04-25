from __future__ import annotations

import asyncio
import mimetypes
import os
import re
import shutil
from pathlib import Path

from src.common.utils.ids import uuid7
from src.platform.storage.providers.base import ObjectGet, ObjectHead, ObjectStorageProvider

_SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def safe_object_key_to_path(root_dir: Path, object_key: str) -> Path:
    """
    Convert a storage object key to a local filesystem path under root_dir.

    Security properties:
    - Rejects absolute paths.
    - Rejects path traversal segments ("..").
    - Normalizes backslashes to forward slashes (Windows-style inputs).
    """

    if not object_key:
        raise ValueError("object_key is required")

    key = object_key.strip().replace("\\", "/")
    if not key or key.startswith("/"):
        raise ValueError("absolute paths are not allowed")

    # Normalize and validate segments. We keep this intentionally strict: storage keys
    # should be ASCII and predictable across providers.
    parts = [p for p in key.split("/") if p]
    if not parts:
        raise ValueError("invalid object_key")

    for part in parts:
        if part in {".", ".."}:
            raise ValueError("path traversal is not allowed")
        if "\x00" in part:
            raise ValueError("null bytes are not allowed")
        # Allow bucket-like prefixes and filenames; keep segments strict to avoid edge cases.
        if not _SAFE_SEGMENT_RE.match(part):
            raise ValueError("invalid object_key segment")

    root = root_dir.resolve()
    out = (root / Path(*parts)).resolve()
    try:
        out.relative_to(root)
    except ValueError as exc:  # pragma: no cover
        raise ValueError("object_key escapes root_dir") from exc
    return out


class LocalStorageProvider(ObjectStorageProvider):
    """
    Minimal local filesystem storage provider (phase 1).

    Notes:
    - Intended for single-machine deployments (multi-worker is OK).
    - For multi-node deployments, use an object storage provider (S3-compatible).
    """

    def __init__(self, config) -> None:
        super().__init__(config)
        if config.local_root_dir is None:
            raise ValueError("local_root_dir is required for local storage profiles")
        self.root_dir = Path(config.local_root_dir)
        self.tmp_dir = Path(config.local_tmp_dir) if config.local_tmp_dir is not None else None

    def with_bucket(self, bucket: str) -> LocalStorageProvider:
        _ = bucket
        return LocalStorageProvider(self.config)

    def exists(self, *, object_key: str) -> bool:
        path = safe_object_key_to_path(self.root_dir, object_key)
        return path.is_file()

    def read_bytes(self, *, object_key: str) -> bytes:
        path = safe_object_key_to_path(self.root_dir, object_key)
        return path.read_bytes()

    def put_bytes(self, *, object_key: str, data: bytes) -> None:
        path = safe_object_key_to_path(self.root_dir, object_key)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write to a temp file in the same directory, then replace atomically.
        tmp = path.with_name(f".partial.{path.name}.{uuid7().hex}")
        try:
            with open(tmp, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        finally:
            try:
                if tmp.exists():
                    tmp.unlink()
            except OSError:
                # Best-effort cleanup; leaving a .partial file is acceptable and can be GC'd later.
                pass

    async def head_object(self, *, object_key: str) -> ObjectHead:
        def _call() -> ObjectHead:
            path = safe_object_key_to_path(self.root_dir, object_key)
            stat = path.stat()
            content_type, _ = mimetypes.guess_type(path.name)
            return ObjectHead(size_bytes=int(stat.st_size), content_type=content_type, etag=None)

        return await asyncio.to_thread(_call)

    async def get_object(self, *, object_key: str, byte_range: tuple[int, int] | None) -> ObjectGet:
        def _call() -> ObjectGet:
            path = safe_object_key_to_path(self.root_dir, object_key)
            data = path.read_bytes()
            if byte_range is not None:
                start, end = byte_range
                data = data[int(start) : int(end) + 1]
            content_type, _ = mimetypes.guess_type(path.name)
            return ObjectGet(
                body=data,
                content_type=content_type,
                content_length=len(data),
                etag=None,
            )

        return await asyncio.to_thread(_call)

    async def download_object_to_path(self, *, object_key: str, out_path: Path) -> ObjectHead:
        def _call() -> ObjectHead:
            src = safe_object_key_to_path(self.root_dir, object_key)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, out_path)
            stat = src.stat()
            content_type, _ = mimetypes.guess_type(src.name)
            return ObjectHead(size_bytes=int(stat.st_size), content_type=content_type, etag=None)

        return await asyncio.to_thread(_call)

    async def put_object_bytes(
        self,
        *,
        object_key: str,
        data: bytes,
        content_type: str | None,
        cache_control: str | None = None,
    ) -> None:
        _ = content_type, cache_control
        await asyncio.to_thread(self.put_bytes, object_key=object_key, data=data)

    async def copy_object_from(
        self,
        *,
        source_bucket: str,
        source_key: str,
        dest_key: str,
    ) -> None:
        _ = source_bucket

        def _call() -> None:
            src = safe_object_key_to_path(self.root_dir, source_key)
            dest = safe_object_key_to_path(self.root_dir, dest_key)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)

        await asyncio.to_thread(_call)

    async def delete_object(self, *, object_key: str) -> None:
        def _call() -> None:
            path = safe_object_key_to_path(self.root_dir, object_key)
            path.unlink(missing_ok=True)

        await asyncio.to_thread(_call)
