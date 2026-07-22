from __future__ import annotations

from typing import Final
from uuid import UUID

from src.core.exceptions import Forbidden, NotFound
from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    PermanentJobExecutionError,
)
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
    JobTerminalErrorContract,
)
from src.modules.projects.authz.router_helpers import ensure_project_permission_granted
from src.modules.projects.http.service import resolve_project_context_by_id
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.service import resolve_workspace_context_by_id

JOB_ACTOR_PERMISSION_REVOKED_CODE: Final = "BACKGROUND_JOB_ACTOR_PERMISSION_REVOKED"
ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS: Final = (
    JobTerminalErrorContract(code=JOB_ACTOR_PERMISSION_REVOKED_CODE, metadata_schema=None),
)


class WorkspaceActorJobAuthorizer:
    """Re-resolve one persisted actor and exact target-scoped permission before a new effect."""

    async def authorize(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        requirement: JobPermissionRequirement,
    ) -> None:
        try:
            if requirement.scope == JobPermissionScope.WORKSPACE and project_id is None:
                context = await resolve_workspace_context_by_id(
                    workspace_id=workspace_id,
                    user_id=actor_user_id,
                )
                await ensure_workspace_permission_granted(
                    requirement.action,
                    user_id=actor_user_id,
                    ctx=context,
                    error_code=JOB_ACTOR_PERMISSION_REVOKED_CODE,
                )
            elif requirement.scope == JobPermissionScope.PROJECT and project_id is not None:
                context = await resolve_project_context_by_id(
                    project_id=project_id,
                    user_id=actor_user_id,
                )
                if context.workspace_id != workspace_id:
                    raise PermanentJobExecutionError(
                        code=JOB_ACTOR_PERMISSION_REVOKED_CODE,
                        safe_message="The initiating actor's Project no longer belongs to the Job workspace",
                    )
                await ensure_project_permission_granted(
                    requirement.action,
                    user_id=actor_user_id,
                    ctx=context,
                    error_code=JOB_ACTOR_PERMISSION_REVOKED_CODE,
                )
            else:
                raise PermanentJobExecutionError(
                    code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
                    safe_message="Actor authorization received a permission outside the canonical target scope",
                )
        except (Forbidden, NotFound) as error:
            raise PermanentJobExecutionError(
                code=JOB_ACTOR_PERMISSION_REVOKED_CODE,
                safe_message="The initiating actor no longer has permission to execute this background job",
            ) from error
