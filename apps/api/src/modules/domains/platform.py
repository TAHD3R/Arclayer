from __future__ import annotations

from uuid import UUID

from src.common.utils.slug import slugify

from .hostname import normalize_hostname

_PLATFORM_ID_SUFFIX_LENGTH = 8
_PLATFORM_LABEL_MAX_LENGTH = 63


def build_platform_hostname(project_slug: str, project_id: UUID, base_domain: str) -> str:
    normalized_base_domain = normalize_hostname(base_domain).lstrip(".")
    if not normalized_base_domain:
        raise ValueError("Base domain is required")

    suffix = project_id.hex[-_PLATFORM_ID_SUFFIX_LENGTH:]
    slug = slugify(project_slug or "project")
    max_slug_length = _PLATFORM_LABEL_MAX_LENGTH - len(suffix) - 1
    label = f"{slug[:max_slug_length].rstrip('-') or 'project'}-{suffix}"
    return f"{label}.{normalized_base_domain}"
