from __future__ import annotations

import re
from uuid import UUID

_SCHEMA_NAME_PATTERN = re.compile(r"^cms_ws_[a-z0-9_]+$")
_INVALID_SCHEMA_CHARACTERS = ('"', "'", ".", " ", ";")


def build_workspace_schema_name(workspace_id: UUID) -> str:
    normalized = workspace_id.hex.lower()[:20]
    return f"cms_ws_{normalized}"


def validate_tenant_schema_name(schema_name: str) -> str:
    candidate = schema_name or ""
    if not candidate:
        raise ValueError("Tenant schema name is required")
    if candidate != candidate.strip():
        raise ValueError("Tenant schema name contains leading or trailing whitespace")
    if any(char in candidate for char in _INVALID_SCHEMA_CHARACTERS):
        raise ValueError("Tenant schema name contains invalid characters")

    normalized = candidate.lower()
    if not _SCHEMA_NAME_PATTERN.fullmatch(normalized):
        raise ValueError("Tenant schema name must match cms_ws_[a-z0-9_]+")
    return normalized
