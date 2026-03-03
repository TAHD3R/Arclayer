from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.core.exceptions import Conflict, Forbidden, ServiceUnavailable
from apps.api.src.modules.organization.models.user import User
from apps.api.src.modules.system.schema import SystemSetupStatus
from apps.api.src.modules.system.setup.shared.service import _ts
from apps.api.src.settings.crypto import master_key_exists


class SystemSetupAccessMixin:
    settings: Settings

    @staticmethod
    def _is_local_host(host: str | None) -> bool:
        return host in {"127.0.0.1", "::1", "localhost"}

    async def is_initialized(self) -> bool:
        return await User.all().exists()

    async def get_setup_status(self) -> SystemSetupStatus:
        initialized = await self.is_initialized()
        master_key_ready = master_key_exists(self.settings.setup.master_key_path)
        repair_required = bool(initialized and not master_key_ready)
        expected = self.settings.setup.token.get_secret_value() if self.settings.setup.token is not None else ""
        access = "token" if expected else "local_only"
        return SystemSetupStatus(
            initialized=initialized,
            master_key_ready=master_key_ready,
            repair_required=repair_required,
            repair_hint=("MASTER_KEY_REPAIR_REQUIRED" if repair_required else None),
            setup_enabled=self.settings.setup.enabled,
            access=access,
        )

    def validate_setup_access(self, *, client_host: str | None, setup_token: str | None) -> None:
        if not self.settings.setup.enabled:
            raise ServiceUnavailable(
                message=_ts("SETUP_DISABLED", "系统初始化接口已关闭"),
                error="SETUP_DISABLED",
            )

        expected = self.settings.setup.token.get_secret_value() if self.settings.setup.token is not None else ""
        if expected:
            if not setup_token or setup_token != expected:
                raise Forbidden(
                    message=_ts("SETUP_TOKEN_INVALID", "初始化令牌无效"),
                    error="SETUP_TOKEN_INVALID",
                )
        else:
            if not self._is_local_host(client_host):
                raise Forbidden(
                    message=_ts("SETUP_LOCAL_ONLY", "初始化接口仅允许本机访问"),
                    error="SETUP_LOCAL_ONLY",
                )

    def _require_db_enabled(self) -> None:
        if not self.settings.database.enabled:
            raise ServiceUnavailable(
                message=_ts("DB_REQUIRED", "系统初始化需要启用数据库"),
                error="DATABASE_DISABLED",
            )

    async def _raise_if_already_initialized(self) -> None:
        if await self.is_initialized():
            raise Conflict(message=_ts("SETUP_DONE", "系统已初始化"), error="SETUP_ALREADY_DONE")
