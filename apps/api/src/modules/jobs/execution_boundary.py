from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.common.schemas import BaseSchema
from src.models.jobs.background_job import JobAuthorityMode
from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    JobExecutionRegistryError,
    PermanentJobExecutionError,
)
from src.modules.jobs.execution_schema import (
    JobExecutionBinding,
    JobExecutionPreparation,
    SystemExecutionBinding,
    TenantExecutionBinding,
)
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
    JobTargetScope,
    JobTypeDefinition,
    JobTypeRegistry,
)
from src.modules.tenancy.schema import TenantContext


class ProjectTargetResolver(Protocol):
    async def resolve_for_reconciliation(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> TenantContext: ...

    async def authorize_new_effect(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> None: ...


class WorkspaceTargetResolver(Protocol):
    async def resolve_for_reconciliation(self, *, workspace_id: UUID) -> TenantContext: ...

    async def authorize_new_effect(self, *, workspace_id: UUID) -> None: ...


class ActorJobAuthorizer(Protocol):
    async def authorize(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        requirement: JobPermissionRequirement,
    ) -> None: ...


def validate_production_execution_boundary_capabilities(*, job_types: JobTypeRegistry) -> None:
    """Fail startup when a registered Job needs an execution authorizer we do not have."""

    if not job_types.strict_contracts:
        raise JobExecutionRegistryError("production execution boundary requires a strict JobTypeRegistry")

    invalid: list[str] = []
    for definition in job_types.list_definitions():
        violations = _capability_violations(definition)
        if violations:
            identity = f"{definition.job_type} v{definition.job_type_version}"
            invalid.append(f"{identity}: {', '.join(violations)}")
    if invalid:
        raise JobExecutionRegistryError(
            "production execution boundary capabilities are incomplete: " + "; ".join(invalid)
        )


class ScopedJobExecutionBoundary:
    """Route system and tenant Job scopes without inventing tenant authority."""

    __slots__ = ("_actor_authorizer", "_project_resolver", "_workspace_resolver")

    def __init__(
        self,
        *,
        project_resolver: ProjectTargetResolver,
        workspace_resolver: WorkspaceTargetResolver | None = None,
        actor_authorizer: ActorJobAuthorizer | None = None,
    ) -> None:
        self._project_resolver = project_resolver
        self._workspace_resolver = workspace_resolver
        self._actor_authorizer = actor_authorizer

    async def resolve_for_reconciliation(
        self,
        *,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        target: BaseSchema,
        input_reference: BaseSchema,
    ) -> JobExecutionBinding:
        _ = preparation, input_reference
        _require_supported_capabilities(definition)
        target_scope = JobTargetScope(definition.target_scope)
        if target_scope == JobTargetScope.SYSTEM:
            return SystemExecutionBinding()
        if target_scope == JobTargetScope.WORKSPACE:
            workspace_id = _workspace_target_id(definition=definition, target=target)
            resolver = self._workspace_resolver
            if resolver is None:
                raise _contract_mismatch("Workspace Job execution requires a registered target resolver")
            scope = await resolver.resolve_for_reconciliation(workspace_id=workspace_id)
            if scope.workspace_id != workspace_id or scope.project_id is not None:
                raise _contract_mismatch("Resolved tenant scope differs from the canonical workspace target")
            return _tenant_binding(scope)
        if target_scope != JobTargetScope.PROJECT:
            raise _unsupported_scope(target_scope)

        workspace_id, project_id = _project_target_ids(
            definition=definition,
            target=target,
        )
        scope = await self._project_resolver.resolve_for_reconciliation(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        if scope.workspace_id != workspace_id or scope.project_id != project_id:
            raise _contract_mismatch("Resolved tenant scope differs from the canonical project target")
        return _tenant_binding(scope)

    async def authorize_new_effect(
        self,
        *,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        binding: JobExecutionBinding,
        target: BaseSchema,
        input_reference: BaseSchema,
    ) -> None:
        _ = preparation, input_reference
        _require_supported_capabilities(definition)
        target_scope = JobTargetScope(definition.target_scope)
        if target_scope == JobTargetScope.SYSTEM:
            if not isinstance(binding, SystemExecutionBinding):
                raise _contract_mismatch("System Job authorization received a tenant execution binding")
            return
        if target_scope == JobTargetScope.WORKSPACE:
            if not isinstance(binding, TenantExecutionBinding):
                raise _contract_mismatch("Workspace Job authorization is missing its tenant execution binding")
            workspace_id = _workspace_target_id(definition=definition, target=target)
            scope = binding.tenant_context
            if scope.workspace_id != workspace_id or scope.project_id is not None:
                raise _contract_mismatch("Execution tenant scope differs from the canonical workspace target")
            resolver = self._workspace_resolver
            if resolver is None:
                raise _contract_mismatch("Workspace Job execution requires a registered target resolver")
            await resolver.authorize_new_effect(workspace_id=workspace_id)
            await self._authorize_actor(
                preparation=preparation,
                definition=definition,
                workspace_id=workspace_id,
                project_id=None,
            )
            return
        if target_scope != JobTargetScope.PROJECT:
            raise _unsupported_scope(target_scope)
        if not isinstance(binding, TenantExecutionBinding):
            raise _contract_mismatch("Project Job authorization is missing its tenant execution binding")

        workspace_id, project_id = _project_target_ids(
            definition=definition,
            target=target,
        )
        scope = binding.tenant_context
        if scope.workspace_id != workspace_id or scope.project_id != project_id:
            raise _contract_mismatch("Execution tenant scope differs from the canonical project target")
        await self._project_resolver.authorize_new_effect(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        await self._authorize_actor(
            preparation=preparation,
            definition=definition,
            workspace_id=workspace_id,
            project_id=project_id,
        )

    async def _authorize_actor(
        self,
        *,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        workspace_id: UUID,
        project_id: UUID | None,
    ) -> None:
        if definition.authority_mode != JobAuthorityMode.ACTOR_REVALIDATED:
            return
        actor_user_id = preparation.actor_user_id
        requirement = definition.required_permission
        authorizer = self._actor_authorizer
        if actor_user_id is None or requirement is None or authorizer is None:
            raise _contract_mismatch("Actor-revalidated Job execution is missing its authorizer contract")
        await authorizer.authorize(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            requirement=requirement,
        )


def _require_supported_capabilities(definition: JobTypeDefinition) -> None:
    violations = _capability_violations(definition)
    if violations:
        raise _contract_mismatch("; ".join(violations))


def _capability_violations(definition: JobTypeDefinition) -> tuple[str, ...]:
    target_scope = JobTargetScope(definition.target_scope)
    violations: list[str] = []
    if target_scope not in {JobTargetScope.SYSTEM, JobTargetScope.WORKSPACE, JobTargetScope.PROJECT}:
        violations.append(f"Execution boundary does not support {target_scope.value}-scoped Jobs")
    if definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED:
        if target_scope not in {JobTargetScope.WORKSPACE, JobTargetScope.PROJECT}:
            scope_label = target_scope.value.capitalize()
            violations.append(f"{scope_label} Jobs do not support actor-revalidated execution")
        requirement = definition.required_permission
        expected_permission_scope = (
            JobPermissionScope.PROJECT if target_scope == JobTargetScope.PROJECT else JobPermissionScope.WORKSPACE
        )
        if requirement is None or requirement.scope != expected_permission_scope:
            violations.append(
                f"Actor-revalidated {target_scope.value.capitalize()} Jobs require a "
                f"{expected_permission_scope.value.capitalize()} permission"
            )
    elif definition.required_permission is not None:
        violations.append("System-service Jobs cannot declare an actor permission")
    if definition.required_entitlement is not None:
        violations.append("Entitlement execution has no production authorizer adapter")

    # manage_permission governs control-plane cancellation requests, not whether
    # a claimed system-service Job may start a new domain effect.
    return tuple(violations)


def _unsupported_scope(target_scope: JobTargetScope) -> PermanentJobExecutionError:
    return _contract_mismatch(f"Execution boundary does not support {target_scope.value}-scoped Jobs")


def _project_target_ids(
    *,
    definition: JobTypeDefinition,
    target: BaseSchema,
) -> tuple[UUID, UUID]:
    if JobTargetScope(definition.target_scope) != JobTargetScope.PROJECT:
        raise _contract_mismatch("Project execution boundary received a non-project Job definition")
    workspace_id = getattr(target, "workspace_id", None)
    project_id = getattr(target, "project_id", None)
    if not isinstance(workspace_id, UUID) or not isinstance(project_id, UUID):
        raise _contract_mismatch("Project Job target is missing typed workspace and project identifiers")
    return workspace_id, project_id


def _workspace_target_id(*, definition: JobTypeDefinition, target: BaseSchema) -> UUID:
    if JobTargetScope(definition.target_scope) != JobTargetScope.WORKSPACE:
        raise _contract_mismatch("Workspace execution boundary received a non-workspace Job definition")
    workspace_id = getattr(target, "workspace_id", None)
    if not isinstance(workspace_id, UUID):
        raise _contract_mismatch("Workspace Job target is missing its typed workspace identifier")
    return workspace_id


def _tenant_binding(scope: TenantContext) -> TenantExecutionBinding:
    try:
        return TenantExecutionBinding(tenant_context=scope)
    except ValueError as exc:
        raise _contract_mismatch("Resolved tenant context is not a Job execution scope") from exc


def _contract_mismatch(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
        safe_message=message,
    )
