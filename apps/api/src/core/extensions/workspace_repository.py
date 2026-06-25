from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.extensions.workspace_extension_activation import (
    WorkspaceExtensionActivation,
    WorkspaceExtensionActivationStatus,
)
from src.models.workspaces.workspace import Workspace


class PersistedExtensionActivation(BaseModel):
    model_config = ConfigDict(frozen=True)

    extension_name: str
    workspace_id: UUID


class ExtensionWorkspaceRepository(TortoiseORMRepository):
    def __init__(self) -> None:
        super().__init__(Workspace)

    async def get_extension_revision(self, workspace_id: UUID) -> int | None:
        workspace = await Workspace.get_or_none(id=workspace_id)
        if workspace is None:
            return None
        return int(workspace.extension_revision)

    async def set_activation_and_increment_revision(
        self,
        extension_name: str,
        workspace_id: UUID,
        *,
        active: bool,
    ) -> int | None:
        async with in_transaction() as conn:
            workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
            if workspace is None:
                return None

            workspace.extension_revision += 1
            await workspace.save(update_fields=["extension_revision", "updated_at"], using_db=conn)
            await self._persist_activation(conn, extension_name, workspace_id, active=active)
            return int(workspace.extension_revision)

    async def list_active_activations(self) -> list[PersistedExtensionActivation]:
        records = await WorkspaceExtensionActivation.filter(
            status=WorkspaceExtensionActivationStatus.ACTIVE,
        ).all()
        return [
            PersistedExtensionActivation(
                extension_name=record.extension_name,
                workspace_id=record.workspace_id,
            )
            for record in records
        ]

    @staticmethod
    async def _persist_activation(
        conn: Any,
        extension_name: str,
        workspace_id: UUID,
        *,
        active: bool,
    ) -> None:
        status = WorkspaceExtensionActivationStatus.ACTIVE if active else WorkspaceExtensionActivationStatus.INACTIVE
        defaults: dict[str, Any] = {"status": status}
        if active:
            defaults["activated_at"] = datetime.now(UTC)
            defaults["deactivated_at"] = None
        else:
            defaults["deactivated_at"] = datetime.now(UTC)

        await WorkspaceExtensionActivation.update_or_create(
            extension_name=extension_name,
            workspace_id=workspace_id,
            defaults=defaults,
            using_db=conn,
        )
