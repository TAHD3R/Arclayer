from __future__ import annotations

from pathlib import Path


def test_merge_parts_to_file_builds_correct_output_and_sha256(tmp_path: Path) -> None:
    from src.infra.storage.merge import merge_parts_to_file

    p1 = tmp_path / "part1"
    p2 = tmp_path / "part2"
    p1.write_bytes(b"hello ")
    p2.write_bytes(b"world")

    out = tmp_path / "out.bin"
    digest = merge_parts_to_file(part_paths=[p1, p2], out_path=out)

    assert out.read_bytes() == b"hello world"
    assert len(digest) == 64
