from __future__ import annotations

import json
from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext
from src.modules.ai.service import AIChatService
from src.modules.projects.builder.design_change_set_schema import (
    BuilderDesignInitializeOperationV1,
    BuilderDesignStyleSetOperationV1,
)
from src.modules.projects.builder.generation_provider import (
    BuilderDesignGenerationContextV1,
    BuilderDesignGenerationRequest,
    BuilderDesignGenerationTargetContextV1,
    BuilderDesignGeneratorError,
    LLMBuilderDesignGenerator,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    build_design_system_manifest,
)

pytestmark = pytest.mark.unit

PAGE_ID = uuid4()
DESIGN_SYSTEM_VERSION_ID = uuid4()


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


def _design_manifest():
    return build_design_system_manifest(
        DesignSystemManifestInputV1.model_validate({
            "manifestVersion": 1,
            "name": "Design generation",
            "primitiveTokens": {
                "primitive.color.canvas": {"type": "color", "value": "#FFFFFF"},
            },
            "semanticTokens": {
                "semantic.color.surface": {"type": "color", "alias": "primitive.color.canvas"},
            },
            "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
            "breakpoints": {"mobile": "24rem", "tablet": "48rem", "desktop": "80rem"},
            "componentCatalogVersion": "arclayer-wireframe-v1",
        })
    )


def _wireframe() -> WireframeDocumentV1:
    return WireframeDocumentV1(
        page_item_id=PAGE_ID,
        design_system_version_id=DESIGN_SYSTEM_VERSION_ID,
        component_catalog_version="arclayer-wireframe-v1",
        sections=(
            WireframeSectionV1(
                id="section.hero",
                intent_id="intent.hero",
                component_key="landing.hero",
                variant_key="default",
                label="Hero",
            ),
        ),
    )


def _response(*, item_id=PAGE_ID, token_path: str = "semantic.color.surface") -> JsonObject:
    wireframe_checksum = canonical_hash(_wireframe().model_dump(mode="json", by_alias=True))
    return {
        "tool_calls": [
            {
                "function": {
                    "name": "submit_builder_design_candidate",
                    "arguments": json.dumps({
                        "summary": "Use a quiet, high-contrast hero direction.",
                        "operations": [
                            {
                                "operationId": "initialize-page-design",
                                "type": "design.initialize",
                                "itemId": str(item_id),
                                "expectedDraftVersion": 3,
                                "sourceWireframeChecksum": wireframe_checksum,
                            },
                            {
                                "operationId": "set-hero-surface",
                                "type": "design.style.set",
                                "itemId": str(item_id),
                                "expectedDraftVersion": 3,
                                "sourceWireframeChecksum": wireframe_checksum,
                                "sectionId": "section.hero",
                                "stateKey": "default",
                                "styleSlotKey": "surface.background",
                                "tokenPath": token_path,
                            },
                        ],
                    }),
                }
            }
        ]
    }


def _request() -> BuilderDesignGenerationRequest:
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    wireframe = _wireframe()
    return BuilderDesignGenerationRequest(
        workspace_id=uuid4(),
        project_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_version_id=uuid4(),
        correlation_id="design-generation",
        candidate_index=0,
        objective="Create a restrained visual direction for the home page.",
        locale="en-US",
        agent_instructions="Act as the Visual Designer.",
        design_context=BuilderDesignGenerationContextV1(
            targets=(
                BuilderDesignGenerationTargetContextV1(
                    kind="page",
                    item_id=PAGE_ID,
                    expected_draft_version=3,
                    source_wireframe_checksum=canonical_hash(wireframe.model_dump(mode="json", by_alias=True)),
                    wireframe=wireframe,
                    current_visual_blueprint=None,
                ),
            ),
            design_system_manifest=_design_manifest(),
            component_catalog=catalog,
        ),
    )


@pytest.mark.asyncio
async def test_design_provider_forces_typed_operations_over_exact_frozen_context() -> None:
    chat = _ChatService(_response())

    candidate = await LLMBuilderDesignGenerator(chat_service=cast(AIChatService, chat)).generate(request=_request())

    assert isinstance(candidate.operations[0], BuilderDesignInitializeOperationV1)
    assert isinstance(candidate.operations[1], BuilderDesignStyleSetOperationV1)
    messages, _, provider_params = chat.calls[0]
    assert "never mutating" not in messages[0]["content"]
    assert "not mutating" in messages[0]["content"]
    exact_context = json.loads(messages[1]["content"].split("Exact Design context JSON:\n", 1)[1])
    assert exact_context["targets"][0]["itemId"] == str(PAGE_ID)
    assert exact_context["targets"][0]["sourceWireframeChecksum"].startswith("sha256:")
    assert provider_params["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_builder_design_candidate"},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "reason"),
    [
        (_response(item_id=uuid4()), "target"),
        (_response(token_path="semantic.color.unknown"), "token"),
    ],
)
async def test_design_provider_rejects_out_of_scope_or_incompatible_operations(
    response: JsonObject,
    reason: str,
) -> None:
    with pytest.raises(BuilderDesignGeneratorError) as error:
        await LLMBuilderDesignGenerator(chat_service=cast(AIChatService, _ChatService(response))).generate(
            request=_request()
        )

    assert reason
    assert error.value.code == "BUILDER_GENERATION_OUTPUT_INVALID"
    assert error.value.continue_candidates is True
