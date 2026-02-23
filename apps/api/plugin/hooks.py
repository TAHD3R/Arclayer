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
        raise NotImplementedError

    @hookspec
    def rbac_role_resolvers(self) -> list[Any]:
        """
        Return additional RBAC role resolvers.

        Each resolver must expose:
        - async get_role_codes(user_id, organization_id) -> list[str]
        """
        raise NotImplementedError

    @hookspec
    def arq_functions(self) -> list[Any]:
        """
        Return Arq job functions to be registered in the worker.
        """
        raise NotImplementedError

    @hookspec
    def arq_cron_jobs(self) -> list[Any]:
        """
        Return Arq cron job declarations to be registered in the worker.
        """
        raise NotImplementedError

    @hookspec
    def auth_sso_providers(self) -> list[Any]:
        """
        Return additional auth SSO provider declarations (e.g. OAuth / OIDC buttons).

        Each declaration should be a lightweight object with enough metadata for the host to:
        - decide whether the provider is enabled (based on plugin settings),
        - build a start URL/path that the frontend can navigate to,
        - render a label/icon on the login page.
        """
        raise NotImplementedError

    @hookspec
    def frontend_extensions(self) -> list[Any]:
        """
        Return frontend UI extension declarations.

        Each declaration should be a dict or object with:
        - id: str
        - slot: str
        - title: str
        - kind: str ("action" | "panel" | "widget")
        - component_url: str (JS module URL for lazy loading)
        """
        raise NotImplementedError
