from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.common.utils.public_ids import encode_uuid
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.services import BaseService
from src.models.agents.approval import AgentApprovalRecord, AgentApprovalStatus, AgentApprovalTargetType
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.agents.approval_repository import AgentApprovalRepository
from src.modules.projects.agents.approval_schema import (
    AgentApprovalApplyOut,
    AgentApprovalDecisionRequest,
    AgentApprovalListOut,
    AgentApprovalOut,
    AgentContentApprovalDryRunRequest,
    AgentContentApprovalModifyRequest,
    AgentContentModelApprovalDryRunRequest,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import (
    ContentPresentationIn,
    ContentVersionDraftSaveIn,
)
from src.modules.projects.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ProjectContentCanonicalModelsService,
)
from src.modules.projects.content.models.router_helpers import to_mutation_out, to_preview_out

CONTENT_WRITER_SKILL_ID = "content.writer"
CONTENT_WRITER_TOOL_NAME = "content_draft_proposal"
CONTENT_WRITER_ACTION = "content_item.update_draft"
CONTENT_MODELER_SKILL_ID = "content.modeler"
CONTENT_MODELER_TOOL_NAME = "content_model_draft_proposal"
CONTENT_MODELER_ACTION = "content_model.update_schema"
AGENT_APPROVAL_APPLIED_EVENT = "agent.approval.applied"


class AgentApprovalService(BaseService):
    def __init__(
        self,
        repo: AgentApprovalRepository | None = None,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        super().__init__()
        self.repo = repo or AgentApprovalRepository()
        self.clock = clock or (lambda: datetime.now(UTC))

    async def create_content_dry_run(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        requester_user_id: UUID,
        payload: AgentContentApprovalDryRunRequest,
    ) -> AgentApprovalOut:
        self._ensure_content_writer_contract(payload)

        item = await self.repo.get_content_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=payload.target_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")

        current_draft_version = int(item.draft_version or 0)
        draft = await self.repo.get_content_draft_version(item_id=item.id, draft_version=current_draft_version)
        current_fields = self._current_fields(draft)
        proposed_patch = self._proposed_patch(payload)
        target_snapshot = self._target_snapshot(item=item, current_fields=current_fields)
        dry_run = self._dry_run(
            expected_draft_version=current_draft_version,
            current_fields=current_fields,
            proposed_patch=proposed_patch,
        )

        approval = await self.repo.create_approval(
            workspace_id=workspace_id,
            project_id=project_id,
            requester_user_id=requester_user_id,
            skill_id=payload.skill_id,
            tool_name=CONTENT_WRITER_TOOL_NAME,
            action=payload.action,
            target_type=payload.target_type,
            target_id=payload.target_id,
            expected_draft_version=current_draft_version,
            target_snapshot=target_snapshot,
            proposed_patch=proposed_patch,
            dry_run=dry_run,
            expires_at=self.clock() + timedelta(seconds=payload.expires_in_seconds),
            agent_run_id=payload.agent_run_id,
        )
        return self._to_out(approval)

    async def create_content_model_dry_run(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        requester_user_id: UUID,
        payload: AgentContentModelApprovalDryRunRequest,
    ) -> AgentApprovalOut:
        self._ensure_content_modeler_contract(payload)

        proposed_patch = self._model_proposed_patch(payload)
        target_snapshot = self._model_target_snapshot(payload)
        dry_run = self._model_dry_run(payload)
        approval = await self.repo.create_approval(
            workspace_id=workspace_id,
            project_id=project_id,
            requester_user_id=requester_user_id,
            skill_id=payload.skill_id,
            tool_name=CONTENT_MODELER_TOOL_NAME,
            action=payload.action,
            target_type=payload.target_type,
            target_id=payload.target_id,
            expected_draft_version=payload.expected_draft_revision,
            target_snapshot=target_snapshot,
            proposed_patch=proposed_patch,
            dry_run=dry_run,
            expires_at=self.clock() + timedelta(seconds=payload.expires_in_seconds),
            agent_run_id=payload.agent_run_id,
        )
        return self._to_out(approval)

    @staticmethod
    def _ensure_content_writer_contract(payload: AgentContentApprovalDryRunRequest) -> None:
        AgentApprovalService._ensure_approval_contract(
            skill_id=payload.skill_id,
            tool_name=payload.tool_name,
            action=payload.action,
            target_type=payload.target_type,
            expected_skill_id=CONTENT_WRITER_SKILL_ID,
            expected_tool_name=CONTENT_WRITER_TOOL_NAME,
            expected_action=CONTENT_WRITER_ACTION,
            expected_target_type=AgentApprovalTargetType.CONTENT_ITEM,
        )

    @staticmethod
    def _ensure_content_modeler_contract(payload: AgentContentModelApprovalDryRunRequest) -> None:
        AgentApprovalService._ensure_approval_contract(
            skill_id=payload.skill_id,
            tool_name=payload.tool_name,
            action=payload.action,
            target_type=payload.target_type,
            expected_skill_id=CONTENT_MODELER_SKILL_ID,
            expected_tool_name=CONTENT_MODELER_TOOL_NAME,
            expected_action=CONTENT_MODELER_ACTION,
            expected_target_type=AgentApprovalTargetType.CONTENT_MODEL,
        )

    @staticmethod
    def _ensure_approval_contract(
        *,
        skill_id: str,
        tool_name: str | None,
        action: str,
        target_type: AgentApprovalTargetType,
        expected_skill_id: str,
        expected_tool_name: str,
        expected_action: str,
        expected_target_type: AgentApprovalTargetType,
    ) -> None:
        mismatches: dict[str, object] = {}
        if skill_id != expected_skill_id:
            mismatches["skillId"] = skill_id
        if tool_name is not None and tool_name != expected_tool_name:
            mismatches["toolName"] = tool_name
        if action != expected_action:
            mismatches["action"] = action
        if target_type != expected_target_type:
            mismatches["targetType"] = target_type.value
        if not mismatches:
            return
        raise BadRequest(
            "Agent approval dry-run contract does not match the requested write surface",
            error="AGENT_APPROVAL_CONTRACT_MISMATCH",
            meta={
                "expected": {
                    "skillId": expected_skill_id,
                    "toolName": expected_tool_name,
                    "action": expected_action,
                    "targetType": expected_target_type.value,
                },
                "received": mismatches,
            },
        )

    async def list_approvals(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        status: AgentApprovalStatus | None = None,
    ) -> AgentApprovalListOut:
        approvals = await self.repo.list_approvals(workspace_id=workspace_id, project_id=project_id, status=status)
        now = self.clock()
        normalized = [await self._expire_approval_if_needed(approval, now=now) for approval in approvals]
        if status is not None:
            normalized = [approval for approval in normalized if approval.status == status]
        return AgentApprovalListOut(approvals=[self._to_out(approval) for approval in normalized])

    async def get_approval(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
    ) -> AgentApprovalOut:
        approval = await self.repo.get_scoped_approval(
            approval_id=approval_id,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        if approval is None:
            raise NotFound("Agent approval not found", error="AGENT_APPROVAL_NOT_FOUND")
        return self._to_out(await self._expire_approval_if_needed(approval, now=self.clock()))

    async def approve(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        approver_user_id: UUID,
        payload: AgentApprovalDecisionRequest,
        model_service: ProjectContentCanonicalModelsService | None = None,
    ) -> AgentApprovalOut:
        async with self.tx() as conn:
            approval = await self._require_pending_approval(
                approval_id=approval_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=conn,
                for_update=True,
            )
            if approval.target_type == AgentApprovalTargetType.CONTENT_ITEM:
                item = await self._current_target_item(
                    approval=approval,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    conn=conn,
                )
                self._ensure_target_version_current(approval=approval, item=item)
            elif approval.target_type == AgentApprovalTargetType.CONTENT_MODEL:
                if model_service is None:
                    raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")
                await self._ensure_target_model_revision_current(
                    approval=approval,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    model_service=model_service,
                )
            else:
                raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")

            updated = await self.repo.save_approval_fields(
                approval,
                fields={
                    "status": AgentApprovalStatus.APPROVED,
                    "approver_user_id": approver_user_id,
                    "approved_at": self.clock(),
                    "decision_reason": payload.reason,
                },
                conn=conn,
            )
        return self._to_out(updated)

    async def reject(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        rejecter_user_id: UUID,
        payload: AgentApprovalDecisionRequest,
    ) -> AgentApprovalOut:
        async with self.tx() as conn:
            approval = await self._require_pending_approval(
                approval_id=approval_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=conn,
                for_update=True,
            )
            updated = await self.repo.save_approval_fields(
                approval,
                fields={
                    "status": AgentApprovalStatus.REJECTED,
                    "approver_user_id": rejecter_user_id,
                    "rejected_at": self.clock(),
                    "decision_reason": payload.reason,
                },
                conn=conn,
            )
        return self._to_out(updated)

    async def modify_content_approval(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        payload: AgentContentApprovalModifyRequest,
        model_service: ProjectContentCanonicalModelsService | None = None,
    ) -> AgentApprovalOut:
        async with self.tx() as conn:
            approval = await self._require_pending_approval(
                approval_id=approval_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=conn,
                for_update=True,
            )
            if approval.target_type == AgentApprovalTargetType.CONTENT_MODEL:
                if model_service is None:
                    raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")
                return await self._modify_content_model_approval(
                    approval=approval,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    payload=payload,
                    model_service=model_service,
                    conn=conn,
                )
            if approval.target_type != AgentApprovalTargetType.CONTENT_ITEM:
                raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")

            item = await self._current_target_item(
                approval=approval,
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                conn=conn,
            )
            self._ensure_target_version_current(approval=approval, item=item)
            current_draft_version = int(item.draft_version or 0)
            draft = await self.repo.get_content_draft_version(
                item_id=item.id,
                draft_version=current_draft_version,
                conn=conn,
            )
            current_fields = self._current_fields(draft)
            proposed_patch = self._modified_content_patch(approval=approval, payload=payload)
            updated = await self.repo.save_approval_fields(
                approval,
                fields={
                    "target_snapshot": self._target_snapshot(item=item, current_fields=current_fields),
                    "proposed_patch": proposed_patch,
                    "dry_run": self._dry_run(
                        expected_draft_version=current_draft_version,
                        current_fields=current_fields,
                        proposed_patch=proposed_patch,
                    ),
                },
                conn=conn,
            )
        return self._to_out(updated)

    async def _modify_content_model_approval(
        self,
        *,
        approval: AgentApprovalRecord,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        payload: AgentContentApprovalModifyRequest,
        model_service: ProjectContentCanonicalModelsService,
        conn: BaseDBAsyncClient,
    ) -> AgentApprovalOut:
        if "fields_snapshot" in payload.model_fields_set or "presentations" in payload.model_fields_set:
            raise Conflict("Unsupported approval patch field", error="AGENT_APPROVAL_PAYLOAD_INVALID")
        await self._ensure_target_model_revision_current(
            approval=approval,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_service=model_service,
        )
        model_patch = self._modified_model_patch_payload(approval=approval, payload=payload)
        preview_result = await model_service.preview_model_update(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=self._require_target_id(approval),
            payload=model_patch,
        )
        if preview_result is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        impact_preview = to_preview_out(preview_result)
        dry_run_payload = AgentContentModelApprovalDryRunRequest(
            target_id=self._require_target_id(approval),
            expected_draft_revision=int(approval.expected_draft_version or 1),
            model_patch=model_patch,
            impact_preview=impact_preview,
            change_summary=(
                payload.change_summary
                if "change_summary" in payload.model_fields_set
                else self._current_change_summary(approval)
            ),
        )
        updated = await self.repo.save_approval_fields(
            approval,
            fields={
                "target_snapshot": self._model_target_snapshot(dry_run_payload),
                "proposed_patch": self._model_proposed_patch(dry_run_payload),
                "dry_run": self._model_dry_run(dry_run_payload),
            },
            conn=conn,
        )
        return self._to_out(updated)

    async def apply(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        actor_user_id: UUID,
        content_service: ProjectContentCanonicalItemsService,
        model_service: ProjectContentCanonicalModelsService | None = None,
        correlation_id: str | None = None,
    ) -> AgentApprovalApplyOut:
        expired_error: Conflict | None = None
        result: AgentApprovalApplyOut | None = None
        async with self.tx() as conn:
            approval = await self._require_approved_apply_status(
                approval_id=approval_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=conn,
                for_update=True,
            )
            now = self.clock()
            if approval.expires_at <= now:
                updated = await self.repo.save_approval_fields(
                    approval,
                    fields={"status": AgentApprovalStatus.EXPIRED, "expired_at": now},
                    conn=conn,
                )
                expired_error = Conflict(
                    "Agent approval expired",
                    error="AGENT_APPROVAL_EXPIRED",
                    meta={"approvalId": str(updated.id), "expiresAt": updated.expires_at.isoformat()},
                )
            else:
                if approval.target_type == AgentApprovalTargetType.CONTENT_ITEM:
                    result = await self._apply_content_item_approval(
                        approval=approval,
                        workspace_id=workspace_id,
                        site_id=site_id,
                        environment_id=environment_id,
                        actor_user_id=actor_user_id,
                        content_service=content_service,
                        applied_at=now,
                        conn=conn,
                    )
                elif approval.target_type != AgentApprovalTargetType.CONTENT_MODEL or model_service is None:
                    raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")
                else:
                    await self._ensure_target_model_revision_current(
                        approval=approval,
                        workspace_id=workspace_id,
                        site_id=site_id,
                        environment_id=environment_id,
                        model_service=model_service,
                    )
                    model_result = await model_service.update_model(
                        workspace_id=workspace_id,
                        site_id=site_id,
                        environment_id=environment_id,
                        model_id=self._require_target_id(approval),
                        actor_user_id=actor_user_id,
                        payload=self._build_model_update_payload(approval),
                    )
                    if model_result is None:
                        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
                    updated = await self.repo.save_approval_fields(
                        approval,
                        fields={"status": AgentApprovalStatus.APPLIED, "applied_at": now},
                        conn=conn,
                    )
                    result = AgentApprovalApplyOut(approval=self._to_out(updated), model=to_mutation_out(model_result))
                assert result is not None
                await self._write_apply_activity_event(
                    approval=approval,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    actor_user_id=actor_user_id,
                    applied_at=now,
                    correlation_id=correlation_id,
                    conn=conn,
                )
        if expired_error is not None:
            raise expired_error
        assert result is not None
        return result

    async def _write_apply_activity_event(
        self,
        *,
        approval: AgentApprovalRecord,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        actor_user_id: UUID,
        applied_at: datetime,
        correlation_id: str | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        target_id = self._require_target_id(approval)
        properties: JsonObject = {
            "approval_id": encode_uuid(approval.id),
            "agent_run_id": encode_uuid(approval.agent_run_id) if approval.agent_run_id is not None else None,
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
            "site_id": str(site_id),
            "environment_id": str(environment_id) if environment_id is not None else None,
            "skill_id": approval.skill_id,
            "tool_name": approval.tool_name,
            "action": approval.action,
            "target_type": approval.target_type.value,
            "target_id": encode_uuid(target_id),
            "expected_draft_version": approval.expected_draft_version,
            "correlation_id": correlation_id,
            "applied_at": applied_at.isoformat(),
        }
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=AGENT_APPROVAL_APPLIED_EVENT,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type=f"agent_approval_{approval.target_type.value}",
                entity_id=approval.id,
                source="agent",
                trace_id=correlation_id,
                occurred_at=applied_at,
                properties=properties,
            ),
            conn=conn,
        )

    async def _apply_content_item_approval(
        self,
        *,
        approval: AgentApprovalRecord,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        actor_user_id: UUID,
        content_service: ProjectContentCanonicalItemsService,
        applied_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> AgentApprovalApplyOut:
        item = await self._current_target_item(
            approval=approval,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            conn=conn,
            for_update=True,
        )
        self._ensure_target_version_current(approval=approval, item=item)
        version = await content_service.save_draft_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item.id,
            actor_user_id=actor_user_id,
            payload=self._build_draft_save_payload(approval),
            conn=conn,
        )
        updated = await self.repo.save_approval_fields(
            approval,
            fields={"status": AgentApprovalStatus.APPLIED, "applied_at": applied_at},
            conn=conn,
        )
        return AgentApprovalApplyOut(approval=self._to_out(updated), version=version)

    async def _require_pending_approval(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> AgentApprovalRecord:
        approval = await self.repo.get_scoped_approval(
            approval_id=approval_id,
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
            for_update=for_update,
        )
        if approval is None:
            raise NotFound("Agent approval not found", error="AGENT_APPROVAL_NOT_FOUND")
        if approval.status != AgentApprovalStatus.PENDING:
            raise Conflict("Agent approval is already decided", error="AGENT_APPROVAL_REPLAY")
        now = self.clock()
        if approval.expires_at <= now:
            updated = await self._expire_approval_if_needed(approval, now=now, conn=conn)
            raise Conflict(
                "Agent approval expired",
                error="AGENT_APPROVAL_EXPIRED",
                meta={"approvalId": str(updated.id), "expiresAt": updated.expires_at.isoformat()},
            )
        return approval

    async def _expire_approval_if_needed(
        self,
        approval: AgentApprovalRecord,
        *,
        now: datetime,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentApprovalRecord:
        if approval.status != AgentApprovalStatus.PENDING or approval.expires_at > now:
            return approval
        return await self.repo.save_approval_fields(
            approval,
            fields={"status": AgentApprovalStatus.EXPIRED, "expired_at": now},
            conn=conn,
        )

    async def _require_approved_apply_status(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> AgentApprovalRecord:
        approval = await self.repo.get_scoped_approval(
            approval_id=approval_id,
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
            for_update=for_update,
        )
        if approval is None:
            raise NotFound("Agent approval not found", error="AGENT_APPROVAL_NOT_FOUND")
        if approval.status == AgentApprovalStatus.APPLIED:
            raise Conflict("Agent approval was already applied", error="AGENT_APPROVAL_REPLAY")
        if approval.status != AgentApprovalStatus.APPROVED:
            raise Conflict("Agent approval is not approved", error="AGENT_APPROVAL_APPLY_NOT_APPROVED")
        return approval

    async def _current_target_item(
        self,
        *,
        approval: AgentApprovalRecord,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> ContentItemRecord:
        if approval.target_type != AgentApprovalTargetType.CONTENT_ITEM or approval.target_id is None:
            raise Conflict("Unsupported approval target type", error="AGENT_APPROVAL_TARGET_UNSUPPORTED")
        item = await self.repo.get_content_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=approval.target_id,
            conn=conn,
            for_update=for_update,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        return item

    def _ensure_target_version_current(
        self,
        *,
        approval: AgentApprovalRecord,
        item: ContentItemRecord,
    ) -> None:
        current_draft_version = int(item.draft_version or 0)
        if approval.expected_draft_version != current_draft_version:
            raise Conflict(
                "Approval target draft version changed",
                error="AGENT_APPROVAL_STALE_TARGET",
                meta={
                    "expectedDraftVersion": approval.expected_draft_version,
                    "currentDraftVersion": current_draft_version,
                },
            )

    async def _ensure_target_model_revision_current(
        self,
        *,
        approval: AgentApprovalRecord,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        model_service: ProjectContentCanonicalModelsService,
    ) -> None:
        snapshot = await model_service.get_model_json_preview(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=self._require_target_id(approval),
        )
        if snapshot is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        current_revision = int(snapshot.revision or 1)
        if approval.expected_draft_version != current_revision:
            raise Conflict(
                "Approval target draft revision changed",
                error="AGENT_APPROVAL_STALE_TARGET",
                meta={
                    "expectedDraftVersion": approval.expected_draft_version,
                    "currentDraftVersion": current_revision,
                },
            )

    @staticmethod
    def _current_fields(draft: ContentVersionRecord | None) -> JsonObject:
        if draft is None or not isinstance(draft.fields_snapshot, dict):
            return {}
        return cast(JsonObject, draft.fields_snapshot)

    @staticmethod
    def _proposed_patch(payload: AgentContentApprovalDryRunRequest) -> JsonObject:
        patch: JsonObject = {}
        if "change_summary" in payload.model_fields_set:
            patch["changeSummary"] = payload.change_summary
        if "fields_snapshot" in payload.model_fields_set:
            patch["fieldsSnapshot"] = payload.fields_snapshot or {}
        if "presentations" in payload.model_fields_set:
            patch["presentations"] = [
                cast(JsonObject, presentation.model_dump(mode="json", by_alias=True))
                for presentation in payload.presentations or []
            ]
        return patch

    @staticmethod
    def _modified_content_patch(
        *,
        approval: AgentApprovalRecord,
        payload: AgentContentApprovalModifyRequest,
    ) -> JsonObject:
        current_patch = approval.proposed_patch if isinstance(approval.proposed_patch, dict) else {}
        patch: JsonObject = cast(JsonObject, {**current_patch})
        if "change_summary" in payload.model_fields_set:
            patch["changeSummary"] = payload.change_summary
        if "fields_snapshot" in payload.model_fields_set:
            patch["fieldsSnapshot"] = cast(JsonObject, payload.fields_snapshot or {})
        if "presentations" in payload.model_fields_set:
            patch["presentations"] = [
                cast(JsonObject, presentation.model_dump(mode="json", by_alias=True))
                for presentation in payload.presentations or []
            ]
        return patch

    @staticmethod
    def _modified_model_patch_payload(
        *,
        approval: AgentApprovalRecord,
        payload: AgentContentApprovalModifyRequest,
    ) -> ContentModelDefinitionPatchContract:
        if "model_patch" in payload.model_fields_set:
            if payload.model_patch is None:
                raise Conflict(
                    "Agent approval model patch is missing",
                    error="AGENT_APPROVAL_PAYLOAD_INVALID",
                    meta={"approvalId": str(approval.id)},
                )
            model_patch = payload.model_patch
        else:
            model_patch = AgentApprovalService._current_model_patch(approval)
        if model_patch.impact_preview_token is not None:
            raise Conflict(
                "Agent approval model patch must not include an impact preview token",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )
        return model_patch

    @staticmethod
    def _current_model_patch(approval: AgentApprovalRecord) -> ContentModelDefinitionPatchContract:
        proposed_patch = approval.proposed_patch if isinstance(approval.proposed_patch, dict) else {}
        model_patch = proposed_patch.get("modelPatch")
        if not isinstance(model_patch, dict):
            raise Conflict(
                "Approved Agent model payload is incomplete",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )
        try:
            return ContentModelDefinitionPatchContract.model_validate(model_patch)
        except ValidationError as exc:
            raise Conflict(
                "Approved Agent model payload is invalid",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id), "details": exc.errors(include_url=False)},
            ) from exc

    @staticmethod
    def _current_change_summary(approval: AgentApprovalRecord) -> str | None:
        proposed_patch = approval.proposed_patch if isinstance(approval.proposed_patch, dict) else {}
        change_summary = proposed_patch.get("changeSummary")
        return change_summary if isinstance(change_summary, str) else None

    @staticmethod
    def _target_snapshot(*, item: ContentItemRecord, current_fields: JsonObject) -> JsonObject:
        model_definition = getattr(item, "model_definition", None)
        model_key = getattr(model_definition, "singular_key", None)
        return {
            "contentItemId": encode_uuid(item.id),
            "title": item.title,
            "locale": item.locale,
            "modelKey": str(model_key) if model_key is not None else None,
            "status": str(item.status),
            "draftVersion": int(item.draft_version or 0),
            "publishedVersion": int(item.published_version) if item.published_version is not None else None,
            "currentFields": current_fields,
        }

    @staticmethod
    def _dry_run(
        *,
        expected_draft_version: int,
        current_fields: JsonObject,
        proposed_patch: JsonObject,
    ) -> JsonObject:
        next_fields = proposed_patch.get("fieldsSnapshot")
        field_changes: list[JsonObject] = []
        if isinstance(next_fields, dict):
            keys = sorted(set(current_fields.keys()) | set(next_fields.keys()))
            field_changes = [
                {
                    "field": key,
                    "before": cast(JsonValue, current_fields.get(key)),
                    "after": cast(JsonValue, next_fields.get(key)),
                }
                for key in keys
                if current_fields.get(key) != next_fields.get(key)
            ]

        presentations = proposed_patch.get("presentations")
        presentation_count = len(presentations) if isinstance(presentations, list) else None
        return {
            "operation": "content_item.update_draft",
            "willApply": False,
            "requiresApproval": True,
            "expectedDraftVersion": expected_draft_version,
            "fieldChanges": field_changes,
            "presentationReplacementCount": presentation_count,
        }

    @staticmethod
    def _model_proposed_patch(payload: AgentContentModelApprovalDryRunRequest) -> JsonObject:
        return {
            "changeSummary": payload.change_summary,
            "modelPatch": cast(
                JsonObject,
                payload.model_patch.model_dump(mode="json", by_alias=True, exclude_none=True),
            ),
            "impactPreviewToken": payload.impact_preview.preview_token,
            "impactPreview": cast(
                JsonObject,
                payload.impact_preview.model_dump(mode="json", by_alias=True),
            ),
        }

    @staticmethod
    def _model_target_snapshot(payload: AgentContentModelApprovalDryRunRequest) -> JsonObject:
        current_snapshot = payload.impact_preview.change_plan.current_snapshot
        return {
            "contentModelId": encode_uuid(payload.target_id),
            "draftRevision": payload.expected_draft_revision,
            "currentSnapshot": cast(JsonObject, current_snapshot.model_dump(mode="json", by_alias=True)),
        }

    @staticmethod
    def _model_dry_run(payload: AgentContentModelApprovalDryRunRequest) -> JsonObject:
        preview = payload.impact_preview
        return {
            "operation": payload.action,
            "willApply": False,
            "requiresApproval": True,
            "expectedDraftRevision": payload.expected_draft_revision,
            "affectedItemsCount": preview.affected_items_count,
            "recoveryItemsCount": preview.recovery_items_count,
            "reshapeItemsCount": preview.reshape_items_count,
            "hasBlockingChanges": preview.has_blocking_changes,
            "impact": cast(JsonObject, preview.impact.model_dump(mode="json", by_alias=True)),
            "changePlan": cast(JsonObject, preview.change_plan.model_dump(mode="json", by_alias=True)),
        }

    @staticmethod
    def _build_draft_save_payload(approval: AgentApprovalRecord) -> ContentVersionDraftSaveIn:
        proposed_patch = approval.proposed_patch if isinstance(approval.proposed_patch, dict) else {}
        fields_snapshot = proposed_patch.get("fieldsSnapshot")
        presentations = proposed_patch.get("presentations")
        if not isinstance(fields_snapshot, dict) or not isinstance(presentations, list):
            raise Conflict(
                "Approved Agent payload is incomplete",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )

        try:
            presentation_payload = [
                ContentPresentationIn.model_validate(presentation) for presentation in presentations
            ]
        except ValidationError as exc:
            raise Conflict(
                "Approved Agent presentation payload is invalid",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            ) from exc

        change_summary = proposed_patch.get("changeSummary")
        if change_summary is not None and not isinstance(change_summary, str):
            raise Conflict(
                "Approved Agent change summary is invalid",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )

        return ContentVersionDraftSaveIn(
            expected_version=approval.expected_draft_version,
            change_summary=change_summary,
            fields_snapshot=cast(JsonObject, fields_snapshot),
            presentations=presentation_payload,
        )

    @staticmethod
    def _build_model_update_payload(approval: AgentApprovalRecord) -> ContentModelDefinitionPatchContract:
        proposed_patch = approval.proposed_patch if isinstance(approval.proposed_patch, dict) else {}
        model_patch = proposed_patch.get("modelPatch")
        preview_token = proposed_patch.get("impactPreviewToken")
        if not isinstance(model_patch, dict) or not isinstance(preview_token, str) or not preview_token.strip():
            raise Conflict(
                "Approved Agent model payload is incomplete",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )
        payload = {**model_patch, "impactPreviewToken": preview_token}
        try:
            return ContentModelDefinitionPatchContract.model_validate(payload)
        except ValidationError as exc:
            raise Conflict(
                "Approved Agent model payload is invalid",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id), "details": exc.errors(include_url=False)},
            ) from exc

    @staticmethod
    def _require_target_id(approval: AgentApprovalRecord) -> UUID:
        if approval.target_id is None:
            raise Conflict(
                "Approved Agent target is missing",
                error="AGENT_APPROVAL_PAYLOAD_INVALID",
                meta={"approvalId": str(approval.id)},
            )
        return approval.target_id

    @staticmethod
    def _to_out(approval: AgentApprovalRecord) -> AgentApprovalOut:
        return AgentApprovalOut(
            id=approval.id,
            requester_user_id=approval.requester_user_id,
            approver_user_id=approval.approver_user_id,
            skill_id=approval.skill_id,
            tool_name=approval.tool_name,
            action=approval.action,
            target_type=AgentApprovalTargetType(str(approval.target_type)),
            target_id=approval.target_id,
            expected_draft_version=approval.expected_draft_version,
            target_snapshot=cast(JsonObject, approval.target_snapshot or {}),
            proposed_patch=cast(JsonObject, approval.proposed_patch or {}),
            dry_run=cast(JsonObject, approval.dry_run or {}),
            status=AgentApprovalStatus(str(approval.status)),
            expires_at=approval.expires_at,
            approved_at=approval.approved_at,
            rejected_at=approval.rejected_at,
            expired_at=approval.expired_at,
            applied_at=approval.applied_at,
            decision_reason=approval.decision_reason,
            created_at=approval.created_at,
            updated_at=approval.updated_at,
        )
