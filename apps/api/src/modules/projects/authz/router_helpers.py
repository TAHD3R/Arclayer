from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.authz.service import project_context_to_workspace_context
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=project_context_to_workspace_context(ctx),
        error_code=error_code,
    )


def require_project_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await ensure_project_permission_granted(
            permission,
            user_id=user_id,
            ctx=ctx,
            error_code=error_code,
        )

    return Depends(_dep)
