from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.models.automation.flow import (
    AutomationFlowRecord,
    AutomationFlowStatus,
    AutomationOperationKind,
    AutomationOperationRecord,
    AutomationRunLogLevel,
    AutomationRunLogRecord,
    AutomationRunRecord,
    AutomationRunStatus,
    AutomationTriggerKind,
)


class AutomationRepository:
    @staticmethod
    def _project_id_from_binding(binding: dict[str, Any] | None) -> str | None:
        if not isinstance(binding, dict):
            return None
        project_id = binding.get("projectId")
        return str(project_id).strip() if project_id is not None else None

    @classmethod
    def _is_workspace_scoped_flow(cls, flow: AutomationFlowRecord) -> bool:
        return cls._project_id_from_binding(flow.credential_binding) is None

    @staticmethod
    def _project_filter_kwargs(*, project_id: UUID | None) -> dict[str, Any]:
        return {"credential_binding__projectId": str(project_id)} if project_id is not None else {}

    async def list_flows(self, *, workspace_id: UUID) -> list[AutomationFlowRecord]:
        flows = await AutomationFlowRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").all()
        return [flow for flow in flows if self._is_workspace_scoped_flow(flow)]

    async def list_project_flows(self, *, workspace_id: UUID, project_id: UUID) -> list[AutomationFlowRecord]:
        flows = await AutomationFlowRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").all()
        expected_project_id = str(project_id)
        return [flow for flow in flows if self._project_id_from_binding(flow.credential_binding) == expected_project_id]

    async def list_enabled_flows_for_event(self, *, workspace_id: UUID, event_name: str) -> list[AutomationFlowRecord]:
        flows = (
            await AutomationFlowRecord
            .filter(
                workspace_id=workspace_id,
                trigger_event=event_name,
                status=AutomationFlowStatus.ACTIVE,
            )
            .order_by("created_at", "id")
            .all()
        )
        return [flow for flow in flows if self._is_workspace_scoped_flow(flow)]

    async def list_enabled_project_flows_for_event(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        event_name: str,
    ) -> list[AutomationFlowRecord]:
        flows = (
            await AutomationFlowRecord
            .filter(
                workspace_id=workspace_id,
                trigger_event=event_name,
                status=AutomationFlowStatus.ACTIVE,
            )
            .order_by("created_at", "id")
            .all()
        )
        expected_project_id = str(project_id)
        return [flow for flow in flows if self._project_id_from_binding(flow.credential_binding) == expected_project_id]

    async def get_flow(self, *, workspace_id: UUID, flow_id: UUID) -> AutomationFlowRecord | None:
        flow = await AutomationFlowRecord.filter(id=flow_id, workspace_id=workspace_id).first()
        if flow is None or not self._is_workspace_scoped_flow(flow):
            return None
        return flow

    async def get_project_flow(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        flow_id: UUID,
    ) -> AutomationFlowRecord | None:
        flow = await AutomationFlowRecord.filter(id=flow_id, workspace_id=workspace_id).first()
        expected_project_id = str(project_id)
        if flow is None or self._project_id_from_binding(flow.credential_binding) != expected_project_id:
            return None
        return flow

    async def create_flow(
        self,
        *,
        workspace_id: UUID,
        name: str,
        description: str | None,
        status: AutomationFlowStatus,
        trigger_kind: AutomationTriggerKind,
        trigger_event: str,
        retry_limit: int,
        dead_letter_enabled: bool,
        credential_binding: dict[str, Any] | None,
        created_by_user_id: UUID | None,
        operations: list[tuple[str, AutomationOperationKind, dict[str, Any] | None, int]],
    ) -> AutomationFlowRecord:
        async with in_transaction() as conn:
            flow = await AutomationFlowRecord.create(
                workspace_id=workspace_id,
                name=name,
                description=description,
                status=status,
                trigger_kind=trigger_kind,
                trigger_event=trigger_event,
                retry_limit=retry_limit,
                dead_letter_enabled=dead_letter_enabled,
                credential_binding=credential_binding,
                created_by_user_id=created_by_user_id,
                updated_by_user_id=created_by_user_id,
                using_db=conn,
            )
            await self.replace_operations(flow_id=flow.id, operations=operations, conn=conn)
            return flow

    async def update_flow(
        self,
        flow: AutomationFlowRecord,
        *,
        fields: dict[str, Any],
        operations: list[tuple[str, AutomationOperationKind, dict[str, Any] | None, int]] | None,
    ) -> AutomationFlowRecord:
        async with in_transaction() as conn:
            if fields:
                for key, value in fields.items():
                    setattr(flow, key, value)
                await flow.save(update_fields=[*fields.keys(), "updated_at"], using_db=conn)
            if operations is not None:
                await self.replace_operations(flow_id=flow.id, operations=operations, conn=conn)
            return flow

    async def delete_flow(self, *, workspace_id: UUID, flow_id: UUID) -> int:
        flow = await self.get_flow(workspace_id=workspace_id, flow_id=flow_id)
        if flow is None:
            return 0
        return int(await AutomationFlowRecord.filter(id=flow.id).delete())

    async def delete_project_flow(self, *, workspace_id: UUID, project_id: UUID, flow_id: UUID) -> int:
        flow = await self.get_project_flow(workspace_id=workspace_id, project_id=project_id, flow_id=flow_id)
        if flow is None:
            return 0
        return int(await AutomationFlowRecord.filter(id=flow.id).delete())

    async def list_operations(self, *, flow_id: UUID) -> list[AutomationOperationRecord]:
        return await AutomationOperationRecord.filter(flow_id=flow_id).order_by("sort_order", "created_at", "id").all()

    async def replace_operations(
        self,
        *,
        flow_id: UUID,
        operations: list[tuple[str, AutomationOperationKind, dict[str, Any] | None, int]],
        conn: BaseDBAsyncClient,
    ) -> None:
        await AutomationOperationRecord.filter(flow_id=flow_id).using_db(conn).delete()
        for index, (name, kind, config, sort_order) in enumerate(operations):
            await AutomationOperationRecord.create(
                flow_id=flow_id,
                name=name,
                kind=kind,
                config=config,
                sort_order=sort_order if sort_order is not None else index,
                using_db=conn,
            )

    async def create_run(
        self,
        *,
        workspace_id: UUID,
        flow_id: UUID,
        trigger_event: str,
        event_payload: dict[str, Any],
        max_attempts: int,
    ) -> AutomationRunRecord:
        return await AutomationRunRecord.create(
            workspace_id=workspace_id,
            flow_id=flow_id,
            trigger_event=trigger_event,
            status=AutomationRunStatus.QUEUED,
            attempt=1,
            max_attempts=max_attempts,
            event_payload=event_payload,
        )

    async def update_run(
        self,
        run: AutomationRunRecord,
        *,
        status: AutomationRunStatus,
        result_payload: dict[str, Any] | None = None,
        error: str | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> AutomationRunRecord:
        run.status = status
        run.result_payload = result_payload
        run.error = error
        if started_at is not None:
            run.started_at = started_at
        if completed_at is not None:
            run.completed_at = completed_at
        await run.save(update_fields=["status", "result_payload", "error", "started_at", "completed_at", "updated_at"])
        return run

    async def create_log(
        self,
        *,
        workspace_id: UUID,
        run_id: UUID,
        operation_id: UUID | None,
        level: AutomationRunLogLevel,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> AutomationRunLogRecord:
        return await AutomationRunLogRecord.create(
            workspace_id=workspace_id,
            run_id=run_id,
            operation_id=operation_id,
            level=level,
            message=message,
            payload=payload,
        )

    async def list_runs(self, *, workspace_id: UUID, limit: int) -> list[AutomationRunRecord]:
        safe_limit = max(1, min(int(limit or 0), 100))
        runs = await AutomationRunRecord.filter(workspace_id=workspace_id).order_by("-created_at").limit(safe_limit * 3)
        return [run for run in runs if self._project_id_from_event_payload(run.event_payload) is None][:safe_limit]

    async def list_project_runs(self, *, workspace_id: UUID, project_id: UUID, limit: int) -> list[AutomationRunRecord]:
        safe_limit = max(1, min(int(limit or 0), 100))
        runs = await AutomationRunRecord.filter(workspace_id=workspace_id).order_by("-created_at").limit(safe_limit * 3)
        expected_project_id = str(project_id)
        return [run for run in runs if self._project_id_from_event_payload(run.event_payload) == expected_project_id][
            :safe_limit
        ]

    async def get_run(self, *, workspace_id: UUID, run_id: UUID) -> AutomationRunRecord | None:
        run = await AutomationRunRecord.filter(id=run_id, workspace_id=workspace_id).first()
        if run is None or self._project_id_from_event_payload(run.event_payload) is not None:
            return None
        return run

    async def get_project_run(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        run_id: UUID,
    ) -> AutomationRunRecord | None:
        run = await AutomationRunRecord.filter(id=run_id, workspace_id=workspace_id).first()
        expected_project_id = str(project_id)
        if run is None or self._project_id_from_event_payload(run.event_payload) != expected_project_id:
            return None
        return run

    async def list_run_logs(self, *, workspace_id: UUID, run_id: UUID) -> list[AutomationRunLogRecord]:
        return await AutomationRunLogRecord.filter(workspace_id=workspace_id, run_id=run_id).order_by(
            "created_at", "id"
        )

    @staticmethod
    def _project_id_from_event_payload(payload: dict[str, Any] | None) -> str | None:
        if not isinstance(payload, dict):
            return None
        project_id = payload.get("project_id") or payload.get("projectId")
        return str(project_id).strip() if project_id is not None else None
