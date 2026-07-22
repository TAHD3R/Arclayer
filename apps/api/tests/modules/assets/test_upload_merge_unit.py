from __future__ import annotations

import hashlib
from pathlib import Path

import pytest


def test_stage_parts_requires_claim_scoped_path_and_promotes_only_when_called(tmp_path: Path) -> None:
    from src.platform.storage.merge import promote_staged_file, stage_parts_to_file

    first = tmp_path / "first.part"
    second = tmp_path / "second.part"
    staging = tmp_path / ".completion" / "claim-token" / "merged.stage"
    canonical = tmp_path / "objects" / "asset.bin"
    first.write_bytes(b"hello-")
    second.write_bytes(b"world")

    outcome = stage_parts_to_file(
        part_paths=[first, second],
        staging_path=staging,
        expected_part_checksums=[
            hashlib.sha256(first.read_bytes()).hexdigest(),
            hashlib.sha256(second.read_bytes()).hexdigest(),
        ],
    )

    assert outcome.staging_path == staging
    assert outcome.size_bytes == len(b"hello-world")
    assert outcome.checksum_sha256 == hashlib.sha256(b"hello-world").hexdigest()
    assert staging.read_bytes() == b"hello-world"
    assert canonical.exists() is False

    promote_staged_file(staging_path=staging, out_path=canonical)

    assert staging.exists() is False
    assert canonical.read_bytes() == b"hello-world"


def test_stage_parts_refuses_to_overwrite_an_existing_claim_stage(tmp_path: Path) -> None:
    from src.platform.storage.merge import stage_parts_to_file

    part = tmp_path / "part"
    staging = tmp_path / "claim.stage"
    part.write_bytes(b"new")
    staging.write_bytes(b"existing")

    with pytest.raises(FileExistsError):
        stage_parts_to_file(part_paths=[part], staging_path=staging)

    assert staging.read_bytes() == b"existing"


def test_stage_parts_rejects_bytes_that_do_not_match_the_claimed_part_checksum(tmp_path: Path) -> None:
    from src.platform.storage.merge import StagedPartChecksumMismatchError, stage_parts_to_file

    part = tmp_path / "part"
    staging = tmp_path / "claim.stage"
    canonical = tmp_path / "asset.bin"
    part.write_bytes(b"bytes-written-after-database-rollback")

    with pytest.raises(StagedPartChecksumMismatchError) as exc_info:
        stage_parts_to_file(
            part_paths=[part],
            staging_path=staging,
            expected_part_checksums=[hashlib.sha256(b"database-committed-bytes").hexdigest()],
        )

    assert exc_info.value.actual == hashlib.sha256(part.read_bytes()).hexdigest()
    assert staging.exists() is False
    assert canonical.exists() is False
