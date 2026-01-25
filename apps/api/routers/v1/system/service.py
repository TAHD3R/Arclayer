from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.models.user import User
from apps.api.plugin.event_bus import Event
from apps.api.plugin.events import SYSTEM_SETUP_COMPLETED
from apps.api.plugin.manager import PluginManager
from apps.api.routers.v1.admin.settings.service import SettingsService
from apps.api.routers.v1.auth.repository import UserRepository
from apps.api.routers.v1.auth.security import hash_password
from apps.api.settings.crypto import ensure_master_key, master_key_exists


def _ts(key: str, default: str) -> str:
    return t("setup", key, default=default)


class SystemSetupService(BaseService):
    def __init__(self, settings: Settings, *, manager: PluginManager) -> None:
        super().__init__(settings)
        self.manager = manager
        self.user_repo = UserRepository()

    async def is_initialized(self) -> bool:
        if master_key_exists(self.settings.setup.master_key_path):
            return True
        return await User.all().exists()

    async def setup(
        self,
        *,
        admin_username: str,
        admin_password: str,
        admin_email: str | None,
        admin_display_name: str | None,
        master_key_b64: str | None,
        core_patch: dict[str, Any] | None,
    ) -> tuple[datetime, str, User, bool]:
        if not self.settings.database.enabled:
            raise ServiceUnavailable(
                message=_ts("DB_REQUIRED", "系统初始化需要启用数据库"),
                error="DATABASE_DISABLED",
            )
        if await self.is_initialized():
            raise Conflict(message=_ts("SETUP_DONE", "系统已初始化"), error="SETUP_ALREADY_DONE")

        try:
            _key, fingerprint = ensure_master_key(
                self.settings.setup.master_key_path,
                provided_b64=master_key_b64,
            )
        except ValueError as exc:
            raise BadRequest(message=_ts("MASTER_KEY_INVALID", "系统密钥不合法"), error="MASTER_KEY_INVALID") from exc

        if await self.user_repo.exists_username(admin_username):
            raise Conflict(message=_ts("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
        if admin_email and await self.user_repo.exists_email(admin_email):
            raise Conflict(message=_ts("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

        password_hash = hash_password(admin_password, self.settings.auth)
        user = await self.user_repo.create_user(
            username=admin_username,
            email=admin_email,
            display_name=admin_display_name,
            password_hash=password_hash,
        )

        # Persist initial core settings (including secrets) using the same validation path as admin settings.
        now = datetime.now(UTC)
        patch: dict[str, Any] = dict(core_patch or {})
        patch.setdefault("system", {})
        if isinstance(patch["system"], dict):
            patch["system"]["initialized_at"] = now.isoformat()
            patch["system"]["master_key_fingerprint"] = fingerprint
        await SettingsService(self.settings, manager=self.manager).patch_namespace(
            "core",
            patch=patch,
            updated_by=user.id,
        )

        rbac_ok = await self._bootstrap_rbac_admin(user_id=user.id)
        # Emit a best-effort event so plugins can react without hard coupling to setup flow.
        try:
            await self.manager.registry.event_bus.publish(
                Event(
                    name=SYSTEM_SETUP_COMPLETED,
                    payload={"admin_user_id": str(user.id), "admin_username": user.username},
                    source="core",
                    actor_user_id=str(user.id),
                )
            )
        except Exception:
            pass
        return now, fingerprint, user, rbac_ok

    async def _bootstrap_rbac_admin(self, *, user_id) -> bool:
        try:
            from rbac.services import RBACService
        except ModuleNotFoundError:
            self.logger.warning("RBAC plugin is not available, skip admin bootstrap")
            return False
        try:
            await RBACService(self.settings).bootstrap_admin(user_id=user_id)
            return True
        except Exception as exc:
            self.logger.warning("RBAC admin bootstrap failed", error=str(exc), user_id=str(user_id))
            return False
