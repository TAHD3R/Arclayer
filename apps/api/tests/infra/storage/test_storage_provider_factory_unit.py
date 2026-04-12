from __future__ import annotations

from src.config import get_settings


def test_build_storage_provider_default_is_local() -> None:
    from src.infra.storage.factory import build_storage_provider
    from src.infra.storage.local import LocalStorageProvider

    provider = build_storage_provider(get_settings())
    assert isinstance(provider, LocalStorageProvider)
