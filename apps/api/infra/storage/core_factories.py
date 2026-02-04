from __future__ import annotations

from apps.api.config import Settings
from apps.api.infra.storage.registry import StorageProvider


class CoreLocalStorageProviderFactory:
    provider = "local"

    def build(self, settings: Settings) -> StorageProvider:
        settings.storage.local_root_dir.mkdir(parents=True, exist_ok=True)
        settings.storage.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        from apps.api.infra.storage.local import LocalStorageProvider

        return LocalStorageProvider(root_dir=settings.storage.local_root_dir)


class CoreS3StorageProviderFactory:
    provider = "s3"

    def build(self, settings: Settings) -> StorageProvider:
        # Even in S3 mode, we rely on a local tmp directory for small intermediate files.
        settings.storage.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        from apps.api.infra.storage.s3 import S3StorageProvider

        return S3StorageProvider(settings)
