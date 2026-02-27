from __future__ import annotations

import os
from typing import Final

RUNTIME_SETTING_NAMESPACE = "site.runtime"
THEME_ACTIVE_NAMESPACE = "theme.active"
THEME_VARS_NAMESPACE = "theme.vars"
THEME_CONFIG_NAMESPACE = "theme.config"
EDITOR_STYLE_NAMESPACE = "site.editor.style"
EDITOR_GLOBAL_SECTIONS_NAMESPACE = "site.editor.global_sections"
ROUTE_TEMPLATES_VERSION_NAMESPACE = "site.route_templates.version"

DEFAULT_MAX_CONTENT_REF_DEPTH: Final = 8


def get_max_content_ref_depth() -> int:
    raw = os.getenv("CONTENT_REF_MAX_DEPTH", "").strip()
    if not raw:
        return DEFAULT_MAX_CONTENT_REF_DEPTH
    try:
        v = int(raw)
    except ValueError:
        return DEFAULT_MAX_CONTENT_REF_DEPTH
    return max(1, min(64, v))
