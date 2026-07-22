from __future__ import annotations

import json
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.modules.ai.service import AIChatService
from src.modules.projects.builder.composition_saga_provider import (
    BuilderPlanningGenerationContextV1,
    BuilderPlanningGenerationRequest,
    BuilderPlanningGenerationTargetContextV1,
    BuilderPlanningGeneratorError,
    LLMBuilderPlanningGenerator,
)


async def test_planning_generator_accepts_one_complete_planning_only_candidate() -> None:
    reusable_section_id = uuid4()
    page_id = uuid4()
    response = _tool_response([
        {
            "type": "global_section.intent.replace",
            "operationId": "plan-header",
            "itemId": str(reusable_section_id),
            "purpose": "Provide consistent site navigation.",
            "sectionIntents": [
                {
                    "id": "intent.navigation",
                    "label": "Navigation",
                    "goal": "Help visitors reach every primary destination.",
                }
            ],
        },
        {
            "type": "page.intent.replace",
            "operationId": "plan-home",
            "itemId": str(page_id),
            "purpose": "Explain the product and guide visitors to start.",
            "sectionIntents": [
                {
                    "id": "intent.hero",
                    "label": "Hero",
                    "goal": "Establish the primary value proposition.",
                }
            ],
        },
    ])
    chat = SimpleNamespace(chat=lambda *args, **kwargs: _async_value(response))

    candidate = await LLMBuilderPlanningGenerator(chat_service=cast(AIChatService, chat)).generate(
        request=_request(reusable_section_id=reusable_section_id, page_id=page_id)
    )

    assert tuple(operation.type for operation in candidate.operations) == (
        "global_section.intent.replace",
        "page.intent.replace",
    )
    assert tuple(operation.item_id for operation in candidate.operations) == (
        reusable_section_id,
        page_id,
    )


@pytest.mark.parametrize(
    "operations",
    [
        [
            {
                "type": "page.rename",
                "operationId": "not-planning",
                "itemId": str(uuid4()),
                "expectedDraftVersion": 1,
                "title": "Not allowed",
            }
        ],
        [
            {
                "type": "page.intent.replace",
                "operationId": "wrong-kind",
                "itemId": str(uuid4()),
                "purpose": "Invent an unrelated page.",
                "sectionIntents": [],
            }
        ],
        [
            {
                "type": "page.intent.replace",
                "operationId": "only-one-target",
                "itemId": "__PAGE_ID__",
                "purpose": "Plan only one requested target.",
                "sectionIntents": [],
            }
        ],
    ],
)
async def test_planning_generator_rejects_non_planning_wrong_scope_and_partial_candidates(
    operations: list[dict],
) -> None:
    reusable_section_id = uuid4()
    page_id = uuid4()
    normalized = [
        {key: str(page_id) if value == "__PAGE_ID__" else value for key, value in operation.items()}
        for operation in operations
    ]
    chat = SimpleNamespace(chat=lambda *args, **kwargs: _async_value(_tool_response(normalized)))

    with pytest.raises(BuilderPlanningGeneratorError) as exc_info:
        await LLMBuilderPlanningGenerator(chat_service=cast(AIChatService, chat)).generate(
            request=_request(reusable_section_id=reusable_section_id, page_id=page_id)
        )

    assert exc_info.value.code == "BUILDER_GENERATION_OUTPUT_INVALID"


def _request(*, reusable_section_id, page_id) -> BuilderPlanningGenerationRequest:
    return BuilderPlanningGenerationRequest(
        workspace_id=uuid4(),
        project_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_version_id=uuid4(),
        correlation_id="planning-candidate",
        candidate_index=0,
        objective="Plan the missing targets before coordinated composition.",
        locale="en-US",
        agent_instructions="Produce exact, reviewable planning operations.",
        planning_context=BuilderPlanningGenerationContextV1(
            targets=(
                BuilderPlanningGenerationTargetContextV1(
                    kind="global_section",
                    item_id=reusable_section_id,
                    expected_draft_version=3,
                ),
                BuilderPlanningGenerationTargetContextV1(
                    kind="page",
                    item_id=page_id,
                    expected_draft_version=7,
                ),
            )
        ),
    )


def _tool_response(operations: list[dict]):
    return {
        "tool_calls": [
            {
                "function": {
                    "name": "submit_builder_planning_candidate",
                    "arguments": json.dumps({"summary": "Plan the exact missing targets.", "operations": operations}),
                }
            }
        ]
    }


async def _async_value(value):
    return value
