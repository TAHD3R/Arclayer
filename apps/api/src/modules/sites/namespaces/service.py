from __future__ import annotations

import os
from typing import Final

RUNTIME_SETTING_NAMESPACE = "site.runtime"
EDITOR_STYLE_NAMESPACE = "site.editor.style"
EDITOR_GLOBAL_SECTIONS_NAMESPACE = "site.editor.global_sections"

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
