from __future__ import annotations

from datetime import datetime
from typing import Final, Literal, Protocol, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.exceptions import NotFound
from src.models.tenancy.workspace_tenant import WorkspaceTenantIsolationMode, WorkspaceTenantStatus
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.registry import JobTerminalErrorContract
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.modules.tenancy.schema_names import validate_tenant_schema_name

_TARGET_NOT_FOUND = "BACKGROUND_JOB_TARGET_NOT_FOUND"
_TARGET_WORKSPACE_MISMATCH = "BACKGROUND_JOB_TARGET_WORKSPACE_MISMATCH"
_TARGET_INVARIANT_INVALID = "BACKGROUND_JOB_TARGET_INVARIANT_INVALID"
_TARGET_DISABLED = "BACKGROUND_JOB_TARGET_DISABLED"
_TENANT_NOT_READY = "BACKGROUND_JOB_TENANT_NOT_READY"
_TENANT_FAILED = "BACKGROUND_JOB_TENANT_FAILED"
_TENANT_INVARIANT_INVALID = "BACKGROUND_JOB_TENANT_INVARIANT_INVALID"
_TENANT_SCHEMA_INVALID = "BACKGROUND_JOB_TENANT_SCHEMA_INVALID"
_TENANT_ISOLATION_UNSUPPORTED = "BACKGROUND_JOB_TENANT_ISOLATION_UNSUPPORTED"


class _ProjectIdErrorMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    project_id: UUID


class _ProjectTargetErrorMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID


class _ProjectTargetDisabledErrorMetadata(_ProjectTargetErrorMetadata):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    entity_type: Literal["project", "workspace"]


class _WorkspaceIdErrorMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID


class _WorkspaceInvariantErrorMetadata(_WorkspaceIdErrorMetadata):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: Literal["ownership_mismatch", "invalid_status", "invalid_schema_version"]


class _WorkspaceTenantNotReadyErrorMetadata(_WorkspaceIdErrorMetadata):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: Literal["missing", "pending", "schema_outdated"]
    current_schema_version: int | None = Field(default=None, ge=0)
    required_schema_version: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_schema_version_evidence(self) -> Self:
        versions = (self.current_schema_version, self.required_schema_version)
        if self.reason == "schema_outdated" and any(version is None for version in versions):
            raise ValueError("schema_outdated requires current and required schema versions")
        if self.reason != "schema_outdated" and any(version is not None for version in versions):
            raise ValueError("schema version evidence is only valid for schema_outdated")
        return self


PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS: Final = (
    JobTerminalErrorContract(code=_TARGET_NOT_FOUND, metadata_schema=_ProjectIdErrorMetadata),
    JobTerminalErrorContract(code=_TARGET_INVARIANT_INVALID, metadata_schema=_ProjectTargetErrorMetadata),
    JobTerminalErrorContract(code=_TARGET_WORKSPACE_MISMATCH, metadata_schema=_ProjectTargetErrorMetadata),
    JobTerminalErrorContract(code=_TARGET_DISABLED, metadata_schema=_ProjectTargetDisabledErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_FAILED, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_INVARIANT_INVALID, metadata_schema=_WorkspaceInvariantErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_SCHEMA_INVALID, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_ISOLATION_UNSUPPORTED, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_NOT_READY, metadata_schema=_WorkspaceTenantNotReadyErrorMetadata),
)

WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS: Final = (
    JobTerminalErrorContract(code=_TARGET_NOT_FOUND, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TARGET_INVARIANT_INVALID, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TARGET_DISABLED, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_FAILED, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_INVARIANT_INVALID, metadata_schema=_WorkspaceInvariantErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_SCHEMA_INVALID, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_ISOLATION_UNSUPPORTED, metadata_schema=_WorkspaceIdErrorMetadata),
    JobTerminalErrorContract(code=_TENANT_NOT_READY, metadata_schema=_WorkspaceTenantNotReadyErrorMetadata),
)


class ProjectRecordLike(Protocol):
    id: UUID
    workspace_id: UUID
    is_active: bool


class WorkspaceRecordLike(Protocol):
    id: UUID
    organization_id: UUID
    is_active: bool
    archived_at: datetime | None
    deleted_at: datetime | None


class WorkspaceTenantRecordLike(Protocol):
    workspace_id: UUID
    organization_id: UUID
    schema_name: str
    isolation_mode: WorkspaceTenantIsolationMode | str
    status: WorkspaceTenantStatus | str
    schema_version: int


class ProjectRepositoryLike(Protocol):
    async def get_project_with_workspace(
        self,
        *,
        project_id: UUID,
    ) -> tuple[ProjectRecordLike, WorkspaceRecordLike]: ...


class TenancyRepositoryLike(Protocol):
    async def get_workspace_tenant(self, *, workspace_id: UUID) -> WorkspaceTenantRecordLike | None: ...


class WorkspaceRepositoryLike(Protocol):
    async def get_by_id(self, *, workspace_id: UUID) -> WorkspaceRecordLike | None: ...


class WorkspaceJobTargetResolver:
    """Resolve Workspace-owned Job routing before separately authorizing effects."""

    __slots__ = ("_required_schema_version", "_tenancy_repository", "_workspace_repository")

    def __init__(
        self,
        *,
        workspace_repository: WorkspaceRepositoryLike,
        tenancy_repository: TenancyRepositoryLike,
        required_schema_version: int,
    ) -> None:
        if isinstance(required_schema_version, bool) or not isinstance(required_schema_version, int):
            raise ValueError("required_schema_version must be non-negative")
        if required_schema_version < 0:
            raise ValueError("required_schema_version must be non-negative")
        self._workspace_repository = workspace_repository
        self._tenancy_repository = tenancy_repository
        self._required_schema_version = required_schema_version

    async def resolve_for_reconciliation(self, *, workspace_id: UUID) -> TenantContext:
        workspace = await self._load_workspace(workspace_id=workspace_id)
        _validate_workspace_target_identity(workspace=workspace, workspace_id=workspace_id)
        tenant_record = await self._tenancy_repository.get_workspace_tenant(workspace_id=workspace_id)
        if tenant_record is None:
            raise _tenant_not_ready(workspace_id=workspace_id, reason="missing")
        _validate_tenant_ownership(
            record=tenant_record,
            workspace_id=workspace_id,
            organization_id=workspace.organization_id,
        )
        _validate_tenant_readiness(
            record=tenant_record,
            workspace_id=workspace_id,
            required_schema_version=self._required_schema_version,
        )
        return TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=None,
                runtime_id=None,
                site_id=None,
                schema_name=_resolve_schema_name(tenant_record, workspace_id=workspace_id),
                isolation_mode=_resolve_isolation_mode(tenant_record, workspace_id=workspace_id),
            ),
            scope=TenantScope.JOB,
        )

    async def authorize_new_effect(self, *, workspace_id: UUID) -> None:
        workspace = await self._load_workspace(workspace_id=workspace_id)
        _validate_workspace_target_identity(workspace=workspace, workspace_id=workspace_id)
        _validate_workspace_target_enabled(workspace=workspace, workspace_id=workspace_id)

    async def _load_workspace(self, *, workspace_id: UUID) -> WorkspaceRecordLike:
        workspace = await self._workspace_repository.get_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise _permanent(
                _TARGET_NOT_FOUND,
                "The workspace target is no longer available",
                {"workspaceId": str(workspace_id)},
            )
        return workspace


class ProjectJobTargetResolver:
    """Resolve reconciliation routing separately from mutable effect authority."""

    __slots__ = ("_project_repository", "_required_schema_version", "_tenancy_repository")

    def __init__(
        self,
        *,
        project_repository: ProjectRepositoryLike,
        tenancy_repository: TenancyRepositoryLike,
        required_schema_version: int,
    ) -> None:
        if isinstance(required_schema_version, bool) or not isinstance(required_schema_version, int):
            raise ValueError("required_schema_version must be non-negative")
        if required_schema_version < 0:
            raise ValueError("required_schema_version must be non-negative")
        self._project_repository = project_repository
        self._tenancy_repository = tenancy_repository
        self._required_schema_version = required_schema_version

    async def resolve_for_reconciliation(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> TenantContext:
        """Resolve immutable ownership and current tenant routing before marker lookup."""

        project, workspace = await self._load_project_target(project_id=project_id)
        _validate_project_target_identity(
            project=project,
            workspace=workspace,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        tenant_record = await self._tenancy_repository.get_workspace_tenant(workspace_id=workspace_id)
        if tenant_record is None:
            raise _tenant_not_ready(workspace_id=workspace_id, reason="missing")
        _validate_tenant_ownership(
            record=tenant_record,
            workspace_id=workspace_id,
            organization_id=workspace.organization_id,
        )
        _validate_tenant_readiness(
            record=tenant_record,
            workspace_id=workspace_id,
            required_schema_version=self._required_schema_version,
        )
        schema_name = _resolve_schema_name(tenant_record, workspace_id=workspace_id)
        isolation_mode = _resolve_isolation_mode(tenant_record, workspace_id=workspace_id)
        return TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=None,
                site_id=None,
                schema_name=schema_name,
                isolation_mode=isolation_mode,
            ),
            scope=TenantScope.JOB,
        )

    async def authorize_new_effect(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> None:
        """Reject a new domain effect when the live Project or Workspace is disabled."""

        project, workspace = await self._load_project_target(project_id=project_id)
        _validate_project_target_identity(
            project=project,
            workspace=workspace,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        _validate_project_target_enabled(
            project=project,
            workspace=workspace,
            workspace_id=workspace_id,
            project_id=project_id,
        )

    async def _load_project_target(
        self,
        *,
        project_id: UUID,
    ) -> tuple[ProjectRecordLike, WorkspaceRecordLike]:
        try:
            return await self._project_repository.get_project_with_workspace(project_id=project_id)
        except NotFound as exc:
            raise _permanent(
                _TARGET_NOT_FOUND,
                "The project target is no longer available",
                {"projectId": str(project_id)},
            ) from exc


def _validate_project_target_identity(
    *,
    project: ProjectRecordLike,
    workspace: WorkspaceRecordLike,
    workspace_id: UUID,
    project_id: UUID,
) -> None:
    metadata: JsonObject = {"workspaceId": str(workspace_id), "projectId": str(project_id)}
    if project.id != project_id:
        raise _permanent(
            _TARGET_INVARIANT_INVALID,
            "The project target identity is invalid",
            metadata,
        )
    if project.workspace_id != workspace_id or workspace.id != workspace_id:
        raise _permanent(
            _TARGET_WORKSPACE_MISMATCH,
            "The project target does not belong to this workspace",
            metadata,
        )


def _validate_workspace_target_identity(
    *,
    workspace: WorkspaceRecordLike,
    workspace_id: UUID,
) -> None:
    if workspace.id == workspace_id:
        return
    raise _permanent(
        _TARGET_INVARIANT_INVALID,
        "The workspace target identity is invalid",
        {"workspaceId": str(workspace_id)},
    )


def _validate_workspace_target_enabled(
    *,
    workspace: WorkspaceRecordLike,
    workspace_id: UUID,
) -> None:
    if workspace.is_active and workspace.archived_at is None and workspace.deleted_at is None:
        return
    raise _permanent(
        _TARGET_DISABLED,
        "The workspace target is inactive or archived",
        {"workspaceId": str(workspace_id)},
    )


def _validate_project_target_enabled(
    *,
    project: ProjectRecordLike,
    workspace: WorkspaceRecordLike,
    workspace_id: UUID,
    project_id: UUID,
) -> None:
    metadata: JsonObject = {"workspaceId": str(workspace_id), "projectId": str(project_id)}
    if not project.is_active:
        raise _permanent(
            _TARGET_DISABLED,
            "The project target is inactive",
            {**metadata, "entityType": "project"},
        )
    if not workspace.is_active or workspace.archived_at is not None or workspace.deleted_at is not None:
        raise _permanent(
            _TARGET_DISABLED,
            "The workspace target is inactive or archived",
            {**metadata, "entityType": "workspace"},
        )


def _validate_tenant_ownership(
    *,
    record: WorkspaceTenantRecordLike,
    workspace_id: UUID,
    organization_id: UUID,
) -> None:
    if record.workspace_id == workspace_id and record.organization_id == organization_id:
        return
    raise _permanent(
        _TENANT_INVARIANT_INVALID,
        "The workspace tenant ownership is invalid",
        {"workspaceId": str(workspace_id), "reason": "ownership_mismatch"},
    )


def _validate_tenant_readiness(
    *,
    record: WorkspaceTenantRecordLike,
    workspace_id: UUID,
    required_schema_version: int,
) -> None:
    metadata: JsonObject = {"workspaceId": str(workspace_id)}
    try:
        status = WorkspaceTenantStatus(str(record.status))
    except ValueError as exc:
        raise _permanent(
            _TENANT_INVARIANT_INVALID,
            "The workspace tenant status is invalid",
            {**metadata, "reason": "invalid_status"},
        ) from exc
    if status == WorkspaceTenantStatus.FAILED:
        raise _permanent(
            _TENANT_FAILED,
            "The workspace tenant is in a failed state",
            metadata,
        )
    if status == WorkspaceTenantStatus.PENDING:
        raise _tenant_not_ready(workspace_id=workspace_id, reason="pending")
    if status != WorkspaceTenantStatus.READY:
        raise _permanent(
            _TENANT_INVARIANT_INVALID,
            "The workspace tenant status is invalid",
            {**metadata, "reason": "invalid_status"},
        )
    _validate_schema_version(
        schema_version=record.schema_version,
        workspace_id=workspace_id,
        required_schema_version=required_schema_version,
    )


def _validate_schema_version(
    *,
    schema_version: int,
    workspace_id: UUID,
    required_schema_version: int,
) -> None:
    if isinstance(schema_version, bool) or not isinstance(schema_version, int) or schema_version < 0:
        raise _permanent(
            _TENANT_INVARIANT_INVALID,
            "The workspace tenant schema version is invalid",
            {"workspaceId": str(workspace_id), "reason": "invalid_schema_version"},
        )
    if schema_version < required_schema_version:
        raise _tenant_not_ready(
            workspace_id=workspace_id,
            reason="schema_outdated",
            current_schema_version=schema_version,
            required_schema_version=required_schema_version,
        )


def _resolve_schema_name(record: WorkspaceTenantRecordLike, *, workspace_id: UUID) -> str:
    try:
        return validate_tenant_schema_name(record.schema_name)
    except ValueError as exc:
        raise _permanent(
            _TENANT_SCHEMA_INVALID,
            "The workspace tenant schema name is invalid",
            {"workspaceId": str(workspace_id)},
        ) from exc


def _resolve_isolation_mode(
    record: WorkspaceTenantRecordLike,
    *,
    workspace_id: UUID,
) -> TenantIsolationMode:
    try:
        isolation_mode = TenantIsolationMode(str(record.isolation_mode))
        if isolation_mode != TenantIsolationMode.WORKSPACE_SCHEMA:
            raise ValueError("unsupported tenant isolation mode")
    except ValueError as exc:
        raise _permanent(
            _TENANT_ISOLATION_UNSUPPORTED,
            "The workspace tenant isolation mode is unsupported",
            {"workspaceId": str(workspace_id)},
        ) from exc
    return isolation_mode


def _tenant_not_ready(
    *,
    workspace_id: UUID,
    reason: str,
    current_schema_version: int | None = None,
    required_schema_version: int | None = None,
) -> TransientJobExecutionError:
    metadata: JsonObject = {"workspaceId": str(workspace_id), "reason": reason}
    if current_schema_version is not None:
        metadata["currentSchemaVersion"] = current_schema_version
    if required_schema_version is not None:
        metadata["requiredSchemaVersion"] = required_schema_version
    return TransientJobExecutionError(
        code=_TENANT_NOT_READY,
        safe_message="Workspace tenant routing is not ready",
        metadata=metadata,
    )


def _permanent(
    code: str,
    safe_message: str,
    metadata: JsonObject,
) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(code=code, safe_message=safe_message, metadata=metadata)
