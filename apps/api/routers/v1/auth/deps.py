from __future__ import annotations

# Re-export auth dependencies from core to avoid circular imports.
#
# The v1 router package imports multiple router modules at import time; if core
# dependencies import from routers, tests and application startup can hit a
# circular import. Keeping these callables defined in core and re-exported here
# preserves backward compatibility for imports and dependency_overrides.
from apps.api.core.auth.deps import bearer_scheme, get_current_user, get_current_user_id

__all__ = [
    "bearer_scheme",
    "get_current_user",
    "get_current_user_id",
]
