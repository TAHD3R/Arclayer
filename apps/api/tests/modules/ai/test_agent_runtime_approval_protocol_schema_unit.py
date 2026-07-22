from __future__ import annotations

from copy import deepcopy
from typing import cast

import pytest
from pydantic import TypeAdapter, ValidationError

from src.common.types.json_types import JsonObject, JsonValue
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalRequiredEventV1,
    ApprovalResolvedEventV1,
    RunInterruptedEventV1,
    RunResumedEventV1,
)
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
    ToolResponseCommandV1,
)


def _envelope(*, event_type: str, sequence: int, data: dict[str, object]) -> dict[str, object]:
    return {
        "eventVersion": 1,
        "eventId": f"event-approval-{sequence}",
        "cursor": f"cursor-approval-{sequence}",
        "type": event_type,
        "runId": "3dc77f5d-0381-4857-9c17-7b660b7fc14a",
        "threadId": "f63178b3-8c99-4a77-9614-797320e7b028",
        "sequence": sequence,
        "occurredAt": f"2026-07-19T06:00:{sequence:02d}.000Z",
        "correlationId": "correlation-approval",
        "spanId": "span-approval",
        "parentSpanId": "span-tool",
        "data": data,
    }


def _approval(*, status: str = "pending") -> dict[str, object]:
    return {
        "approvalId": "approval-publish-1",
        "approvalVersion": 1,
        "toolCallId": "tool-call-publish-1",
        "checkpointId": "checkpoint-publish-1",
        "status": status,
        "requestedAt": "2026-07-19T06:00:04.000Z",
        "expiresAt": "2026-07-19T07:00:04.000Z",
        "policyVersion": "policy-v1",
        "risk": {
            "sideEffectClass": "publish",
            "summaryKey": "agents.approval.publish.summary",
            "summaryParams": {"target": "production"},
            "previewRef": "preview-publish-1",
        },
        "options": [
            {
                "id": "allow_once",
                "kind": "allow-once",
                "labelKey": "agents.approval.allowOnce",
                "descriptionKey": "agents.approval.allowOnceDescription",
                "grants": [],
                "confirm": True,
            },
            {
                "id": "reject_once",
                "kind": "reject-once",
                "labelKey": "agents.approval.rejectOnce",
                "descriptionKey": "agents.approval.rejectOnceDescription",
                "grants": [],
                "confirm": False,
            },
        ],
    }


def _nested_object(value: object, key: str) -> JsonObject:
    return cast(JsonObject, cast(JsonObject, value)[key])


def test_approval_and_interrupt_events_validate_canonical_contract() -> None:
    required = ApprovalRequiredEventV1.model_validate(
        _envelope(
            event_type="approval.required",
            sequence=4,
            data={
                "approval": _approval(),
                "messageId": "6bf69fe2-c1de-4c50-ad37-73022a6a1676",
                "partId": "a704eaca-b99a-4132-837d-de4304cbfb2c",
            },
        )
    )
    interrupted = RunInterruptedEventV1.model_validate(
        _envelope(
            event_type="run.interrupted",
            sequence=5,
            data={
                "interruptId": "interrupt-publish-1",
                "checkpointId": "checkpoint-publish-1",
                "reason": "approval_required",
                "approvalId": "approval-publish-1",
                "toolCallId": "tool-call-publish-1",
            },
        )
    )
    resolved = ApprovalResolvedEventV1.model_validate(
        _envelope(
            event_type="approval.resolved",
            sequence=6,
            data={
                "approval": _approval(status="approved"),
                "resolvedAt": "2026-07-19T06:01:00.000Z",
                "resolvedByActorId": "a12264f6-5cac-4f20-b4a6-a3541f806e9d",
            },
        )
    )
    resumed = RunResumedEventV1.model_validate(
        _envelope(
            event_type="run.resumed",
            sequence=7,
            data={
                "interruptId": "interrupt-publish-1",
                "checkpointId": "checkpoint-publish-1",
                "resumedAt": "2026-07-19T06:01:01.000Z",
                "resumeKind": "approval",
            },
        )
    )

    assert required.data.approval.risk.side_effect_class == "publish"
    assert interrupted.data.reason == "approval_required"
    assert resolved.data.approval.status == "approved"
    assert resumed.data.resume_kind == "approval"


def test_approval_events_reject_ambiguous_or_stale_public_payloads() -> None:
    required = _envelope(
        event_type="approval.required",
        sequence=4,
        data={
            "approval": _approval(),
            "messageId": "6bf69fe2-c1de-4c50-ad37-73022a6a1676",
            "partId": "a704eaca-b99a-4132-837d-de4304cbfb2c",
        },
    )
    no_span = deepcopy(required)
    no_span["spanId"] = None
    no_options = deepcopy(required)
    _nested_object(no_options["data"], "approval")["options"] = []
    duplicate_options = deepcopy(required)
    approval = _nested_object(duplicate_options["data"], "approval")
    options = cast(list[JsonValue], approval["options"])
    cast(JsonObject, options[1])["id"] = "allow_once"
    unexpected_field = deepcopy(required)
    approval = _nested_object(unexpected_field["data"], "approval")
    _nested_object(approval, "risk")["rawPolicy"] = "private"

    interrupted_human_with_approval = _envelope(
        event_type="run.interrupted",
        sequence=5,
        data={
            "interruptId": "interrupt-human-1",
            "checkpointId": "checkpoint-human-1",
            "reason": "human_tool_input",
            "approvalId": "fabricated-approval",
            "toolCallId": "tool-call-human-1",
        },
    )
    expired_too_early = _envelope(
        event_type="approval.resolved",
        sequence=6,
        data={
            "approval": _approval(status="expired"),
            "resolvedAt": "2026-07-19T06:01:00.000Z",
            "resolvedByActorId": "a12264f6-5cac-4f20-b4a6-a3541f806e9d",
        },
    )

    for schema, raw in (
        (ApprovalRequiredEventV1, no_span),
        (ApprovalRequiredEventV1, no_options),
        (ApprovalRequiredEventV1, duplicate_options),
        (ApprovalRequiredEventV1, unexpected_field),
        (RunInterruptedEventV1, interrupted_human_with_approval),
        (ApprovalResolvedEventV1, expired_too_early),
    ):
        with pytest.raises(ValidationError):
            schema.model_validate(raw)


def test_tool_response_commands_keep_approval_and_human_results_discriminated() -> None:
    common = {
        "responseId": "response-1",
        "workspaceId": "34efe9b8-6230-4fbf-80ef-d655a471f87d",
        "projectId": None,
        "threadId": "f63178b3-8c99-4a77-9614-797320e7b028",
        "runId": "3dc77f5d-0381-4857-9c17-7b660b7fc14a",
        "actorUserId": "a12264f6-5cac-4f20-b4a6-a3541f806e9d",
        "toolCallId": "tool-call-1",
        "checkpointId": "checkpoint-1",
        "idempotencyKey": "response-command-1",
        "respondedAt": "2026-07-19T06:01:00.000Z",
    }
    adapter = TypeAdapter(ToolResponseCommandV1)
    approval = adapter.validate_python({
        **common,
        "kind": "approval",
        "approvalId": "approval-1",
        "approvalVersion": 1,
        "approved": True,
        "optionId": "allow_once",
    })
    human = adapter.validate_python({
        **common,
        "responseId": "response-2",
        "idempotencyKey": "response-command-2",
        "kind": "human_result",
        "result": {"choice": "design teams"},
    })

    assert isinstance(approval, ApprovalToolResponseCommandV1)
    assert isinstance(human, HumanToolResultResponseCommandV1)
    with pytest.raises(ValidationError):
        adapter.validate_python({
            **common,
            "kind": "human_result",
            "approvalId": "fabricated-approval",
            "result": {"choice": "design teams"},
        })
