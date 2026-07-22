from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.schemas import BaseSchema
from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_boundary import ScopedJobExecutionBoundary
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_schema import (
    JobExecutionPreparation,
    SystemExecutionBinding,
    TenantExecutionBinding,
)
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
    JobTargetScope,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope

pytestmark = pytest.mark.unit


class _ProjectResolver:
    def __init__(self, scope: TenantContext) -> None:
        self.scope = scope
        self.reconciliation_calls: list[tuple[UUID, UUID]] = []
        self.authorization_calls: list[tuple[UUID, UUID]] = []

    async def resolve_for_reconciliation(self, *, workspace_id: UUID, project_id: UUID) -> TenantContext:
        self.reconciliation_calls.append((workspace_id, project_id))
        return self.scope

    async def authorize_new_effect(self, *, workspace_id: UUID, project_id: UUID) -> None:
        self.authorization_calls.append((workspace_id, project_id))


class _WorkspaceTarget(BaseSchema):
    workspace_id: UUID


class _WorkspaceResolver:
    def __init__(self, scope: TenantContext) -> None:
        self.scope = scope
        self.reconciliation_calls: list[UUID] = []
        self.authorization_calls: list[UUID] = []

    async def resolve_for_reconciliation(self, *, workspace_id: UUID) -> TenantContext:
        self.reconciliation_calls.append(workspace_id)
        return self.scope

    async def authorize_new_effect(self, *, workspace_id: UUID) -> None:
        self.authorization_calls.append(workspace_id)


class _ActorAuthorizer:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, UUID | None, UUID, JobPermissionRequirement]] = []

    async def authorize(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        requirement: JobPermissionRequirement,
    ) -> None:
        self.calls.append((workspace_id, project_id, actor_user_id, requirement))


@pytest.mark.asyncio
async def test_project_boundary_routes_both_execution_stages_from_typed_target() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    scope = TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            schema_name="workspace_0123456789abcdef0123",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.JOB,
    )
    resolver = _ProjectResolver(scope)
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    definition = build_builtin_job_type_registry(get_settings()).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    preparation = cast(JobExecutionPreparation, object())

    binding = await boundary.resolve_for_reconciliation(
        preparation=preparation,
        definition=definition,
        target=cast(BaseSchema, target),
        input_reference=cast(BaseSchema, input_reference),
    )
    assert isinstance(binding, TenantExecutionBinding)
    await boundary.authorize_new_effect(
        preparation=preparation,
        definition=definition,
        binding=binding,
        target=cast(BaseSchema, target),
        input_reference=cast(BaseSchema, input_reference),
    )

    assert binding.tenant_context == scope
    assert resolver.reconciliation_calls == [(workspace_id, project_id)]
    assert resolver.authorization_calls == [(workspace_id, project_id)]


@pytest.mark.asyncio
async def test_system_boundary_never_constructs_or_resolves_a_tenant_context() -> None:
    resolver = _ProjectResolver(cast(TenantContext, object()))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    project_definition = build_builtin_job_type_registry(get_settings()).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    definition = project_definition.model_copy(
        update={
            "target_scope": JobTargetScope.SYSTEM,
            "visibility": JobVisibility.SYSTEM,
        }
    )
    preparation = cast(JobExecutionPreparation, object())
    target = BaseSchema()
    input_reference = BaseSchema()

    binding = await boundary.resolve_for_reconciliation(
        preparation=preparation,
        definition=definition,
        target=target,
        input_reference=input_reference,
    )
    await boundary.authorize_new_effect(
        preparation=preparation,
        definition=definition,
        binding=binding,
        target=target,
        input_reference=input_reference,
    )

    assert binding == SystemExecutionBinding()
    assert resolver.reconciliation_calls == []
    assert resolver.authorization_calls == []


@pytest.mark.asyncio
async def test_workspace_boundary_requires_an_explicit_target_resolver() -> None:
    workspace_id = uuid4()
    resolver = _ProjectResolver(cast(TenantContext, object()))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    project_definition = build_builtin_job_type_registry(get_settings()).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    definition = project_definition.model_copy(update={"target_scope": JobTargetScope.WORKSPACE})

    with pytest.raises(PermanentJobExecutionError, match="requires a registered target resolver"):
        await boundary.resolve_for_reconciliation(
            preparation=cast(JobExecutionPreparation, object()),
            definition=definition,
            target=_WorkspaceTarget(workspace_id=workspace_id),
            input_reference=BaseSchema(),
        )

    assert resolver.reconciliation_calls == []


@pytest.mark.asyncio
async def test_workspace_boundary_revalidates_target_and_actor_before_new_effect() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    scope = _tenant_context(workspace_id=workspace_id, project_id=None)
    workspace_resolver = _WorkspaceResolver(scope)
    actor_authorizer = _ActorAuthorizer()
    boundary = ScopedJobExecutionBoundary(
        project_resolver=_ProjectResolver(cast(TenantContext, object())),
        workspace_resolver=workspace_resolver,
        actor_authorizer=actor_authorizer,
    )
    requirement = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:content:manage",
    )
    definition = _project_definition().model_copy(
        update={
            "target_scope": JobTargetScope.WORKSPACE,
            "visibility": JobVisibility.OWNER_ONLY,
            "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
            "required_permission": requirement,
        }
    )
    preparation = cast(JobExecutionPreparation, SimpleNamespace(actor_user_id=actor_user_id))
    target = _WorkspaceTarget(workspace_id=workspace_id)

    binding = await boundary.resolve_for_reconciliation(
        preparation=preparation,
        definition=definition,
        target=target,
        input_reference=BaseSchema(),
    )
    await boundary.authorize_new_effect(
        preparation=preparation,
        definition=definition,
        binding=binding,
        target=target,
        input_reference=BaseSchema(),
    )

    assert binding == TenantExecutionBinding(tenant_context=scope)
    assert workspace_resolver.reconciliation_calls == [workspace_id]
    assert workspace_resolver.authorization_calls == [workspace_id]
    assert actor_authorizer.calls == [(workspace_id, None, actor_user_id, requirement)]


@pytest.mark.asyncio
async def test_project_boundary_revalidates_target_and_actor_before_new_effect() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    scope = _tenant_context(workspace_id=workspace_id, project_id=project_id)
    project_resolver = _ProjectResolver(scope)
    actor_authorizer = _ActorAuthorizer()
    boundary = ScopedJobExecutionBoundary(
        project_resolver=project_resolver,
        actor_authorizer=actor_authorizer,
    )
    requirement = JobPermissionRequirement(
        scope=JobPermissionScope.PROJECT,
        action="project:content:site-builder:write",
    )
    definition = _project_definition().model_copy(
        update={
            "visibility": JobVisibility.OWNER_ONLY,
            "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
            "required_permission": requirement,
        }
    )
    preparation = cast(JobExecutionPreparation, SimpleNamespace(actor_user_id=actor_user_id))
    target, input_reference = _project_references(workspace_id=workspace_id, project_id=project_id)

    binding = await boundary.resolve_for_reconciliation(
        preparation=preparation,
        definition=definition,
        target=target,
        input_reference=input_reference,
    )
    await boundary.authorize_new_effect(
        preparation=preparation,
        definition=definition,
        binding=binding,
        target=target,
        input_reference=input_reference,
    )

    assert binding == TenantExecutionBinding(tenant_context=scope)
    assert project_resolver.reconciliation_calls == [(workspace_id, project_id)]
    assert project_resolver.authorization_calls == [(workspace_id, project_id)]
    assert actor_authorizer.calls == [(workspace_id, project_id, actor_user_id, requirement)]


@pytest.mark.asyncio
async def test_system_boundary_rejects_non_service_authority_at_both_execution_stages() -> None:
    resolver = _ProjectResolver(cast(TenantContext, object()))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    definition = _system_definition().model_copy(
        update={
            "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
            "required_permission": _project_definition().manage_permission,
        }
    )
    preparation = cast(JobExecutionPreparation, object())

    with pytest.raises(PermanentJobExecutionError, match="System Jobs do not support actor-revalidated execution"):
        await boundary.resolve_for_reconciliation(
            preparation=preparation,
            definition=definition,
            target=BaseSchema(),
            input_reference=BaseSchema(),
        )
    with pytest.raises(PermanentJobExecutionError, match="System Jobs do not support actor-revalidated execution"):
        await boundary.authorize_new_effect(
            preparation=preparation,
            definition=definition,
            binding=SystemExecutionBinding(),
            target=BaseSchema(),
            input_reference=BaseSchema(),
        )

    assert resolver.reconciliation_calls == []
    assert resolver.authorization_calls == []


@pytest.mark.asyncio
async def test_project_authorization_rejects_a_system_execution_binding() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    resolver = _ProjectResolver(_tenant_context(workspace_id=workspace_id, project_id=project_id))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    target, input_reference = _project_references(workspace_id=workspace_id, project_id=project_id)

    with pytest.raises(PermanentJobExecutionError, match="missing its tenant execution binding"):
        await boundary.authorize_new_effect(
            preparation=cast(JobExecutionPreparation, object()),
            definition=_project_definition(),
            binding=SystemExecutionBinding(),
            target=target,
            input_reference=input_reference,
        )

    assert resolver.authorization_calls == []


@pytest.mark.asyncio
async def test_system_authorization_rejects_a_tenant_execution_binding() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    resolver = _ProjectResolver(cast(TenantContext, object()))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    binding = TenantExecutionBinding(tenant_context=_tenant_context(workspace_id=workspace_id, project_id=project_id))

    with pytest.raises(PermanentJobExecutionError, match="received a tenant execution binding"):
        await boundary.authorize_new_effect(
            preparation=cast(JobExecutionPreparation, object()),
            definition=_system_definition(),
            binding=binding,
            target=BaseSchema(),
            input_reference=BaseSchema(),
        )

    assert resolver.authorization_calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("mismatched_id", ["workspace", "project"])
async def test_project_reconciliation_rejects_resolver_identity_drift(mismatched_id: str) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    resolved_workspace_id = uuid4() if mismatched_id == "workspace" else workspace_id
    resolved_project_id = uuid4() if mismatched_id == "project" else project_id
    resolver = _ProjectResolver(
        _tenant_context(
            workspace_id=resolved_workspace_id,
            project_id=resolved_project_id,
        )
    )
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    target, input_reference = _project_references(workspace_id=workspace_id, project_id=project_id)

    with pytest.raises(PermanentJobExecutionError, match="differs from the canonical project target"):
        await boundary.resolve_for_reconciliation(
            preparation=cast(JobExecutionPreparation, object()),
            definition=_project_definition(),
            target=target,
            input_reference=input_reference,
        )

    assert resolver.reconciliation_calls == [(workspace_id, project_id)]


@pytest.mark.asyncio
async def test_project_reconciliation_rejects_a_non_job_tenant_scope() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    resolver = _ProjectResolver(
        _tenant_context(
            workspace_id=workspace_id,
            project_id=project_id,
            scope=TenantScope.PROJECT,
        )
    )
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    target, input_reference = _project_references(workspace_id=workspace_id, project_id=project_id)

    with pytest.raises(PermanentJobExecutionError, match="not a Job execution scope"):
        await boundary.resolve_for_reconciliation(
            preparation=cast(JobExecutionPreparation, object()),
            definition=_project_definition(),
            target=target,
            input_reference=input_reference,
        )

    assert resolver.reconciliation_calls == [(workspace_id, project_id)]


@pytest.mark.asyncio
@pytest.mark.parametrize("mismatched_id", ["workspace", "project"])
async def test_project_authorization_rejects_binding_identity_drift(mismatched_id: str) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    bound_workspace_id = uuid4() if mismatched_id == "workspace" else workspace_id
    bound_project_id = uuid4() if mismatched_id == "project" else project_id
    resolver = _ProjectResolver(_tenant_context(workspace_id=workspace_id, project_id=project_id))
    boundary = ScopedJobExecutionBoundary(project_resolver=resolver)
    binding = TenantExecutionBinding(
        tenant_context=_tenant_context(
            workspace_id=bound_workspace_id,
            project_id=bound_project_id,
        )
    )
    target, input_reference = _project_references(workspace_id=workspace_id, project_id=project_id)

    with pytest.raises(PermanentJobExecutionError, match="differs from the canonical project target"):
        await boundary.authorize_new_effect(
            preparation=cast(JobExecutionPreparation, object()),
            definition=_project_definition(),
            binding=binding,
            target=target,
            input_reference=input_reference,
        )

    assert resolver.authorization_calls == []


def _project_definition() -> JobTypeDefinition:
    return build_builtin_job_type_registry(get_settings()).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )


def _system_definition() -> JobTypeDefinition:
    return _project_definition().model_copy(
        update={
            "target_scope": JobTargetScope.SYSTEM,
            "visibility": JobVisibility.SYSTEM,
        }
    )


def _tenant_context(
    *,
    workspace_id: UUID,
    project_id: UUID | None,
    scope: TenantScope = TenantScope.JOB,
) -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            schema_name="workspace_0123456789abcdef0123",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=scope,
    )


def _project_references(
    *,
    workspace_id: UUID,
    project_id: UUID,
) -> tuple[AssetThumbnailJobTarget, AssetThumbnailJobInput]:
    asset_id = uuid4()
    return (
        AssetThumbnailJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            entity_id=asset_id,
        ),
        AssetThumbnailJobInput(
            asset_id=asset_id,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        ),
    )
