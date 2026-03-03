from __future__ import annotations

import time
from uuid import UUID

from apps.api.src.config import Settings
from apps.api.src.models.system.admin_menu_item import AdminMenuItem
from apps.api.src.modules.system.admin.menus.shared.service import core_menu_codes_best_effort, logger, raise_if_fatal

_CORE_MENU_HEAL_THROTTLE_SECONDS: float = 10.0
_CORE_MENU_HEAL_LAST_AT: float = 0.0


class AdminMenuHealMixin:
    settings: Settings

    async def _maybe_heal_core_menus(self, *, workspace_id: UUID) -> None:
        global _CORE_MENU_HEAL_LAST_AT

        now = time.monotonic()
        if now - _CORE_MENU_HEAL_LAST_AT < _CORE_MENU_HEAL_THROTTLE_SECONDS:
            return

        core_codes = core_menu_codes_best_effort()
        if not core_codes:
            return

        try:
            rows = await AdminMenuItem.filter(code__in=list(core_codes)).values("code", "deleted_at", "is_active")
            found = {str(r.get("code")) for r in rows if r.get("code")}
            missing = core_codes - found
            inconsistent = any(r.get("deleted_at") is not None or not bool(r.get("is_active")) for r in rows)
            if not missing and not inconsistent:
                _CORE_MENU_HEAL_LAST_AT = now
                return
        except BaseException as exc:
            raise_if_fatal(exc)
            logger.warning(
                "Admin core menu consistency check failed",
                action="check_core_menu_consistency",
                workspace_id=str(workspace_id),
                error=str(exc),
            )
            return

        try:
            from apps.api.src.modules.system.admin.menus.bootstrap.service import ensure_core_admin_menus_ready

            await ensure_core_admin_menus_ready(settings=self.settings)
            _CORE_MENU_HEAL_LAST_AT = now
        except BaseException as exc:
            raise_if_fatal(exc)
            logger.warning(
                "Admin core menu heal failed",
                action="heal_core_admin_menus",
                workspace_id=str(workspace_id),
                error=str(exc),
            )
