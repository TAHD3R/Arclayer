from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict, NotFound
from src.models.platform.capability_rollout import (
    WorkspaceCapabilityRollout,
    WorkspaceCapabilityRolloutSelection,
)
from src.models.platform.capability_rollout import (
    WorkspaceCapabilityRolloutPreview as WorkspaceCapabilityRolloutPreviewRecord,
)
from src.models.platform.capability_rollout import (
    WorkspaceCapabilityRolloutStage as ModelRolloutStage,
)
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityRolloutApplyReceipt,
    WorkspaceCapabilityRolloutPolicy,
    WorkspaceCapabilityRolloutPreview,
    WorkspaceCapabilityRolloutRuntimeSnapshot,
    WorkspaceCapabilityRolloutStage,
)


class TortoiseWorkspaceCapabilityRolloutRepository:
    """Persistence boundary for the one canonical Workspace capability rollout policy."""

    async def load_policy_for_update(
        self, *, capability_id: str, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityRolloutPolicy:
        await WorkspaceCapabilityRollout.get_or_create(
            capability_id=capability_id,
            defaults={"stage": ModelRolloutStage.NOT_AVAILABLE, "revision": 0, "selection_revision": 0},
            using_db=conn,
        )
        rollout = await (
            WorkspaceCapabilityRollout.filter(capability_id=capability_id).using_db(conn).select_for_update().get()
        )
        selections = await (
            WorkspaceCapabilityRolloutSelection
            .filter(rollout_id=rollout.id)
            .using_db(conn)
            .select_for_update()
            .order_by("workspace_id")
            .values_list("workspace_id", flat=True)
        )
        return WorkspaceCapabilityRolloutPolicy(
            capability_id=capability_id,
            stage=WorkspaceCapabilityRolloutStage(str(rollout.stage)),
            revision=int(rollout.revision),
            selection_revision=int(rollout.selection_revision),
            selected_workspace_ids=tuple(UUID(str(item)) for item in selections),
        )

    async def load_runtime_snapshot(
        self,
        *,
        capability_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityRolloutRuntimeSnapshot | None:
        rows = await conn.execute_query_dict(
            """
            SELECT
                rollout.revision AS rollout_revision,
                rollout.stage AS stage,
                EXISTS(
                    SELECT 1
                    FROM platform_workspace_capability_rollout_selections selection
                    WHERE selection.rollout_id = rollout.id
                      AND selection.workspace_id = $2
                ) AS is_selected
            FROM platform_workspace_capability_rollouts rollout
            WHERE rollout.capability_id = $1
            """,
            [capability_id, workspace_id],
        )
        if not rows:
            return None
        row = rows[0]
        return WorkspaceCapabilityRolloutRuntimeSnapshot(
            capability_id=capability_id,
            rollout_revision=int(row["rollout_revision"]),
            stage=WorkspaceCapabilityRolloutStage(str(row["stage"])),
            is_selected=bool(row["is_selected"]),
        )

    async def save_preview(self, *, preview: WorkspaceCapabilityRolloutPreview, conn: BaseDBAsyncClient) -> None:
        await WorkspaceCapabilityRolloutPreviewRecord.create(
            id=preview.id,
            capability_id=preview.capability_id,
            source_revision=preview.source_policy.revision,
            source_selection_revision=preview.source_policy.selection_revision,
            capability_revision=preview.capability_revision,
            eligibility_revision=preview.eligibility_revision,
            eligibility_snapshot_hash=preview.eligibility_snapshot_hash,
            proposed_stage=ModelRolloutStage(preview.proposed_stage.value),
            proposed_workspace_ids=[str(item) for item in preview.proposed_selected_workspace_ids],
            snapshot=preview.model_dump(mode="json"),
            expires_at=preview.expires_at,
            using_db=conn,
        )

    async def load_preview_for_update(
        self, *, preview_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityRolloutPreview:
        row = await (
            WorkspaceCapabilityRolloutPreviewRecord.filter(id=preview_id).using_db(conn).select_for_update().first()
        )
        if row is None:
            raise NotFound(error="WORKSPACE_CAPABILITY_ROLLOUT_PREVIEW_NOT_FOUND")
        preview = WorkspaceCapabilityRolloutPreview.model_validate(cast(dict[str, object], row.snapshot))
        return preview.model_copy(
            update={
                "created_at": row.created_at,
                "expires_at": row.expires_at,
                "applied_rollout_revision": row.applied_rollout_revision,
            }
        )

    async def apply_preview(
        self,
        *,
        preview: WorkspaceCapabilityRolloutPreview,
        actor_user_id: UUID,
        idempotency_key: str,
        applied_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityRolloutApplyReceipt:
        row = await (
            WorkspaceCapabilityRolloutPreviewRecord.filter(id=preview.id).using_db(conn).select_for_update().get()
        )
        if row.applied_rollout_revision is not None:
            if row.applied_actor_user_id != actor_user_id or row.applied_idempotency_key != idempotency_key:
                raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_IDEMPOTENCY_MISMATCH")
            return WorkspaceCapabilityRolloutApplyReceipt(
                capability_id=preview.capability_id,
                rollout_revision=int(row.applied_rollout_revision),
                selection_revision=int(row.applied_selection_revision or 0),
                applied_at=row.applied_at or datetime.now(UTC),
                replayed=True,
            )
        existing_command = await (
            WorkspaceCapabilityRolloutPreviewRecord
            .filter(
                applied_actor_user_id=actor_user_id,
                applied_idempotency_key=idempotency_key,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if existing_command is not None:
            raise Conflict(error="WORKSPACE_CAPABILITY_ROLLOUT_IDEMPOTENCY_KEY_REUSED")
        rollout = await (
            WorkspaceCapabilityRollout
            .filter(capability_id=preview.capability_id)
            .using_db(conn)
            .select_for_update()
            .get()
        )
        selected_workspace_ids = tuple(sorted(preview.proposed_selected_workspace_ids, key=str))
        if tuple(sorted(preview.source_policy.selected_workspace_ids, key=str)) != selected_workspace_ids:
            await WorkspaceCapabilityRolloutSelection.filter(rollout_id=rollout.id).using_db(conn).delete()
            if selected_workspace_ids:
                await WorkspaceCapabilityRolloutSelection.bulk_create(
                    [
                        WorkspaceCapabilityRolloutSelection(rollout_id=rollout.id, workspace_id=workspace_id)
                        for workspace_id in selected_workspace_ids
                    ],
                    using_db=conn,
                )
            rollout.selection_revision = int(rollout.selection_revision) + 1
        rollout.stage = ModelRolloutStage(preview.proposed_stage.value)
        rollout.revision = int(rollout.revision) + 1
        await rollout.save(using_db=conn, update_fields=["stage", "revision", "selection_revision", "updated_at"])
        row.applied_actor_user_id = actor_user_id
        row.applied_idempotency_key = idempotency_key
        row.applied_rollout_revision = int(rollout.revision)
        row.applied_selection_revision = int(rollout.selection_revision)
        row.applied_at = applied_at
        await row.save(
            using_db=conn,
            update_fields=[
                "applied_actor_user_id",
                "applied_idempotency_key",
                "applied_rollout_revision",
                "applied_selection_revision",
                "applied_at",
                "updated_at",
            ],
        )
        return WorkspaceCapabilityRolloutApplyReceipt(
            capability_id=preview.capability_id,
            rollout_revision=int(rollout.revision),
            selection_revision=int(rollout.selection_revision),
            applied_at=applied_at,
        )
