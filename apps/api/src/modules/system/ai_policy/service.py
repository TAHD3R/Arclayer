from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.ai.global_policy import GlobalAiPolicyRevision, GlobalAiPolicyRevisionStatus
from src.modules.ai.agent_tool_grants import SUPPORTED_AGENT_TOOL_GRANTS
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.system.ai_policy.schema import (
    AiPolicyApplyOut,
    AiPolicyApplyRequest,
    AiPolicyDraftInput,
    AiPolicyOut,
    AiPolicyPreviewOut,
    AiPolicyPublishRequest,
    AiPolicyRevisionOut,
)
from src.modules.system.ai_providers.configuration import list_active_system_models


class SystemAiPolicyService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def get_policy(self) -> AiPolicyOut:
        draft = (
            await GlobalAiPolicyRevision.filter(status=GlobalAiPolicyRevisionStatus.DRAFT).order_by("-sequence").first()
        )
        published = (
            await GlobalAiPolicyRevision
            .filter(status=GlobalAiPolicyRevisionStatus.PUBLISHED)
            .order_by("-sequence")
            .first()
        )
        return AiPolicyOut(
            draft=self._to_out(draft) if draft else None, published=self._to_out(published) if published else None
        )

    async def create_or_replace_draft(self, payload: AiPolicyDraftInput, *, actor_user_id: UUID) -> AiPolicyRevisionOut:
        await self._validate_catalog(payload)
        current = (
            await GlobalAiPolicyRevision.filter(status=GlobalAiPolicyRevisionStatus.DRAFT).order_by("-sequence").first()
        )
        sequence = (current.sequence + 1) if current else await self._next_sequence()
        values = payload.model_dump()
        content_hash = self._content_hash(values)
        if current and current.content_hash == content_hash:
            return self._to_out(current)
        if current:
            current.status = GlobalAiPolicyRevisionStatus.RETIRED
            await current.save(update_fields=["status", "updated_at"])
        record = await GlobalAiPolicyRevision.create(id=uuid7(), sequence=sequence, content_hash=content_hash, **values)
        await self._audit("ai.policy.draft_saved", actor_user_id, record.id, {"sequence": sequence})
        return self._to_out(record)

    async def preview(self, draft_id: UUID) -> AiPolicyPreviewOut:
        draft = await self._get_draft(draft_id)
        unsupported = self._unsupported_controls(draft)
        return AiPolicyPreviewOut(
            draft_id=draft.id,
            source_hash=draft.content_hash,
            model_count=len(draft.allowed_models),
            tool_count=len(draft.tool_allowlist),
            unsupported_controls=tuple(unsupported),
            is_applicable=not unsupported,
        )

    async def publish(self, request: AiPolicyPublishRequest, *, actor_user_id: UUID) -> AiPolicyRevisionOut:
        draft = await self._get_draft(request.draft_id)
        if draft.content_hash != request.preview_hash:
            raise Conflict(message=t("errors", "AI_POLICY_PREVIEW_STALE"), error="AI_POLICY_PREVIEW_STALE")
        preview = await self.preview(draft.id)
        if not preview.is_applicable:
            raise BadRequest(
                message=t("errors", "AI_POLICY_UNSUPPORTED_CONTROL"), error="AI_POLICY_UNSUPPORTED_CONTROL"
            )
        published = (
            await GlobalAiPolicyRevision
            .filter(status=GlobalAiPolicyRevisionStatus.PUBLISHED)
            .order_by("-sequence")
            .first()
        )
        if published:
            published.status = GlobalAiPolicyRevisionStatus.RETIRED
            await published.save(update_fields=["status", "updated_at"])
        draft.status = GlobalAiPolicyRevisionStatus.PUBLISHED
        draft.published_at = datetime.now(UTC)
        await draft.save(update_fields=["status", "published_at", "updated_at"])
        await self._audit("ai.policy.published", actor_user_id, draft.id, {"reason": request.reason})
        return self._to_out(draft)

    async def apply(self, request: AiPolicyApplyRequest, *, actor_user_id: UUID) -> AiPolicyApplyOut:
        revision = await GlobalAiPolicyRevision.get_or_none(id=request.revision_id)
        if revision is None or revision.status != GlobalAiPolicyRevisionStatus.PUBLISHED:
            raise NotFound(message=t("errors", "AI_POLICY_REVISION_NOT_FOUND"), error="AI_POLICY_REVISION_NOT_FOUND")
        idempotency_hash = hashlib.sha256(request.idempotency_key.encode()).hexdigest()
        fingerprint = hashlib.sha256(
            json.dumps({"revision_id": str(revision.id), "reason": request.reason}, sort_keys=True).encode()
        ).hexdigest()
        if revision.applied_at is None:
            revision.applied_at = datetime.now(UTC)
            revision.applied_idempotency_key_hash = idempotency_hash
            revision.applied_request_fingerprint = fingerprint
            await revision.save(
                update_fields=[
                    "applied_at",
                    "applied_idempotency_key_hash",
                    "applied_request_fingerprint",
                    "updated_at",
                ]
            )
            await self._audit(
                "ai.policy.applied",
                actor_user_id,
                revision.id,
                {"reason": request.reason, "idempotency_key_hash": idempotency_hash},
            )
            return AiPolicyApplyOut(revision=self._to_out(revision), replayed=False)
        if (
            revision.applied_idempotency_key_hash != idempotency_hash
            or revision.applied_request_fingerprint != fingerprint
        ):
            raise Conflict(
                message=t("errors", "AI_POLICY_APPLY_IDEMPOTENCY_CONFLICT"),
                error="AI_POLICY_APPLY_IDEMPOTENCY_CONFLICT",
            )
        return AiPolicyApplyOut(revision=self._to_out(revision), replayed=True)

    async def _get_draft(self, draft_id: UUID) -> GlobalAiPolicyRevision:
        draft = await GlobalAiPolicyRevision.get_or_none(id=draft_id, status=GlobalAiPolicyRevisionStatus.DRAFT)
        if draft is None:
            raise NotFound(message=t("errors", "AI_POLICY_DRAFT_NOT_FOUND"), error="AI_POLICY_DRAFT_NOT_FOUND")
        return draft

    async def _next_sequence(self) -> int:
        latest = await GlobalAiPolicyRevision.all().order_by("-sequence").first()
        return (latest.sequence + 1) if latest else 1

    @staticmethod
    def _content_hash(values: dict[str, object]) -> str:
        encoded = json.dumps(values, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _unsupported_controls(record: GlobalAiPolicyRevision) -> list[str]:
        unsupported = ["retention_days"] if record.retention_days else []
        unsupported.extend(
            f"approval_required_effect_classes:{effect_class}"
            for effect_class in record.approval_required_effect_classes
            if effect_class != "write"
        )
        return unsupported

    @staticmethod
    async def _validate_catalog(payload: AiPolicyDraftInput) -> None:
        if not payload.allowed_models and payload.default_model:
            raise BadRequest(
                message=t("errors", "AI_POLICY_DEFAULT_MODEL_REQUIRES_ALLOWLIST"),
                error="AI_POLICY_DEFAULT_MODEL_REQUIRES_ALLOWLIST",
            )
        unsupported_tools = sorted(set(payload.tool_allowlist) - set(SUPPORTED_AGENT_TOOL_GRANTS))
        if unsupported_tools:
            raise BadRequest(
                message=t("errors", "AI_POLICY_TOOL_NOT_SUPPORTED"),
                error="AI_POLICY_TOOL_NOT_SUPPORTED",
            )
        configured_models = await list_active_system_models()
        configured_names = {item.public_model for item in configured_models}
        if any(model not in configured_names for model in payload.allowed_models):
            raise BadRequest(
                message=t("errors", "AI_POLICY_MODEL_NOT_CONFIGURED"),
                error="AI_POLICY_MODEL_NOT_CONFIGURED",
            )
        if payload.default_model is not None and payload.default_model not in configured_names:
            raise BadRequest(
                message=t("errors", "AI_POLICY_DEFAULT_MODEL_NOT_CONFIGURED"),
                error="AI_POLICY_DEFAULT_MODEL_NOT_CONFIGURED",
            )

    async def _audit(self, event_name: str, actor_user_id: UUID, entity_id: UUID, properties: JsonObject) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type="ai_policy_revision",
                entity_id=entity_id,
                source="platform",
                properties=properties,
            ),
        )

    @staticmethod
    def _to_out(record: GlobalAiPolicyRevision) -> AiPolicyRevisionOut:
        return AiPolicyRevisionOut.model_validate(record, from_attributes=True)
