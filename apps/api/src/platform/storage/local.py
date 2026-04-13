from __future__ import annotations

import os
import re
from pathlib import Path

from src.common.utils.ids import uuid7

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


class LocalStorageProvider:
    """
    Minimal local filesystem storage provider (phase 1).

    Notes:
    - Intended for single-machine deployments (multi-worker is OK).
    - For multi-node deployments, use an object storage provider (S3-compatible).
    """

    provider = "local"

    def __init__(self, *, root_dir: Path) -> None:
        self.root_dir = Path(root_dir)

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
