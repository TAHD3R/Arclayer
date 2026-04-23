from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.authz.service import get_project_authz_snapshot
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.permissions.service import get_project_action_catalog
from src.modules.workspaces.permissions.schema import PermissionContext, PermissionSubjectKind
from src.modules.workspaces.permissions.service import PolicyEvaluationService


@lru_cache(maxsize=1)
def _get_project_policy_evaluator() -> PolicyEvaluationService:
    return PolicyEvaluationService(registry=get_project_action_catalog())


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)
    if not snapshot.role_codes:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error=error_code,
        )

    decision = _get_project_policy_evaluator().evaluate(
        context=PermissionContext(
            action=permission,
            subject_kind=PermissionSubjectKind.PROJECT_MEMBER,
            project_id=ctx.project_id,
            user_id=user_id,
            role_codes=snapshot.role_codes,
            permission_codes=snapshot.permission_codes,
            is_superuser=snapshot.is_superuser,
        )
    )
    if not decision.allowed:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error=error_code,
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
