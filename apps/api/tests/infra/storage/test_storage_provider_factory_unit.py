from __future__ import annotations

from pathlib import Path


def test_build_storage_provider_local_profile(tmp_path: Path) -> None:
    from src.platform.storage.capabilities import ObjectStorageProviderKind
    from src.platform.storage.factory import build_storage_provider
    from src.platform.storage.local import LocalStorageProvider
    from src.platform.storage.profile_schema import StorageProfileConfig

    provider = build_storage_provider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "uploads",
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    assert isinstance(provider, LocalStorageProvider)
