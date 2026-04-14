from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from src.common.services import BaseService
from src.models.system.setting import SettingRecord
from src.settings.scopes import SCOPE_TYPE_USER

WORKSPACE_FIRST_ONBOARDING_NAMESPACE = "onboarding.workspace_first"


class WorkspaceFirstOnboardingStatus(StrEnum):
    PENDING_WORKSPACE = "pending_workspace"
    PENDING_WORKSPACE_DEFAULTS = "pending_workspace_defaults"
    COMPLETED = "completed"


@dataclass(frozen=True, slots=True)
class WorkspaceFirstOnboardingState:
    status: WorkspaceFirstOnboardingStatus
    workspace_id: UUID | None = None


class WorkspaceFirstOnboardingService(BaseService):
    async def get_state(self, *, user_id: UUID) -> WorkspaceFirstOnboardingState:
        record = await self._get_record(user_id=user_id)
        if record is None:
            return WorkspaceFirstOnboardingState(status=WorkspaceFirstOnboardingStatus.COMPLETED)
        return self._parse_state(record=record)

    async def ensure_initialized(self, *, user_id: UUID) -> None:
        record = await self._get_record(user_id=user_id)
        if record is not None:
            return
        await self._save_state(
            user_id=user_id,
            status=WorkspaceFirstOnboardingStatus.PENDING_WORKSPACE,
            workspace_id=None,
        )

    async def mark_workspace_created(self, *, user_id: UUID, workspace_id: UUID) -> None:
        await self._save_state(
            user_id=user_id,
            status=WorkspaceFirstOnboardingStatus.PENDING_WORKSPACE_DEFAULTS,
            workspace_id=workspace_id,
        )

    async def mark_completed(self, *, user_id: UUID, workspace_id: UUID | None = None) -> None:
        await self._save_state(
            user_id=user_id,
            status=WorkspaceFirstOnboardingStatus.COMPLETED,
            workspace_id=workspace_id,
        )

    async def _get_record(self, *, user_id: UUID) -> SettingRecord | None:
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=WORKSPACE_FIRST_ONBOARDING_NAMESPACE,
        )

    def _parse_state(self, *, record: SettingRecord) -> WorkspaceFirstOnboardingState:
        if not isinstance(record.value, dict):
            raise ValueError("workspace-first onboarding record must store a dict payload")

        raw_status = str(record.value.get("status") or "").strip().lower()
        try:
            status = WorkspaceFirstOnboardingStatus(raw_status)
        except ValueError as exc:
            raise ValueError(f"unsupported workspace-first onboarding status: {raw_status!r}") from exc

        raw_workspace_id = record.value.get("workspace_id")
        workspace_id = None
        if raw_workspace_id is not None:
            workspace_id = UUID(str(raw_workspace_id))

        return WorkspaceFirstOnboardingState(status=status, workspace_id=workspace_id)

    async def _save_state(
        self,
        *,
        user_id: UUID,
        status: WorkspaceFirstOnboardingStatus,
        workspace_id: UUID | None,
    ) -> None:
        value = {
            "status": status.value,
            "workspace_id": str(workspace_id) if workspace_id is not None else None,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        record = await self._get_record(user_id=user_id)
        if record is None:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_USER,
                scope_id=user_id,
                namespace=WORKSPACE_FIRST_ONBOARDING_NAMESPACE,
                value=value,
                updated_by=user_id,
            )
            return

        record.value = value
        record.updated_by = user_id
        await record.save(update_fields=["value", "updated_by", "updated_at"])
