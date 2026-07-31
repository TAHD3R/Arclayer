from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.exceptions import IntegrityError

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.core.services import BaseService
from src.models.platform_identity.identity import PlatformInstanceOwnership
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.system.setup.service import InstallLockMetadata, InstanceSetupService, InstanceSetupStatus


class InstanceBootstrapResult(BaseModel):
    model_config = ConfigDict(frozen=True)
    owner_identity_id: UUID
    initialized_by_user_id: UUID


class InstanceBootstrapService(BaseService):
    """Bootstrap an uninitialized instance with its sole Instance Owner."""

    def __init__(
        self,
        settings,
        *,
        setup_state_service: InstanceSetupService | None = None,
        user_repo: UserRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.setup_state_service = setup_state_service or InstanceSetupService(settings)
        self.user_repo = user_repo or UserRepository()

    async def bootstrap_instance(
        self,
        *,
        username: str,
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> InstanceBootstrapResult:
        await self._assert_can_bootstrap()
        metadata: InstallLockMetadata | None = None
        ownership_id: UUID | None = None
        user_id: UUID | None = None

        try:
            async with self.tx() as conn:
                await self._assert_can_bootstrap()
                user = await self.user_repo.create_user_in_connection(
                    username=username,
                    email=email,
                    display_name=display_name,
                    password_hash=hash_password(password, self.settings.auth),
                    email_verified_at=datetime.now(UTC) if email else None,
                    conn=conn,
                )
                user_id = UUID(str(user.id))
                ownership = await PlatformInstanceOwnership.create(
                    using_db=conn,
                    owner_user_id=user_id,
                    singleton_key="instance",
                    revision=1,
                )
                ownership_id = UUID(str(ownership.id))
                await write_required_activity_event(
                    settings=self.settings,
                    conn=conn,
                    payload=ActivityAuditPayload(
                        event_name="platform.instance_owner.bootstrapped",
                        actor_user_id=user_id,
                        subject_user_id=user_id,
                        entity_type="platform_instance_ownership",
                        entity_id=ownership_id,
                        source="platform",
                        properties={"bootstrap_version": self.settings.application.app_version},
                    ),
                )
                metadata = self.setup_state_service.build_install_lock_metadata(initialized_by_user_id=user_id)
                self.setup_state_service.write_install_lock(metadata)
        except IntegrityError as exc:
            raise Conflict(
                message=t("errors", "INSTANCE_ALREADY_INITIALIZED"),
                error="INSTANCE_ALREADY_INITIALIZED",
            ) from exc
        except BaseException:
            if metadata is not None:
                self.setup_state_service.remove_install_lock(metadata)
            raise

        if ownership_id is None or user_id is None:
            raise RuntimeError("Instance bootstrap transaction completed without Instance Owner state")
        return InstanceBootstrapResult(owner_identity_id=ownership_id, initialized_by_user_id=user_id)

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
