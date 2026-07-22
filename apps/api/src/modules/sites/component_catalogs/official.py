from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import orjson

from src.modules.sites.component_catalogs.registry import ComponentCatalogRegistry
from src.modules.sites.component_catalogs.schema import ComponentCatalogInputV1, build_component_catalog


def _load_packaged_catalog(path: Path):
    if not path.is_file():
        raise RuntimeError(f"Packaged component catalog is missing: {path.name}")
    payload = ComponentCatalogInputV1.model_validate(orjson.loads(path.read_bytes()))
    return build_component_catalog(payload)


@lru_cache(maxsize=1)
def get_official_component_catalog_registry() -> ComponentCatalogRegistry:
    catalog_dir = Path(__file__).with_name("catalogs")
    paths = tuple(sorted(catalog_dir.glob("*.json")))
    if not paths:
        raise RuntimeError("No packaged component catalogs are available")
    return ComponentCatalogRegistry(_load_packaged_catalog(path) for path in paths)


__all__ = ["get_official_component_catalog_registry"]
