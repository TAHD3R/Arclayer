from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.core.exceptions import Forbidden
from src.modules.jobs.actor_authorizer import (
    JOB_ACTOR_PERMISSION_REVOKED_CODE,
    WorkspaceActorJobAuthorizer,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
)
from src.modules.workspaces.http.schema import WorkspaceContext

pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_actor_authorizer_re_resolves_workspace_and_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    context = cast(WorkspaceContext, object())
    calls: list[tuple[object, ...]] = []

    async def resolve(*, workspace_id, user_id):
        calls.append(("resolve", workspace_id, user_id))
        return context

    async def ensure(permission, *, user_id, ctx, error_code):
        calls.append(("ensure", permission, user_id, ctx, error_code))

    monkeypatch.setattr("src.modules.jobs.actor_authorizer.resolve_workspace_context_by_id", resolve)
    monkeypatch.setattr("src.modules.jobs.actor_authorizer.ensure_workspace_permission_granted", ensure)

    await WorkspaceActorJobAuthorizer().authorize(
        workspace_id=workspace_id,
        project_id=None,
        actor_user_id=actor_user_id,
        requirement=JobPermissionRequirement(
            scope=JobPermissionScope.WORKSPACE,
            action="system:content:manage",
        ),
    )

    assert calls == [
        ("resolve", workspace_id, actor_user_id),
        (
            "ensure",
            "system:content:manage",
            actor_user_id,
            context,
            JOB_ACTOR_PERMISSION_REVOKED_CODE,
        ),
    ]


@pytest.mark.asyncio
async def test_actor_authorizer_maps_revoked_access_to_a_permanent_job_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def deny(*, workspace_id, user_id):
        _ = workspace_id, user_id
        raise Forbidden("denied", error="PERMISSION_DENIED")

    monkeypatch.setattr("src.modules.jobs.actor_authorizer.resolve_workspace_context_by_id", deny)

    with pytest.raises(PermanentJobExecutionError) as error:
        await WorkspaceActorJobAuthorizer().authorize(
            workspace_id=uuid4(),
            project_id=None,
            actor_user_id=uuid4(),
            requirement=JobPermissionRequirement(
                scope=JobPermissionScope.WORKSPACE,
                action="system:content:manage",
            ),
        )

    assert error.value.code == JOB_ACTOR_PERMISSION_REVOKED_CODE
    assert error.value.metadata is None


@pytest.mark.asyncio
async def test_actor_authorizer_re_resolves_project_and_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    context = SimpleNamespace(workspace_id=workspace_id)
    calls: list[tuple[object, ...]] = []

    async def resolve(*, project_id, user_id):
        calls.append(("resolve-project", project_id, user_id))
        return context

    async def ensure(permission, *, user_id, ctx, error_code):
        calls.append(("ensure-project", permission, user_id, ctx, error_code))

    monkeypatch.setattr("src.modules.jobs.actor_authorizer.resolve_project_context_by_id", resolve)
    monkeypatch.setattr("src.modules.jobs.actor_authorizer.ensure_project_permission_granted", ensure)

    await WorkspaceActorJobAuthorizer().authorize(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        requirement=JobPermissionRequirement(
            scope=JobPermissionScope.PROJECT,
            action="project:content:site-builder:write",
        ),
    )

    assert calls == [
        ("resolve-project", project_id, actor_user_id),
        (
            "ensure-project",
            "project:content:site-builder:write",
            actor_user_id,
            context,
            JOB_ACTOR_PERMISSION_REVOKED_CODE,
        ),
    ]


@pytest.mark.asyncio
async def test_actor_authorizer_rejects_project_workspace_identity_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolve(*, project_id, user_id):
        _ = project_id, user_id
        return SimpleNamespace(workspace_id=uuid4())

    monkeypatch.setattr("src.modules.jobs.actor_authorizer.resolve_project_context_by_id", resolve)

    with pytest.raises(PermanentJobExecutionError) as error:
        await WorkspaceActorJobAuthorizer().authorize(
            workspace_id=uuid4(),
            project_id=uuid4(),
            actor_user_id=uuid4(),
            requirement=JobPermissionRequirement(
                scope=JobPermissionScope.PROJECT,
                action="project:content:site-builder:write",
            ),
        )

    assert error.value.code == JOB_ACTOR_PERMISSION_REVOKED_CODE


@pytest.mark.asyncio
async def test_actor_authorizer_maps_revoked_project_permission_to_a_permanent_job_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()

    async def resolve(*, project_id, user_id):
        _ = project_id, user_id
        return SimpleNamespace(workspace_id=workspace_id)

    async def deny(permission, *, user_id, ctx, error_code):
        _ = permission, user_id, ctx, error_code
        raise Forbidden("denied", error="PERMISSION_DENIED")

    monkeypatch.setattr("src.modules.jobs.actor_authorizer.resolve_project_context_by_id", resolve)
    monkeypatch.setattr("src.modules.jobs.actor_authorizer.ensure_project_permission_granted", deny)

    with pytest.raises(PermanentJobExecutionError) as error:
        await WorkspaceActorJobAuthorizer().authorize(
            workspace_id=workspace_id,
            project_id=uuid4(),
            actor_user_id=uuid4(),
            requirement=JobPermissionRequirement(
                scope=JobPermissionScope.PROJECT,
                action="project:content:site-builder:write",
            ),
        )

    assert error.value.code == JOB_ACTOR_PERMISSION_REVOKED_CODE
    assert error.value.metadata is None


@pytest.mark.asyncio
async def test_actor_authorizer_rejects_a_non_workspace_permission_contract() -> None:
    with pytest.raises(PermanentJobExecutionError) as error:
        await WorkspaceActorJobAuthorizer().authorize(
            workspace_id=uuid4(),
            project_id=None,
            actor_user_id=uuid4(),
            requirement=JobPermissionRequirement(
                scope=JobPermissionScope.PROJECT,
                action="content:read",
            ),
        )

    assert error.value.code == "BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH"
