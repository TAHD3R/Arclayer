from __future__ import annotations

import json
from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext
from src.modules.ai.service import AIChatService
from src.modules.projects.builder.generation_provider import (
    BuilderWireframeGenerationContextV1,
    BuilderWireframeGenerationRequest,
    BuilderWireframeGenerationTargetContextV1,
    BuilderWireframeGeneratorError,
    LLMBuilderWireframeGenerator,
)
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut
from src.modules.projects.builder.schema import BuilderSectionIntentV1
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeInitializeOperationV1,
)
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry

pytestmark = pytest.mark.unit


class _ChatService:
    def __init__(self, response: JsonObject) -> None:
        self.response = response
        self.calls: list[tuple[list[dict[str, str]], LLMRequestContext, dict[str, object]]] = []

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        provider_params: dict[str, object],
    ) -> JsonObject:
        self.calls.append((messages, context, provider_params))
        return self.response


def _response(*, intent_id: str) -> JsonObject:
    return {
        "tool_calls": [
            {
                "function": {
                    "name": "submit_builder_wireframe_candidate",
                    "arguments": json.dumps({
                        "summary": "Compose the planned hero section.",
                        "operations": [
                            {
                                "operationId": "initialize-home-wireframe",
                                "type": "wireframe.initialize",
                                "itemId": str(PAGE_ID),
                                "expectedDraftVersion": 3,
                                "componentCatalogVersion": "arclayer-wireframe-v1",
                                "sections": [
                                    {
                                        "id": "section.hero",
                                        "intentId": intent_id,
                                        "componentKey": "landing.hero",
                                        "variantKey": "default",
                                        "label": "Hero",
                                        "bindings": [
                                            {
                                                "kind": "literal",
                                                "slotKey": "heading",
                                                "value": "Build better sites with Arclayer",
                                            }
                                        ],
                                    }
                                ],
                            }
                        ],
                    }),
                }
            }
        ]
    }


PAGE_ID = uuid4()
INTENT_ID = "intent.hero"


@pytest.mark.asyncio
async def test_wireframe_provider_forces_one_typed_candidate_over_exact_untrusted_context() -> None:
    chat = _ChatService(_response(intent_id=INTENT_ID))
    request = _request()

    candidate = await LLMBuilderWireframeGenerator(chat_service=cast(AIChatService, chat)).generate(request=request)

    assert candidate.summary == "Compose the planned hero section."
    operation = candidate.operations[0]
    assert isinstance(operation, BuilderWireframeInitializeOperationV1)
    assert operation.type == "wireframe.initialize"
    assert operation.item_id == PAGE_ID
    assert operation.sections[0].intent_id == INTENT_ID
    messages, llm_context, provider_params = chat.calls[0]
    assert llm_context.agent_run_id is None
    assert "untrusted project data" in messages[0]["content"]
    assert "canonical intent IDs" in messages[0]["content"]
    exact_context = json.loads(messages[1]["content"].split("Exact Wireframe context JSON:\n", 1)[1])
    assert exact_context["targets"][0]["kind"] == "page"
    assert exact_context["targets"][0]["itemId"] == str(PAGE_ID)
    assert exact_context["targets"][0]["sectionIntents"][0]["id"] == INTENT_ID
    assert exact_context["componentCatalog"]["catalogVersion"] == "arclayer-wireframe-v1"
    assert provider_params["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_builder_wireframe_candidate"},
    }


@pytest.mark.asyncio
async def test_wireframe_provider_rejects_model_invented_intent_identity() -> None:
    chat = _ChatService(_response(intent_id="intent.invented"))

    with pytest.raises(BuilderWireframeGeneratorError) as error:
        await LLMBuilderWireframeGenerator(chat_service=cast(AIChatService, chat)).generate(request=_request())

    assert error.value.code == "BUILDER_GENERATION_OUTPUT_INVALID"
    assert error.value.continue_candidates is True


@pytest.mark.asyncio
async def test_wireframe_provider_rejects_candidate_that_omits_a_coordinated_target() -> None:
    request = _request()
    global_section_id = uuid4()
    global_target = BuilderWireframeGenerationTargetContextV1(
        kind="global_section",
        item_id=global_section_id,
        expected_draft_version=5,
        purpose="Provide consistent navigation",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.navigation",
                label="Navigation",
                goal="Help visitors reach primary destinations",
            ),
        ),
        current_wireframe=None,
    )
    request = request.model_copy(
        update={
            "wireframe_context": request.wireframe_context.model_copy(
                update={"targets": (*request.wireframe_context.targets, global_target)}
            )
        }
    )
    chat = _ChatService(_response(intent_id=INTENT_ID))

    with pytest.raises(BuilderWireframeGeneratorError) as error:
        await LLMBuilderWireframeGenerator(chat_service=cast(AIChatService, chat)).generate(request=request)

    assert error.value.code == "BUILDER_GENERATION_OUTPUT_INVALID"
    assert error.value.continue_candidates is True


def _request() -> BuilderWireframeGenerationRequest:
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    return BuilderWireframeGenerationRequest(
        workspace_id=uuid4(),
        project_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_version_id=uuid4(),
        correlation_id="wireframe-generation",
        candidate_index=0,
        objective="Turn the approved page plan into a concise Wireframe.",
        locale="en-US",
        agent_instructions="Act as the Site Designer.",
        wireframe_context=BuilderWireframeGenerationContextV1(
            targets=(
                BuilderWireframeGenerationTargetContextV1(
                    kind="page",
                    item_id=PAGE_ID,
                    expected_draft_version=3,
                    purpose="Explain the product value and drive a trial.",
                    section_intents=(
                        BuilderSectionIntentV1(
                            id=INTENT_ID,
                            label="Hero value proposition",
                            goal="Help the visitor understand the product immediately.",
                            generation_guidance="Use one primary action.",
                        ),
                    ),
                    current_wireframe=None,
                ),
            ),
            design_system_version_id=uuid4(),
            component_catalog=catalog,
            global_section_graph=BuilderGlobalSectionDependencyGraphOut(),
        ),
    )
