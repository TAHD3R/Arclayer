from __future__ import annotations

from apps.api.src.config import get_settings


def test_build_storage_provider_default_is_local() -> None:
    from apps.api.src.infra.storage.factory import build_storage_provider
    from apps.api.src.infra.storage.local import LocalStorageProvider

    provider = build_storage_provider(get_settings())
    assert isinstance(provider, LocalStorageProvider)
