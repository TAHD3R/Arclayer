from __future__ import annotations

from pathlib import Path
from typing import Protocol, cast
from uuid import UUID

from apps.api.src.common.protocols.logging import LoggerLike
from apps.api.src.config import Settings
from apps.api.src.core.events import EventBus
from apps.api.src.core.exceptions import BadRequest, Conflict, Forbidden, Unauthorized
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.user import UserCredential
from apps.api.src.modules.auth.tokens.service import verify_password
from apps.api.src.modules.system.schema import SystemMasterKeyRepairResult
from apps.api.src.modules.system.settings.service import SettingsService
from apps.api.src.modules.system.setup.shared.service import _raise_if_fatal, _ts
from apps.api.src.settings.crypto import ensure_master_key, master_key_exists
from apps.api.src.settings.signing import ensure_signing_keypair


class _SystemSetupAccess(Protocol):
    async def is_initialized(self) -> bool: ...


class _UserRepoWithCredential(Protocol):
    async def get_by_id_with_credential(self, user_id: UUID) -> object | None: ...


class SystemSetupMasterKeyMixin:
    settings: Settings
    user_repo: object
    event_bus: EventBus
    logger: LoggerLike

    async def repair_master_key(
        self,
        *,
        confirm_text: str,
        password: str,
        actor_user_id: UUID | None,
        updated_by: UUID | None,
    ) -> SystemMasterKeyRepairResult:
        if str(confirm_text or "").strip() != "REPAIR":
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="MASTER_KEY_REPAIR_CONFIRM_MISMATCH")

        if not await cast(_SystemSetupAccess, self).is_initialized():
            raise Conflict(message=_ts("SETUP_NOT_DONE", "系统尚未初始化"), error="SETUP_NOT_DONE")

        if actor_user_id is None:
            raise Unauthorized(message=t("auth", "UNAUTHORIZED", default="未登录"), error="UNAUTHORIZED")

        user_with_cred = await cast(_UserRepoWithCredential, self.user_repo).get_by_id_with_credential(actor_user_id)
        if user_with_cred is None:
            raise Unauthorized(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="USER_NOT_FOUND")

        if not bool(getattr(user_with_cred, "is_super_admin", False)):
            raise Forbidden(message=t("auth", "FORBIDDEN", default="无权限"), error="SUPER_ADMIN_REQUIRED")

        credential = cast(UserCredential | None, getattr(user_with_cred, "credential", None))
        if credential is None:
            raise Unauthorized(
                message=t("auth", "INVALID_CREDENTIALS", default="账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        if not verify_password(password, cast(str, credential.password_hash), self.settings.auth):
            raise Unauthorized(
                message=t("auth", "INVALID_CREDENTIALS", default="账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        key_path = Path(self.settings.setup.master_key_path)
        created = not master_key_exists(key_path)
        key, fingerprint = ensure_master_key(key_path)
        _priv, _pub, signing_fp = ensure_signing_keypair(
            private_path=self.settings.setup.signing_private_key_path,
            public_path=self.settings.setup.signing_public_key_path,
        )

        try:
            await SettingsService(self.settings, event_bus=self.event_bus).patch_namespace(
                "core",
                patch={"system": {"master_key_fingerprint": fingerprint, "signing_key_fingerprint": signing_fp}},
                updated_by=updated_by,
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Persist master key fingerprint failed",
                action="system_master_key_repair_persist_fingerprint",
                error=str(exc),
            )

        self.logger.info(
            "System master key repaired",
            action="system_master_key_repair",
            created=created,
            master_key_fingerprint=fingerprint,
            key_len=len(key),
        )

        return SystemMasterKeyRepairResult(master_key_ready=True, created=created, master_key_fingerprint=fingerprint)
