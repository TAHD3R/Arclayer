from __future__ import annotations

from apps.api.src.modules.system.plugins.manager.router import router as plugin_manager_router

# Re-export the manager router. Avoid an extra include_router() layer with an empty prefix:
# FastAPI forbids include_router(prefix="") when the included route path is also "".
router = plugin_manager_router
