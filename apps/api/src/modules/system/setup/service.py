from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from tortoise import Tortoise

from src.common.services import BaseService
from src.config import Settings
from src.models.organization.user import User


class InstanceSetupStatus(StrEnum):
    UNINITIALIZED = "uninitialized"
    READY = "ready"
    REPAIR_REQUIRED = "repair_required"


class InstallLockMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_id: str = Field(min_length=1)
    initialized_at: datetime
    initialized_by_user_id: UUID
    bootstrap_version: str = Field(min_length=1)
    schema_version: str = Field(min_length=1)


class InstanceSetupState(BaseModel):
    status: InstanceSetupStatus
    install_lock_present: bool
    install_lock_metadata: InstallLockMetadata | None = None
    super_admin_count: int
    repair_reason: str | None = None


class InstanceSetupService(BaseService):
    """Classify instance setup readiness from install.lock and super-admin truth."""

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self._database_available = bool(settings.database.enabled)

    @property
    def install_lock_path(self) -> Path:
        return self.settings.application.data_dir / "install.lock"

    async def get_state(self) -> InstanceSetupState:
        install_lock_present = self.install_lock_path.exists()
        super_admin_count = await self.count_super_admins()
        install_lock_metadata: InstallLockMetadata | None = None
        repair_reason: str | None = None

        if install_lock_present:
            try:
                install_lock_metadata = self.read_install_lock()
            except (OSError, ValueError, json.JSONDecodeError):
                repair_reason = "invalid_install_lock"

        if repair_reason is not None:
            status = InstanceSetupStatus.REPAIR_REQUIRED
        elif (not install_lock_present) and super_admin_count == 0:
            status = InstanceSetupStatus.UNINITIALIZED
        elif install_lock_present and super_admin_count == 1:
            status = InstanceSetupStatus.READY
        else:
            status = InstanceSetupStatus.REPAIR_REQUIRED
            repair_reason = "state_mismatch"

        return InstanceSetupState(
            status=status,
            install_lock_present=install_lock_present,
            install_lock_metadata=install_lock_metadata,
            super_admin_count=super_admin_count,
            repair_reason=repair_reason,
        )

    async def count_super_admins(self) -> int:
        if not self._database_available or not Tortoise._inited:
            return 0
        return int(await User.filter(is_super_admin=True).count())

    def read_install_lock(self) -> InstallLockMetadata:
        raw = json.loads(self.install_lock_path.read_text(encoding="utf-8"))
        return InstallLockMetadata.model_validate(raw)

    def write_install_lock(self, metadata: InstallLockMetadata) -> None:
        self.install_lock_path.parent.mkdir(parents=True, exist_ok=True)
        self.install_lock_path.write_text(
            metadata.model_dump_json(indent=2),
            encoding="utf-8",
        )

    def build_install_lock_metadata(self, *, initialized_by_user_id: UUID) -> InstallLockMetadata:
        return InstallLockMetadata(
            instance_id=str(uuid4()),
            initialized_at=datetime.now(UTC),
            initialized_by_user_id=initialized_by_user_id,
            bootstrap_version=self.settings.application.app_version,
            schema_version="0001_initial",
        )
