from __future__ import annotations

from apps.api.infra.storage.core_factories import CoreLocalStorageProviderFactory, CoreS3StorageProviderFactory
from apps.api.plugin.hooks import hookimpl


class CoreHookImpl:
    """
    Core hook implementations.

    Notes:
    - Registered as the "core" pluggy plugin.
    - Keep this module lightweight to avoid circular imports.
    """

    @hookimpl
    def storage_provider_factories(self):  # type: ignore[no-untyped-def]
        return [
            CoreLocalStorageProviderFactory(),
            CoreS3StorageProviderFactory(),
        ]

    @hookimpl
    def rbac_role_resolvers(self):  # type: ignore[no-untyped-def]
        return []

    @hookimpl
    def arq_functions(self):  # type: ignore[no-untyped-def]
        return []

    @hookimpl
    def arq_cron_jobs(self):  # type: ignore[no-untyped-def]
        return []
