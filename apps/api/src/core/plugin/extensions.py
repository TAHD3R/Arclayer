from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)


class ExtensionOverlay:
    """Manages user extensions that override plugin behavior.

    Users place overrides under extensions/<plugin-name>/:
      - content-types/**/schema.json  → schema overrides
      - strapi-server.py             → server behavior extensions
    """

    def __init__(self, extensions_dir: str | Path | None = None) -> None:
        self._extensions_dir = Path(extensions_dir) if extensions_dir else None

    def has_extension(self, plugin_name: str) -> bool:
        if self._extensions_dir is None:
            return False
        return (self._extensions_dir / plugin_name).is_dir()

    def get_schema_overrides(self, plugin_name: str) -> dict[str, Any]:
        if self._extensions_dir is None:
            return {}
        schema_dir = self._extensions_dir / plugin_name / "content-types"
        if not schema_dir.is_dir():
            return {}
        overrides: dict[str, Any] = {}
        for schema_file in schema_dir.rglob("schema.json"):
            content = json.loads(schema_file.read_text())
            relative = str(schema_file.relative_to(schema_dir).parent)
            overrides[relative] = content
        return overrides

    def get_server_extension(self, plugin_name: str) -> object | None:
        if self._extensions_dir is None:
            return None
        server_file = self._extensions_dir / plugin_name / "strapi-server.py"
        if not server_file.is_file():
            return None
        spec = importlib.util.spec_from_file_location(
            f"extensions.{plugin_name}.server",
            str(server_file),
        )
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load extension server module from {server_file}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        logger.info("Plugin server extension loaded", plugin=plugin_name, path=str(server_file))
        return module
