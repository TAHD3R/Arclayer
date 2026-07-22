from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


class ComponentCatalogResolver(Protocol):
    def resolve(self, catalog_version: str) -> ComponentCatalogV1 | None: ...

    def list_catalogs(self) -> tuple[ComponentCatalogV1, ...]: ...


class ComponentCatalogRegistry:
    def __init__(self, catalogs: Iterable[ComponentCatalogV1]) -> None:
        by_version: dict[str, ComponentCatalogV1] = {}
        for catalog in catalogs:
            existing = by_version.get(catalog.catalog_version)
            if existing is not None:
                raise ValueError(f"Duplicate component catalog version: {catalog.catalog_version}")
            by_version[catalog.catalog_version] = catalog
        if not by_version:
            raise ValueError("At least one component catalog must be registered")
        self._by_version = by_version

    def resolve(self, catalog_version: str) -> ComponentCatalogV1 | None:
        return self._by_version.get(catalog_version)

    def list_catalogs(self) -> tuple[ComponentCatalogV1, ...]:
        return tuple(self._by_version[key] for key in sorted(self._by_version))


__all__ = ["ComponentCatalogRegistry", "ComponentCatalogResolver"]
