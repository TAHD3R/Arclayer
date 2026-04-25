from __future__ import annotations

from pathlib import Path

import pytest


def test_safe_object_key_rejects_absolute_paths(tmp_path: Path) -> None:
    from src.platform.storage.local import safe_object_key_to_path

    with pytest.raises(ValueError):
        safe_object_key_to_path(tmp_path, "/etc/passwd")


def test_safe_object_key_rejects_path_traversal(tmp_path: Path) -> None:
    from src.platform.storage.local import safe_object_key_to_path

    with pytest.raises(ValueError):
        safe_object_key_to_path(tmp_path, "../secret.txt")

    with pytest.raises(ValueError):
        safe_object_key_to_path(tmp_path, "a/../../secret.txt")


def test_safe_object_key_normalizes_backslashes(tmp_path: Path) -> None:
    from src.platform.storage.local import safe_object_key_to_path

    out = safe_object_key_to_path(tmp_path, r"a\\b\\c.txt")
    assert out == tmp_path / "a" / "b" / "c.txt"


def test_local_provider_put_and_get_bytes(tmp_path: Path) -> None:
    from src.platform.storage.capabilities import ObjectStorageProviderKind
    from src.platform.storage.local import LocalStorageProvider
    from src.platform.storage.profile_schema import StorageProfileConfig

    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path,
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    key = "org/demo/assets/abc.bin"
    provider.put_bytes(object_key=key, data=b"hello")

    assert provider.exists(object_key=key) is True
    assert provider.read_bytes(object_key=key) == b"hello"


def test_local_provider_put_is_atomic(tmp_path: Path) -> None:
    """
    Write should not leave partial files behind.

    We approximate this by ensuring the final file exists and tmp artifacts do not remain.
    """

    from src.platform.storage.capabilities import ObjectStorageProviderKind
    from src.platform.storage.local import LocalStorageProvider
    from src.platform.storage.profile_schema import StorageProfileConfig

    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path,
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    key = "org/demo/assets/atomic.bin"
    provider.put_bytes(object_key=key, data=b"a" * 16)

    # Only the intended file should exist.
    assert (tmp_path / "org" / "demo" / "assets" / "atomic.bin").is_file()
    tmp_files = list(tmp_path.rglob("*.tmp"))
    assert not tmp_files
