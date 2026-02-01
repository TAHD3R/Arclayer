from __future__ import annotations

"""
Legacy package namespace.

v2 removes `/api/v1/admin` and uses workspace-scoped governance instead.
Some routers historically lived under `routers.v1.admin.*` and are still imported
from that module path (e.g. assets/uploads) to keep the refactor incremental.

Do NOT add new admin-scoped routers here.
"""

__all__ = []
