from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable
from pathlib import Path

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class StagedFileOutcome(BaseSchema):
    """Verified claim-scoped file produced before canonical promotion."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    staging_path: Path
    checksum_sha256: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(..., ge=0)


class StagedPartChecksumMismatchError(ValueError):
    def __init__(self, *, part_path: Path, expected: str, actual: str) -> None:
        super().__init__(f"staged upload part checksum mismatch: {part_path}")
        self.part_path = part_path
        self.expected = expected
        self.actual = actual


def stage_parts_to_file(
    *,
    part_paths: Iterable[Path],
    staging_path: Path,
    expected_part_checksums: Iterable[str] | None = None,
    chunk_size: int = 1024 * 1024,
) -> StagedFileOutcome:
    """Merge immutable parts into one caller-owned staging path without promotion."""

    paths = tuple(part_paths)
    expected_checksums = tuple(expected_part_checksums) if expected_part_checksums is not None else None
    if expected_checksums is not None and len(expected_checksums) != len(paths):
        raise ValueError("expected_part_checksums must contain exactly one checksum per part path")

    staging_path.parent.mkdir(parents=True, exist_ok=True)
    hasher = hashlib.sha256()
    size_bytes = 0
    created = False
    try:
        output = staging_path.open("xb")
        created = True
        with output:
            for index, part in enumerate(paths):
                part_hasher = hashlib.sha256()
                with part.open("rb") as source:
                    while chunk := source.read(chunk_size):
                        output.write(chunk)
                        hasher.update(chunk)
                        part_hasher.update(chunk)
                        size_bytes += len(chunk)
                if expected_checksums is not None:
                    actual = part_hasher.hexdigest()
                    expected = expected_checksums[index]
                    if actual != expected:
                        raise StagedPartChecksumMismatchError(
                            part_path=part,
                            expected=expected,
                            actual=actual,
                        )
            output.flush()
            os.fsync(output.fileno())
        return StagedFileOutcome(
            staging_path=staging_path,
            checksum_sha256=hasher.hexdigest(),
            size_bytes=size_bytes,
        )
    except BaseException as exc:
        if created:
            try:
                staging_path.unlink(missing_ok=True)
            except OSError as cleanup_error:
                exc.add_note(f"Claim staging cleanup also failed: {cleanup_error}")
        raise


def promote_staged_file(*, staging_path: Path, out_path: Path) -> None:
    """Atomically promote one fully verified stage; callers own external fencing."""

    out_path.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staging_path, out_path)
