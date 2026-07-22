from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.service import AIChatService
from src.modules.projects.builder.generation_provider import (
    BuilderSitemapGenerationRequest,
    BuilderSitemapGeneratorError,
    LLMBuilderSitemapGenerator,
)
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1

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
                    "name": "submit_builder_sitemap_candidate",
                    "arguments": json.dumps(arguments),
                }
            }
        ]
    }


@pytest.mark.asyncio
async def test_provider_requires_one_typed_candidate_tool_call() -> None:
    response = _response(
        arguments={
            "summary": "Create the initial marketing sitemap.",
            "operations": [
                {
                    "operationId": "create-home",
                    "type": "page.create",
                    "clientPageId": "home",
                    "modelKey": "page",
                    "title": "Home",
                    "slug": "home",
                    "locale": "en-US",
                    "sortOrder": 0,
                    "path": "/",
                    "fieldsSnapshot": {},
                }
            ],
        }
    )
    chat = _ChatService(response)
    request = _request()

    candidate = await LLMBuilderSitemapGenerator(chat_service=cast(AIChatService, chat)).generate(request=request)

    assert candidate.summary == "Create the initial marketing sitemap."
    assert candidate.operations[0].operation_id == "create-home"
    assert len(chat.calls) == 1
    messages, context, provider_params = chat.calls[0]
    assert context.workspace_id == request.workspace_id
    assert context.project_id == request.project_id
    assert context.agent_run_id == request.agent_run_id
    assert context.user_id == request.actor_user_id
    assert context.source == "agent"
    assert "untrusted project data" in messages[0]["content"]
    context_json = json.loads(messages[1]["content"].split("Exact Builder context JSON:\n", 1)[1])
    expected_context_json = request.builder_context.model_dump(mode="json", by_alias=True)
    assert context_json["siteRevisionId"] == expected_context_json["siteRevisionId"]
    assert provider_params["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_builder_sitemap_candidate"},
    }
    tools = cast(list[dict[str, object]], provider_params["tools"])
    function = cast(dict[str, object], tools[0]["function"])
    assert function["name"] == "submit_builder_sitemap_candidate"
    parameters = cast(dict[str, object], function["parameters"])
    assert parameters["additionalProperties"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        {"tool_calls": []},
        {"tool_calls": [{}, {}]},
        _response(arguments={"summary": "Candidate", "operations": []}),
        _response(arguments={"summary": "Candidate", "operations": [{"type": "invented"}]}),
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
                        "name": "submit_builder_sitemap_candidate",
                        "arguments": "not-json",
                    }
                }
            ]
        },
    ],
)
async def test_provider_rejects_untyped_or_invalid_output(response: JsonObject) -> None:
    with pytest.raises(BuilderSitemapGeneratorError) as error:
        await LLMBuilderSitemapGenerator(chat_service=cast(AIChatService, _ChatService(response))).generate(
            request=_request()
        )

    assert error.value.code == "BUILDER_GENERATION_OUTPUT_INVALID"
    assert error.value.continue_candidates is True


@pytest.mark.asyncio
async def test_provider_failure_is_explicit_and_stops_further_candidates() -> None:
    chat = _ChatService(
        LLMRuntimeError(
            code="AI_PROVIDER_UNAVAILABLE",
            message="provider unavailable",
        )
    )

    with pytest.raises(BuilderSitemapGeneratorError) as error:
        await LLMBuilderSitemapGenerator(chat_service=cast(AIChatService, chat)).generate(request=_request())

    assert error.value.code == "BUILDER_GENERATION_PROVIDER_FAILED"
    assert error.value.continue_candidates is False
    assert len(chat.calls) == 1


def _request() -> BuilderSitemapGenerationRequest:
    workspace_id = uuid4()
    project_id = uuid4()
    return BuilderSitemapGenerationRequest(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        correlation_id="generation-correlation",
        candidate_index=0,
        objective="Create a concise marketing sitemap.",
        locale="en-US",
        agent_instructions="Act as the Site Architect.",
        builder_context=_builder_context(
            workspace_id=workspace_id,
            project_id=project_id,
        ),
    )


def _builder_context(*, workspace_id: UUID, project_id: UUID) -> AgentRunBuilderContextV1:
    site_id = uuid4()
    environment_id = uuid4()
    revision_id = uuid4()
    structure_revision_id = uuid4()
    digest = "sha256:" + "a" * 64
    return AgentRunBuilderContextV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        site_revision_id=revision_id,
        revision_number=1,
        manifest_hash=digest,
        status_etag=digest,
        content_structure_revision_id=structure_revision_id,
        content_structure_hash=digest,
        manifest=SiteRevisionManifestV1(
            id=revision_id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            revision_number=1,
            project_authoring_mode="builder_managed",
            content_structure_revision_id=structure_revision_id,
            content_structure_hash=digest,
            page_versions=(),
            presentation_set_hash=digest,
            design_system_id=uuid4(),
            design_system_version_id=uuid4(),
            design_system_manifest_checksum=digest,
            provenance_source=BuilderProvenanceSource.HUMAN,
            actor_user_id=uuid4(),
            created_at=datetime(2026, 7, 21, tzinfo=UTC),
            manifest_hash=digest,
        ),
        content_structure=ContentStructureSnapshotV1(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            locales=("en-US",),
            pages=(),
        ),
        context_hash=digest,
    )
