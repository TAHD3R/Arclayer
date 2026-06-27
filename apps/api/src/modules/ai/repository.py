from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.conversation import AgentConversationMode, AgentConversationRecord
from src.modules.ai.schema import AIConversationMessage


class AIConversationRepository(TortoiseORMRepository):
    async def list_for_user(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        limit: int,
    ) -> list[AgentConversationRecord]:
        return await (
            AgentConversationRecord
            .filter(workspace_id=workspace_id, user_id=user_id)
            .order_by("-updated_at", "-created_at")
            .limit(limit)
        )

    async def get_for_user(
        self,
        *,
        conversation_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
    ) -> AgentConversationRecord | None:
        return await AgentConversationRecord.filter(
            id=conversation_id,
            workspace_id=workspace_id,
            user_id=user_id,
        ).first()

    async def create_conversation(
        self,
        *,
        conversation_id: UUID | None,
        workspace_id: UUID,
        user_id: UUID,
        title: str,
        mode: AgentConversationMode,
        model: str | None,
        reasoning_effort: str | None,
        messages: list[AIConversationMessage],
        project_id: UUID | None,
        runtime_id: UUID | None,
        site_id: UUID | None,
        environment_id: UUID | None,
        context_snapshot: JsonObject,
    ) -> AgentConversationRecord:
        if conversation_id is not None:
            return await AgentConversationRecord.create(
                id=conversation_id,
                workspace_id=workspace_id,
                user_id=user_id,
                title=title,
                mode=mode,
                model=model,
                reasoning_effort=reasoning_effort,
                messages=_serialize_messages(messages),
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                context_snapshot=context_snapshot,
            )
        return await AgentConversationRecord.create(
            workspace_id=workspace_id,
            user_id=user_id,
            title=title,
            mode=mode,
            model=model,
            reasoning_effort=reasoning_effort,
            messages=_serialize_messages(messages),
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            context_snapshot=context_snapshot,
        )

    async def update_conversation(
        self,
        record: AgentConversationRecord,
        *,
        title: str | None,
        mode: AgentConversationMode | None,
        model: str | None,
        reasoning_effort: str | None,
        messages: list[AIConversationMessage] | None,
        project_id: UUID | None,
        runtime_id: UUID | None,
        site_id: UUID | None,
        environment_id: UUID | None,
        context_snapshot: JsonObject | None,
        context_fields: set[str] | None = None,
    ) -> AgentConversationRecord:
        update_fields = ["updated_at"]
        explicit_context_fields = context_fields or set()
        if title is not None:
            record.title = title
            update_fields.append("title")
        if mode is not None:
            record.mode = mode
            update_fields.append("mode")
        if model is not None:
            record.model = model
            update_fields.append("model")
        if reasoning_effort is not None:
            record.reasoning_effort = reasoning_effort
            update_fields.append("reasoning_effort")
        if messages is not None:
            record.messages = _serialize_messages(messages)
            update_fields.append("messages")
        if project_id is not None or "project_id" in explicit_context_fields:
            record.project_id = project_id
            update_fields.append("project_id")
        if runtime_id is not None or "runtime_id" in explicit_context_fields:
            record.runtime_id = runtime_id
            update_fields.append("runtime_id")
        if site_id is not None or "site_id" in explicit_context_fields:
            record.site_id = site_id
            update_fields.append("site_id")
        if environment_id is not None or "environment_id" in explicit_context_fields:
            record.environment_id = environment_id
            update_fields.append("environment_id")
        if context_snapshot is not None:
            record.context_snapshot = context_snapshot
            update_fields.append("context_snapshot")
        await record.save(update_fields=update_fields)
        return record

    async def delete_conversation(
        self,
        *,
        conversation_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
    ) -> bool:
        deleted_count = await AgentConversationRecord.filter(
            id=conversation_id,
            workspace_id=workspace_id,
            user_id=user_id,
        ).delete()
        return deleted_count > 0

    async def delete_older_than(
        self,
        *,
        cutoff: datetime,
        batch_size: int,
    ) -> int:
        ids = (
            await AgentConversationRecord
            .filter(updated_at__lt=cutoff)
            .order_by("updated_at", "created_at")
            .limit(batch_size)
            .values_list("id", flat=True)
        )
        if not ids:
            return 0
        return int(await AgentConversationRecord.filter(id__in=list(ids)).delete())


def _serialize_messages(messages: list[AIConversationMessage]) -> list[JsonObject]:
    return [cast(JsonObject, message.model_dump(mode="json")) for message in messages]
