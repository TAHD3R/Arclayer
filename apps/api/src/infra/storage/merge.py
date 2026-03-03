from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable
from pathlib import Path

from apps.api.src.common.utils.ids import uuid7


def merge_parts_to_file(*, part_paths: Iterable[Path], out_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """
    Merge part files into a single file and return the SHA-256 hex digest.

    Notes:
    - Writes to a sibling temporary file and replaces atomically.
    - Callers can compare the digest with an expected checksum for integrity.
    """

    out_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_path = out_path.with_name(f".partial.{out_path.name}.{uuid7().hex}")
    hasher = hashlib.sha256()
    try:
        with open(tmp_path, "wb") as out:
            for part in part_paths:
                with open(part, "rb") as f:
                    while True:
                        buf = f.read(chunk_size)
                        if not buf:
                            break
                        out.write(buf)
                        hasher.update(buf)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp_path, out_path)
        return hasher.hexdigest()
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
