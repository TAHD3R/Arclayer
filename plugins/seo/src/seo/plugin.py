from __future__ import annotations

from typing import Any

from apps.api.plugin.hooks import hookimpl
from apps.api.plugin.types import BasePlugin


class SeoPlugin(BasePlugin):
    """SEO plugin: inspector panel for meta tags and Open Graph."""

    @hookimpl
    def frontend_extensions(self) -> list[Any]:  # type: ignore[override]
        return [
            {
                "id": "seo.inspector-panel",
                "slot": "editor.inspector",
                "title": "SEO",
                "kind": "panel",
                "component_url": "/plugins/seo/ui/inspector.js",
            }
        ]
