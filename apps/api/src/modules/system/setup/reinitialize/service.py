from __future__ import annotations

from pathlib import Path
from uuid import UUID

from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Forbidden, NotFound
from apps.api.src.modules.organization.models.organization import Organization
from apps.api.src.modules.organization.models.user import User
from apps.api.src.modules.system.models.setting import SettingRecord
from apps.api.src.modules.system.models.setup_job import SetupJobRecord
from apps.api.src.modules.system.schema import SystemReinitializeResult
from apps.api.src.modules.system.setup.shared.service import _ts


class SystemSetupReinitializeMixin:
    settings: Settings
    logger: object

    async def reinitialize_self_host(
        self,
        *,
        organization_id: UUID,
        confirm_name: str,
    ) -> SystemReinitializeResult:
        if self.settings.application.deployment_mode != "self_host":
            raise Forbidden(message=_ts("SELF_HOST_ONLY", "仅自托管环境允许执行该操作"), error="SELF_HOST_ONLY")

        organization = await Organization.get_or_none(id=organization_id)
        if organization is None:
            raise NotFound(message=_ts("NOT_FOUND", "资源不存在"), error="NOT_FOUND")

        if str(confirm_name or "").strip() != str(organization.name):
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="SYSTEM_REINITIALIZE_CONFIRM_NAME_MISMATCH")

        await SetupJobRecord.all().delete()
        await SettingRecord.all().delete()
        await Organization.all().delete()
        await User.all().delete()

        key_path = Path(self.settings.setup.master_key_path)
        if key_path.exists():
            key_path.unlink()

        self.logger.warning(
            "System reinitialized for self-host setup replay",
            action="system_reinitialize_self_host",
            organization_id=str(organization_id),
        )

        return SystemReinitializeResult(reinitialized=True, setup_required=True)
