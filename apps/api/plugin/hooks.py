from __future__ import annotations

from typing import Any

import pluggy

PROJECT_NAME = "celestial"

hookspec = pluggy.HookspecMarker(PROJECT_NAME)
hookimpl = pluggy.HookimplMarker(PROJECT_NAME)


class CelestialHooks:
    """
    Pluggy hook specifications for Celestial.

    Notes:
    - Keep hooks sync and return declarative objects (factories/handlers/descriptors).
      Async work should happen in the consumer (service/worker) or in plugin lifecycle methods.
    - Hook return types are intentionally `Any` here to avoid import cycles between infra/modules
      and the plugin system.
    """

    @hookspec
    def storage_provider_factories(self) -> list[Any]:
        """
        Return storage provider factories.

        Each factory must expose:
        - provider: str
        - build(settings) -> provider instance
        """

    @hookspec
    def rbac_role_resolvers(self) -> list[Any]:
        """
        Return additional RBAC role resolvers.

        Each resolver must expose:
        - async get_role_codes(user_id, organization_id) -> list[str]
        """

    @hookspec
    def arq_functions(self) -> list[Any]:
        """
        Return Arq job functions to be registered in the worker.
        """

    @hookspec
    def arq_cron_jobs(self) -> list[Any]:
        """
        Return Arq cron job declarations to be registered in the worker.
        """
