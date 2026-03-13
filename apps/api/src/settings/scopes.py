from __future__ import annotations

from uuid import UUID

SCOPE_TYPE_SYSTEM = "system"
SCOPE_TYPE_ORG = "org"
SCOPE_TYPE_WORKSPACE = "workspace"
SCOPE_TYPE_SITE = "site"
SCOPE_TYPE_USER = "user"

# Use a stable nil UUID so uniqueness constraints work without nullable scope_id semantics.
SYSTEM_SCOPE_ID = UUID(int=0)
