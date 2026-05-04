from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.modules.auth.service import AuthService
from src.modules.system.setup.service import InstanceSetupService, InstanceSetupStatus


@dataclass(frozen=True, slots=True)
class InstanceBootstrapResult:
    user_id: UUID


class InstanceBootstrapService(BaseService):
    """Bootstrap an uninitialized instance by creating the sole super admin."""

    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.setup_state_service = InstanceSetupService(settings)

    async def bootstrap_instance(
        self,
        *,
        username: str,
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> InstanceBootstrapResult:
        await self._assert_can_bootstrap()

        auth_service = AuthService(self.settings)
        async with self.tx():
            await self._assert_can_bootstrap()
            user = await auth_service.register(
                username=username,
                password=password,
                email=email,
                display_name=display_name,
                is_super_admin=True,
            )
            user_id = UUID(str(user.id))

        metadata = self.setup_state_service.build_install_lock_metadata(initialized_by_user_id=user_id)
        self.setup_state_service.write_install_lock(metadata)

        return InstanceBootstrapResult(
            user_id=user_id,
        )

    async def _assert_can_bootstrap(self) -> None:
        state = await self.setup_state_service.get_state()
        if state.status == InstanceSetupStatus.UNINITIALIZED:
            return
        if state.status == InstanceSetupStatus.REPAIR_REQUIRED:
            raise Conflict(
                message=t("errors", "INSTANCE_SETUP_REPAIR_REQUIRED"),
                error="INSTANCE_SETUP_REPAIR_REQUIRED",
            )
        raise Conflict(
            message=t("errors", "INSTANCE_ALREADY_INITIALIZED"),
            error="INSTANCE_ALREADY_INITIALIZED",
        )
