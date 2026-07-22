from __future__ import annotations

import json
from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.service import AIChatService
from src.modules.projects.design_systems.concept_provider import (
    DesignSystemConceptGenerationRequest,
    DesignSystemConceptGeneratorError,
    LLMDesignSystemConceptGenerator,
)
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    build_design_system_manifest,
)

pytestmark = pytest.mark.unit


class _ChatService:
    def __init__(self, response: JsonObject | Exception) -> None:
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
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def _response(*, arguments: dict[str, object]) -> JsonObject:
    return {
        "tool_calls": [
            {
                "function": {
                    "name": "submit_design_system_concept_candidate",
                    "arguments": json.dumps(arguments),
                }
            }
        ]
    }


def _proposal_arguments() -> dict[str, object]:
    return {
        "summary": "A confident editorial direction with a restrained berry action color.",
        "foundation": {
            "name": "Editorial Signal",
            "palette": {
                "canvas": "#FFFDF9",
                "ink": "#171214",
                "muted": "#62585C",
                "action": "#CA2B63",
                "onAction": "#FFFFFF",
                "border": "#DED5D8",
                "focus": "#8F1645",
            },
            "typography": {
                "bodyFontFamily": ["Inter", "sans-serif"],
                "headingFontFamily": ["Source Serif 4", "serif"],
                "bodyFontWeight": 400,
                "headingFontWeight": 650,
                "bodyFontSize": "1rem",
                "headingFontSize": "2.5rem",
                "bodyLineHeight": 1.6,
                "headingLineHeight": 1.1,
            },
            "motion": {
                "duration": "180ms",
                "easing": [0.2, 0.0, 0.0, 1.0],
                "reducedMotionDuration": "0ms",
            },
        },
    }


@pytest.mark.asyncio
async def test_concept_provider_requires_one_typed_manifest_candidate() -> None:
    chat = _ChatService(_response(arguments=_proposal_arguments()))
    request = _request()

    candidate = await LLMDesignSystemConceptGenerator(chat_service=cast(AIChatService, chat)).generate(request=request)

    assert candidate.summary.startswith("A confident editorial direction")
    assert candidate.manifest.name == "Editorial Signal"
    assert candidate.manifest.primitive_tokens["primitive.color.action"].value == "#CA2B63"
    assert candidate.manifest.primitive_tokens["primitive.font.family.body"].value == ("Inter", "sans-serif")
    assert candidate.manifest.semantic_tokens["semantic.color.action.primary"].alias == "primitive.color.action"
    assert tuple(role.key for role in candidate.manifest.typography_roles) == ("body", "heading")
    assert tuple(role.key for role in candidate.manifest.motion_tokens) == ("standard",)
    assert candidate.manifest.component_catalog_version == "arclayer-wireframe-v1"
    assert len(chat.calls) == 1
    messages, context, provider_params = chat.calls[0]
    assert context.workspace_id == request.workspace_id
    assert context.project_id == request.project_id
    assert context.agent_run_id == request.agent_run_id
    assert context.user_id == request.actor_user_id
    assert context.source == "agent"
    assert "untrusted project data" in messages[0]["content"]
    assert "does not assign" in messages[0]["content"]
    assert "name and summary in the requested locale" in messages[0]["content"]
    context_json = json.loads(messages[1]["content"].split("Exact Design System context JSON:\n", 1)[1])
    expected_context = request.design_system_context.model_dump(mode="json", by_alias=True)
    assert context_json["versionId"] == expected_context["versionId"]
    assert provider_params["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_design_system_concept_candidate"},
    }
    tools = cast(list[dict[str, object]], provider_params["tools"])
    function = cast(dict[str, object], tools[0]["function"])
    assert function["name"] == "submit_design_system_concept_candidate"
    parameters = cast(dict[str, object], function["parameters"])
    assert parameters["additionalProperties"] is False
    assert "foundation" in cast(list[str], parameters["required"])
    properties = cast(dict[str, object], parameters.get("properties", {}))
    assert "manifest" not in properties
    assert "DesignSystemManifestInputV1" not in json.dumps(parameters)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        {"tool_calls": []},
        {"tool_calls": [{}, {}]},
        _response(arguments={"summary": "Missing foundation"}),
        _response(arguments={"summary": "Invalid foundation", "foundation": {"name": "Only a name"}}),
        _response(
            arguments={
                **_proposal_arguments(),
                "foundation": {
                    **cast(dict[str, object], _proposal_arguments()["foundation"]),
                    "palette": {
                        **cast(
                            dict[str, object],
                            cast(dict[str, object], _proposal_arguments()["foundation"])["palette"],
                        ),
                        "action": "blue",
                    },
                },
            }
        ),
        {
            "tool_calls": [
                {
                    "function": {
                        "name": "unsupported_tool",
                        "arguments": "{}",
                    }
                }
            ]
        },
        {
            "tool_calls": [
                {
                    "function": {
                        "name": "submit_design_system_concept_candidate",
                        "arguments": "not-json",
                    }
                }
            ]
        },
    ],
)
async def test_concept_provider_rejects_untyped_or_invalid_output(response: JsonObject) -> None:
    with pytest.raises(DesignSystemConceptGeneratorError) as error:
        await LLMDesignSystemConceptGenerator(chat_service=cast(AIChatService, _ChatService(response))).generate(
            request=_request()
        )

    assert error.value.code == "DESIGN_SYSTEM_CONCEPT_OUTPUT_INVALID"
    assert error.value.continue_candidates is True


@pytest.mark.asyncio
async def test_concept_provider_failure_is_explicit_and_stops_further_candidates() -> None:
    chat = _ChatService(
        LLMRuntimeError(
            code="AI_PROVIDER_UNAVAILABLE",
            message="provider unavailable",
        )
    )

    with pytest.raises(DesignSystemConceptGeneratorError) as error:
        await LLMDesignSystemConceptGenerator(chat_service=cast(AIChatService, chat)).generate(request=_request())

    assert error.value.code == "DESIGN_SYSTEM_CONCEPT_PROVIDER_FAILED"
    assert error.value.continue_candidates is False
    assert len(chat.calls) == 1


def _request() -> DesignSystemConceptGenerationRequest:
    workspace_id = uuid4()
    project_id = uuid4()
    manifest = build_design_system_manifest(_manifest_input(name="Project Base", action_color="#335CFF"))
    return DesignSystemConceptGenerationRequest(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        correlation_id="concept-generation-correlation",
        candidate_index=0,
        objective="Create an editorial visual direction for a product launch.",
        locale="en-US",
        agent_instructions="Act as the Visual Designer.",
        design_system_context=AgentRunDesignSystemContextV1(
            project_id=project_id,
            assignment_id=uuid4(),
            assignment_revision=3,
            design_system_id=uuid4(),
            version_id=uuid4(),
            owner_kind="project",
            manifest_checksum=manifest.checksum,
            validation_finding_hash="sha256:" + "b" * 64,
            token_index_hash="sha256:" + "c" * 64,
            context_hash="sha256:" + "d" * 64,
            manifest=manifest,
            validation_findings=(),
            compatibility={
                "componentCatalog": "compatible",
                "renderer": "not_evaluated",
            },
            publish_ready=False,
        ),
    )


def _manifest_input(*, name: str, action_color: str) -> DesignSystemManifestInputV1:
    return DesignSystemManifestInputV1.model_validate({
        "manifestVersion": 1,
        "name": name,
        "primitiveTokens": {
            "primitive.color.action": {"type": "color", "value": action_color},
            "primitive.color.on-action": {"type": "color", "value": "#FFFFFF"},
        },
        "semanticTokens": {
            "semantic.color.action.primary": {
                "type": "color",
                "alias": "primitive.color.action",
            },
            "semantic.color.action.on-primary": {
                "type": "color",
                "alias": "primitive.color.on-action",
            },
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {},
    })
