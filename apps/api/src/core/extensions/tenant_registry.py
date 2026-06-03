from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from src.core.logging import get_logger

logger = get_logger(__name__)


class ExtensionResourceConflictError(RuntimeError):
    """Raised when two extensions try to register the same resource name."""


# Cache key template: ext:{workspace_id}:r{revision}:{resource_type}:{name}
_CACHE_KEY_PREFIX = "ext"


def _build_cache_key(workspace_id: UUID, revision: int, resource_type: str, name: str) -> str:
    return f"{_CACHE_KEY_PREFIX}:{workspace_id}:r{revision}:{resource_type}:{name}"


# ——— Registration records ——————————————————————————————————————————————


@dataclass(slots=True)
class ServiceRegistration:
    extension: str
    name: str
    factory: Callable[[], Any]


@dataclass(slots=True)
class MiddlewareRegistration:
    extension: str
    name: str
    factory: Callable[[], Any]


@dataclass(slots=True)
class ContentTypeRegistration:
    extension: str
    key: str
    definition: dict[str, Any]


@dataclass(slots=True)
class ProviderRegistration:
    extension: str
    name: str
    factory: Callable[[], Any]


# ——— Base ———————————————————————————————————————————————————————————————


class _TenantAwareBase:
    """Shared activation tracking for tenant-aware registries.

    Activation is managed by ExtensionManager; the public set_active /
    set_inactive methods exist for ExtensionManager's use during integration
    but should not be called arbitrarily.
    """

    def __init__(self) -> None:
        self._activation: dict[str, set[UUID]] = defaultdict(set)

    # These are the integration surface for ExtensionManager — not private,
    # but not part of the general public API either.
    def set_active(self, extension: str, workspace_id: UUID) -> None:
        self._activation[extension].add(workspace_id)

    def set_inactive(self, extension: str, workspace_id: UUID) -> None:
        self._activation[extension].discard(workspace_id)

    def unregister_activation(self, extension: str) -> None:
        self._activation.pop(extension, None)

    @property
    def active_extensions(self) -> dict[str, frozenset[UUID]]:
        return {ext: frozenset(ws_ids) for ext, ws_ids in self._activation.items()}


# ——— Tenant-Aware Registries ———————————————————————————————————————————


class TenantAwareServiceRegistry(_TenantAwareBase):
    """Service registry that resolves per (workspace_id, name).

    Only extensions activated for the given workspace are considered.
    Duplicate service names across extensions are rejected at registration time.
    """

    def __init__(self) -> None:
        super().__init__()
        self._registrations: dict[str, dict[str, ServiceRegistration]] = defaultdict(dict)

    def register(self, extension: str, name: str, factory: Callable[[], Any]) -> None:
        for ext, svc_map in self._registrations.items():
            if ext != extension and name in svc_map:
                raise ExtensionResourceConflictError(
                    f"resource '{name}' already registered by '{ext}'; '{extension}' cannot register it"
                )
        if name in self._registrations[extension]:
            logger.warning("Service already registered, replacing", extension=extension, name=name)
        self._registrations[extension][name] = ServiceRegistration(extension=extension, name=name, factory=factory)

    def unregister(self, extension: str, name: str) -> None:
        self._registrations[extension].pop(name, None)

    def unregister_all(self, extension: str) -> None:
        self._registrations.pop(extension, None)
        self.unregister_activation(extension)

    def resolve(self, name: str, workspace_id: UUID) -> Any | None:
        for ext, svc_map in self._registrations.items():
            if workspace_id not in self._activation.get(ext, set()):
                continue
            reg = svc_map.get(name)
            if reg is not None:
                return reg.factory()
        return None

    def list_services(self, workspace_id: UUID) -> list[str]:
        names: list[str] = []
        for ext, svc_map in self._registrations.items():
            if workspace_id in self._activation.get(ext, set()):
                names.extend(svc_map.keys())
        return names


class TenantAwareMiddlewareRegistry(_TenantAwareBase):
    """Middleware registry that resolves per (workspace_id, name).

    Only extensions activated for the given workspace are considered.
    """

    def __init__(self) -> None:
        super().__init__()
        self._registrations: dict[str, dict[str, MiddlewareRegistration]] = defaultdict(dict)

    def register(self, extension: str, name: str, factory: Callable[[], Any]) -> None:
        for ext, mw_map in self._registrations.items():
            if ext != extension and name in mw_map:
                raise ExtensionResourceConflictError(
                    f"resource '{name}' already registered by '{ext}'; '{extension}' cannot register it"
                )
        if name in self._registrations[extension]:
            logger.warning("Middleware already registered, replacing", extension=extension, name=name)
        self._registrations[extension][name] = MiddlewareRegistration(extension=extension, name=name, factory=factory)

    def unregister(self, extension: str, name: str) -> None:
        self._registrations[extension].pop(name, None)

    def unregister_all(self, extension: str) -> None:
        self._registrations.pop(extension, None)
        self.unregister_activation(extension)

    def resolve(self, name: str, workspace_id: UUID) -> Any | None:
        for ext, mw_map in self._registrations.items():
            if workspace_id not in self._activation.get(ext, set()):
                continue
            reg = mw_map.get(name)
            if reg is not None:
                return reg.factory()
        return None

    def get_active_hooks(self, workspace_id: UUID, hook_type: str = "request") -> list[Any]:
        """Return instantiated middleware hooks for the given workspace.

        Only hooks from activated extensions are returned.
        """
        hooks: list[Any] = []
        for ext, mw_map in self._registrations.items():
            if workspace_id not in self._activation.get(ext, set()):
                continue
            for reg in mw_map.values():
                instance = reg.factory()
                if hasattr(instance, "hook_type") and instance.hook_type == hook_type:
                    hooks.append(instance)
                elif hook_type == "request":
                    hooks.append(instance)
        return hooks


class TenantAwareContentTypeRegistry(_TenantAwareBase):
    """Content-type registry that resolves per (workspace_id, key)."""

    def __init__(self) -> None:
        super().__init__()
        self._registrations: dict[str, dict[str, ContentTypeRegistration]] = defaultdict(dict)
        self._cache: dict[str, Any] = {}

    def register(self, extension: str, key: str, definition: dict[str, Any]) -> None:
        for ext, ct_map in self._registrations.items():
            if ext != extension and key in ct_map:
                raise ExtensionResourceConflictError(
                    f"resource '{key}' already registered by '{ext}'; '{extension}' cannot register it"
                )
        self._cache.clear()
        if key in self._registrations[extension]:
            logger.warning("ContentType already registered, replacing", extension=extension, key=key)
        self._registrations[extension][key] = ContentTypeRegistration(
            extension=extension, key=key, definition=definition
        )

    def unregister(self, extension: str, key: str) -> None:
        self._registrations[extension].pop(key, None)
        self._cache.clear()

    def unregister_all(self, extension: str) -> None:
        self._registrations.pop(extension, None)
        self.unregister_activation(extension)
        self._cache.clear()

    def resolve(self, key: str, workspace_id: UUID, extension_revision: int) -> dict[str, Any] | None:
        cache_key = _build_cache_key(workspace_id, extension_revision, "content_type", key)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached
        for ext, ct_map in self._registrations.items():
            if workspace_id not in self._activation.get(ext, set()):
                continue
            reg = ct_map.get(key)
            if reg is not None:
                self._cache[cache_key] = reg.definition
                return reg.definition
        self._cache[cache_key] = None
        return None

    def list_types(self, workspace_id: UUID, extension_revision: int) -> list[str]:
        cache_key = _build_cache_key(workspace_id, extension_revision, "content_type", "*")
        cached = self._cache.get(cache_key)
        if cached is not None:
            return list(cached)
        keys: list[str] = []
        for ext, ct_map in self._registrations.items():
            if workspace_id in self._activation.get(ext, set()):
                keys.extend(ct_map.keys())
        result = sorted(keys)
        self._cache[cache_key] = result
        return result


class TenantAwareProviderRegistry(_TenantAwareBase):
    """Provider registry that resolves per (workspace_id, type)."""

    def __init__(self) -> None:
        super().__init__()
        self._registrations: dict[str, dict[str, ProviderRegistration]] = defaultdict(dict)

    def register(self, extension: str, name: str, factory: Callable[[], Any]) -> None:
        for ext, prov_map in self._registrations.items():
            if ext != extension and name in prov_map:
                raise ExtensionResourceConflictError(
                    f"resource '{name}' already registered by '{ext}'; '{extension}' cannot register it"
                )
        if name in self._registrations[extension]:
            logger.warning("Provider already registered, replacing", extension=extension, name=name)
        self._registrations[extension][name] = ProviderRegistration(extension=extension, name=name, factory=factory)

    def unregister(self, extension: str, name: str) -> None:
        self._registrations[extension].pop(name, None)

    def unregister_all(self, extension: str) -> None:
        self._registrations.pop(extension, None)
        self.unregister_activation(extension)

    def resolve(self, name: str, workspace_id: UUID) -> Any | None:
        for ext, prov_map in self._registrations.items():
            if workspace_id not in self._activation.get(ext, set()):
                continue
            reg = prov_map.get(name)
            if reg is not None:
                return reg.factory()
        return None

    def list_providers(self, workspace_id: UUID) -> list[str]:
        names: list[str] = []
        for ext, prov_map in self._registrations.items():
            if workspace_id in self._activation.get(ext, set()):
                names.extend(prov_map.keys())
        return names


# ——— Composite Tenant-Aware Registry ———————————————————————————————————


@dataclass
class TenantAwareRegistrySet:
    """Composite of all tenant-aware sub-registries for extension resolution."""

    services: TenantAwareServiceRegistry = field(default_factory=TenantAwareServiceRegistry)
    middlewares: TenantAwareMiddlewareRegistry = field(default_factory=TenantAwareMiddlewareRegistry)
    content_types: TenantAwareContentTypeRegistry = field(default_factory=TenantAwareContentTypeRegistry)
    providers: TenantAwareProviderRegistry = field(default_factory=TenantAwareProviderRegistry)

    def unregister_all(self, extension: str) -> None:
        self.services.unregister_all(extension)
        self.middlewares.unregister_all(extension)
        self.content_types.unregister_all(extension)
        self.providers.unregister_all(extension)

    def set_active(self, extension: str, workspace_id: UUID) -> None:
        self.services.set_active(extension, workspace_id)
        self.middlewares.set_active(extension, workspace_id)
        self.content_types.set_active(extension, workspace_id)
        self.providers.set_active(extension, workspace_id)

    def set_inactive(self, extension: str, workspace_id: UUID) -> None:
        self.services.set_inactive(extension, workspace_id)
        self.middlewares.set_inactive(extension, workspace_id)
        self.content_types.set_inactive(extension, workspace_id)
        self.providers.set_inactive(extension, workspace_id)
