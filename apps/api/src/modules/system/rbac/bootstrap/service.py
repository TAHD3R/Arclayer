from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.modules.system.rbac.service import RBACService


async def ensure_rbac_ready(*, settings: Settings) -> None:
    """
    Ensure roles + permissions are consistent in DB.

    Notes:
    - This should be called after DB is initialized.
    - Permission templates are collected from core only (v1 Extension/Integration platform does
      not execute third-party code in-process).
    """

    service = RBACService(settings)
    await service.sync_permission_catalog()
    await service.ensure_all_workspaces_ready()
