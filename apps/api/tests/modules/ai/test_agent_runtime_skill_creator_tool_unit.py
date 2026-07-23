from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.models.skills._enums import SkillPackageScope
from src.modules.ai.runtime_skill_creator_tool import (
    AgentSkillCreatorToolExecutionRequest,
    WorkspaceSkillAuthoringAgentToolExecutor,
    WorkspaceSkillCreateArgsV1,
)
from src.modules.workspaces.skills.schema import SkillInstallationCreateRequest, SkillPackageCreateRequest

pytestmark = pytest.mark.unit


class _SkillsService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.package_id = uuid4()
        self.version_id = uuid4()

    async def create_package(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(
            package=SimpleNamespace(id=self.package_id),
            version=SimpleNamespace(
                id=self.version_id,
                package_checksum="sha256:" + ("a" * 64),
            ),
        )


class _LifecycleService:
    def __init__(self) -> None:
        self.validation_calls: list[dict[str, object]] = []
        self.installation_calls: list[dict[str, object]] = []
        self.installation_id = uuid4()

    async def create_validation(self, **kwargs: object) -> SimpleNamespace:
        self.validation_calls.append(kwargs)
        return SimpleNamespace(finding_hash="sha256:" + ("b" * 64))

    async def create_installation(self, **kwargs: object) -> SimpleNamespace:
        self.installation_calls.append(kwargs)
        return SimpleNamespace(id=self.installation_id, status="enabled")


@pytest.mark.asyncio
async def test_skill_creator_persists_validates_and_enables_one_workspace_skill() -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    actor_user_id = uuid4()
    agent_run_id = uuid4()
    skills = _SkillsService()
    lifecycle = _LifecycleService()
    executor = WorkspaceSkillAuthoringAgentToolExecutor(
        skills_service_factory=lambda: skills,
        lifecycle_service_factory=lambda: lifecycle,
        organization_id_factory=lambda: organization_id,
    )
    request = AgentSkillCreatorToolExecutionRequest(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        agent_run_id=agent_run_id,
        tool_call_id="tool-call-skill-1",
        args=WorkspaceSkillCreateArgsV1(
            slug="editorial-brief",
            display_name="Editorial Brief",
            description="Create a concise editorial brief.",
            instructions="Collect the audience and objective, then produce the brief.",
            capability_tags=("content.planning",),
        ),
    )

    result = await executor.execute(request=request)

    assert result.workspace_id == workspace_id
    assert result.package_id == skills.package_id
    assert result.version_id == skills.version_id
    assert result.installation_id == lifecycle.installation_id
    assert result.status == "enabled"
    package_call = skills.calls[0]
    package_payload = cast(SkillPackageCreateRequest, package_call["payload"])
    assert cast(str, package_call["idempotency_key"]).endswith(":package")
    assert package_payload.semantic_version == "1.0.0"
    assert package_payload.required_tools == ()
    assert package_payload.permissions == ()
    assert package_payload.data_egress == ()
    validation_call = lifecycle.validation_calls[0]
    installation_call = lifecycle.installation_calls[0]
    assert cast(str, validation_call["idempotency_key"]).endswith(":validate")
    assert cast(str, installation_call["idempotency_key"]).endswith(":install")
    installation_payload = cast(SkillInstallationCreateRequest, installation_call["payload"])
    assert installation_payload.package_scope == SkillPackageScope.WORKSPACE
    assert installation_payload.package_id == skills.package_id
    assert installation_payload.version_id == skills.version_id


@pytest.mark.asyncio
async def test_skill_creator_uses_stable_idempotency_keys_for_the_same_tool_call() -> None:
    skills = _SkillsService()
    lifecycle = _LifecycleService()
    request = AgentSkillCreatorToolExecutionRequest(
        workspace_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        tool_call_id="stable-tool-call",
        args=WorkspaceSkillCreateArgsV1(
            slug="release-checklist",
            display_name="Release Checklist",
            description="Prepare a release checklist.",
            instructions="Validate the release inputs and return an ordered checklist.",
        ),
    )
    executor = WorkspaceSkillAuthoringAgentToolExecutor(
        skills_service_factory=lambda: skills,
        lifecycle_service_factory=lambda: lifecycle,
        organization_id_factory=uuid4,
    )

    await executor.execute(request=request)
    await executor.execute(request=request)

    assert skills.calls[0]["idempotency_key"] == skills.calls[1]["idempotency_key"]
    assert lifecycle.validation_calls[0]["idempotency_key"] == lifecycle.validation_calls[1]["idempotency_key"]
    assert lifecycle.installation_calls[0]["idempotency_key"] == lifecycle.installation_calls[1]["idempotency_key"]
