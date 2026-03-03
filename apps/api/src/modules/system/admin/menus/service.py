from __future__ import annotations

from apps.api.src.common.services import BaseService
from apps.api.src.config import get_settings
from apps.api.src.modules.system.admin.menus.items.service import AdminMenuItemsMixin
from apps.api.src.modules.system.admin.menus.repository import AdminMenuRepository
from apps.api.src.modules.system.admin.menus.tree.service import AdminMenuTreeMixin


class AdminMenuService(
    AdminMenuItemsMixin,
    AdminMenuTreeMixin,
    BaseService,
):
    def __init__(self) -> None:
        settings = get_settings()
        super().__init__(settings)
        self.repo = AdminMenuRepository()
