from __future__ import annotations

from typing import Any

from apps.api.plugin.hooks import hookimpl
from apps.api.plugin.types import BasePlugin


class FormsPlugin(BasePlugin):
    """Forms plugin: block type for form builder and admin menu entry."""

    @hookimpl
    def frontend_extensions(self) -> list[Any]:  # type: ignore[override]
        return [
            {
                "id": "forms.block-type",
                "slot": "editor.blocks",
                "title": "Form",
                "kind": "widget",
                "component_url": "/plugins/forms/ui/form-block.js",
            }
        ]
