from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict
from src.models.ai.global_policy import GlobalAiPolicyRevision, GlobalAiPolicyRevisionStatus
from src.modules.system.ai_policy.schema import AiPolicyApplyRequest, AiPolicyDraftInput
from src.modules.system.ai_policy.service import SystemAiPolicyService


def make_revision(
    *, status: GlobalAiPolicyRevisionStatus, applied_at: datetime | None = None
) -> GlobalAiPolicyRevision:
    return GlobalAiPolicyRevision(
        id=uuid4(),
        sequence=2,
        status=status,
        allowed_models=["gpt-4o-mini"],
        default_model="gpt-4o-mini",
        max_tokens_per_request=1024,
        max_cost_micros_per_request=1000,
        max_concurrent_runs=2,
        external_data_egress_allowed=False,
        tool_allowlist=["project.read"],
        approval_required_effect_classes=["write"],
        retry_limit=2,
        content_hash="a" * 64,
        published_at=datetime.now(UTC) if status is GlobalAiPolicyRevisionStatus.PUBLISHED else None,
        applied_at=applied_at,
    )


def test_draft_rejects_default_model_substitution() -> None:
    with pytest.raises(ValidationError, match="AI_POLICY_DEFAULT_MODEL_NOT_ALLOWED"):
        AiPolicyDraftInput(allowed_models=["gpt-4o-mini"], default_model="claude-sonnet-4-6")


@pytest.mark.asyncio
async def test_preview_has_no_unsupported_controls_for_enforced_fields() -> None:
    service = SystemAiPolicyService(Settings())
    draft = make_revision(status=GlobalAiPolicyRevisionStatus.DRAFT)
    with patch.object(service, "_get_draft", new=AsyncMock(return_value=draft)):
        preview = await service.preview(draft.id)
    assert preview.is_applicable is True
    assert preview.unsupported_controls == ()


@pytest.mark.asyncio
async def test_preview_marks_unenforced_approval_classes() -> None:
    service = SystemAiPolicyService(Settings())
    draft = make_revision(status=GlobalAiPolicyRevisionStatus.DRAFT)
    draft.approval_required_effect_classes = ["external_egress"]
    with patch.object(service, "_get_draft", new=AsyncMock(return_value=draft)):
        preview = await service.preview(draft.id)
    assert preview.is_applicable is False
    assert preview.unsupported_controls == ("approval_required_effect_classes:external_egress",)


@pytest.mark.asyncio
async def test_draft_rejects_unconfigured_models_and_tools() -> None:
    service = SystemAiPolicyService(Settings())
    with patch(
        "src.modules.system.ai_policy.service.list_active_system_models",
        new=AsyncMock(return_value=[]),
    ):
        with pytest.raises(BadRequest) as model_error:
            await service.create_or_replace_draft(
                AiPolicyDraftInput(allowed_models=["missing-model"]),
                actor_user_id=uuid4(),
            )
    assert model_error.value.error == "AI_POLICY_MODEL_NOT_CONFIGURED"

    with pytest.raises(BadRequest) as tool_error:
        await service.create_or_replace_draft(
            AiPolicyDraftInput(tool_allowlist=["unsupported.tool"]),
            actor_user_id=uuid4(),
        )
    assert tool_error.value.error == "AI_POLICY_TOOL_NOT_SUPPORTED"


@pytest.mark.asyncio
async def test_apply_replays_exact_identity_and_rejects_conflict() -> None:
    service = SystemAiPolicyService(Settings())
    revision = make_revision(status=GlobalAiPolicyRevisionStatus.PUBLISHED, applied_at=datetime.now(UTC))
    request = AiPolicyApplyRequest(revision_id=revision.id, idempotency_key="k", reason="same")
    revision.applied_idempotency_key_hash = hashlib.sha256(b"k").hexdigest()
    revision.applied_request_fingerprint = hashlib.sha256(
        json.dumps({"revision_id": str(revision.id), "reason": "same"}, sort_keys=True).encode()
    ).hexdigest()
    with patch.object(GlobalAiPolicyRevision, "get_or_none", new=AsyncMock(return_value=revision)):
        with patch.object(service, "_audit", new=AsyncMock()):
            replay = await service.apply(request, actor_user_id=uuid4())
    assert replay.replayed is True

    conflicting = request.model_copy(update={"reason": "changed"})
    with patch.object(GlobalAiPolicyRevision, "get_or_none", new=AsyncMock(return_value=revision)):
        with pytest.raises(Conflict) as exc_info:
            await service.apply(conflicting, actor_user_id=uuid4())
    assert exc_info.value.error == "AI_POLICY_APPLY_IDEMPOTENCY_CONFLICT"
