from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict, Forbidden, NotFound
from src.models.platform_identity.identity import PlatformOperator, PlatformOperatorStatus
from src.models.projects.project import ProjectRecord
from src.models.support_access import (
    SupportAccessGrant,
    SupportAccessGrantOperator,
    SupportAccessGrantScope,
    SupportAccessGrantState,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.support_access.schema import SupportAccessGrantCreate, SupportAccessGrantOut, SupportAccessScopeIn


class SupportAccessService:
    async def create(
        self, *, workspace_id: UUID, owner_user_id: UUID, command: SupportAccessGrantCreate
    ) -> SupportAccessGrantOut:
        operators = await PlatformOperator.filter(
            user_id__in=command.operator_user_ids,
            status=PlatformOperatorStatus.ACTIVE,
        ).all()
        operators_by_user_id = {UUID(str(operator.user_id)): operator for operator in operators}
        if set(operators_by_user_id) != set(command.operator_user_ids):
            raise Conflict(error="SUPPORT_ACCESS_OPERATOR_INACTIVE")
        project_ids = {scope.project_id for scope in command.scopes if scope.project_id is not None}
        if project_ids and await ProjectRecord.filter(id__in=project_ids, workspace_id=workspace_id).count() != len(
            project_ids
        ):
            raise Conflict(error="SUPPORT_ACCESS_PROJECT_SCOPE_INVALID")
        async with in_transaction() as conn:
            grant = await SupportAccessGrant.create(
                workspace_id=workspace_id,
                case_id=command.case_id,
                reason=command.reason,
                expires_at=command.expires_at,
                created_by_user_id=owner_user_id,
                using_db=conn,
            )
            await SupportAccessGrantOperator.bulk_create(
                [
                    SupportAccessGrantOperator(
                        grant_id=grant.id,
                        operator_user_id=user_id,
                        operator_revision=operators_by_user_id[user_id].revision,
                    )
                    for user_id in command.operator_user_ids
                ],
                using_db=conn,
            )
            await SupportAccessGrantScope.bulk_create(
                [
                    SupportAccessGrantScope(
                        grant_id=grant.id,
                        project_id=scope.project_id,
                        content_category=scope.content_category,
                    )
                    for scope in command.scopes
                ],
                using_db=conn,
            )
            await write_required_activity_event(
                settings=get_settings(),
                payload=ActivityAuditPayload(
                    event_name="support_access.grant.created",
                    workspace_id=workspace_id,
                    actor_user_id=owner_user_id,
                    entity_type="support_access_grant",
                    entity_id=grant.id,
                    properties={"case_id": command.case_id, "revision": grant.revision},
                ),
                conn=conn,
            )
        return await self.get(workspace_id=workspace_id, grant_id=grant.id)

    async def get(self, *, workspace_id: UUID, grant_id: UUID) -> SupportAccessGrantOut:
        grant = await SupportAccessGrant.get_or_none(id=grant_id, workspace_id=workspace_id)
        if grant is None:
            raise NotFound(error="SUPPORT_ACCESS_GRANT_NOT_FOUND")
        operators = cast(
            tuple[UUID, ...],
            tuple(
                await SupportAccessGrantOperator.filter(grant_id=grant.id).values_list("operator_user_id", flat=True)
            ),
        )
        scopes = tuple(
            SupportAccessScopeIn(project_id=row[0], content_category=row[1])
            for row in await SupportAccessGrantScope.filter(grant_id=grant.id).values_list(
                "project_id", "content_category"
            )
        )
        return SupportAccessGrantOut(
            id=grant.id,
            workspace_id=workspace_id,
            case_id=grant.case_id,
            reason=grant.reason,
            expires_at=grant.expires_at,
            state=grant.state,
            revision=grant.revision,
            operator_user_ids=operators,
            scopes=scopes,
        )

    async def list_grants(self, *, workspace_id: UUID) -> list[SupportAccessGrantOut]:
        grant_ids = cast(
            tuple[UUID, ...],
            tuple(
                await SupportAccessGrant
                .filter(workspace_id=workspace_id)
                .order_by("-created_at")
                .values_list("id", flat=True)
            ),
        )
        return [await self.get(workspace_id=workspace_id, grant_id=grant_id) for grant_id in grant_ids]

    async def revoke(self, *, workspace_id: UUID, grant_id: UUID, owner_user_id: UUID) -> SupportAccessGrantOut:
        grant = await SupportAccessGrant.filter(id=grant_id, workspace_id=workspace_id).select_for_update().first()
        if grant is None:
            raise NotFound(error="SUPPORT_ACCESS_GRANT_NOT_FOUND")
        if grant.state == SupportAccessGrantState.ACTIVE:
            grant.state = SupportAccessGrantState.REVOKED
            grant.revoked_by_user_id = owner_user_id
            grant.revoked_at = datetime.now(UTC)
            grant.revision += 1
            await grant.save(update_fields=["state", "revoked_by_user_id", "revoked_at", "revision"])
            await write_required_activity_event(
                settings=get_settings(),
                payload=ActivityAuditPayload(
                    event_name="support_access.grant.revoked",
                    workspace_id=workspace_id,
                    actor_user_id=owner_user_id,
                    entity_type="support_access_grant",
                    entity_id=grant.id,
                    properties={"case_id": grant.case_id, "revision": grant.revision},
                ),
            )
        return await self.get(workspace_id=workspace_id, grant_id=grant.id)

    async def require_current(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        category: str,
        case_id: str,
        operator_user_id: UUID,
        expected_revision: int | None = None,
    ) -> SupportAccessGrant:
        grant = await SupportAccessGrant.filter(
            workspace_id=workspace_id,
            case_id=case_id,
            state=SupportAccessGrantState.ACTIVE,
            expires_at__gt=datetime.now(UTC),
        ).first()
        if grant is None or (expected_revision is not None and grant.revision != expected_revision):
            raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
        operator = await PlatformOperator.get_or_none(
            user_id=operator_user_id,
            status=PlatformOperatorStatus.ACTIVE,
        )
        if operator is None:
            raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
        operator_granted = await SupportAccessGrantOperator.filter(
            grant_id=grant.id,
            operator_user_id=operator_user_id,
            operator_revision=operator.revision,
        ).exists()
        scope_granted = await SupportAccessGrantScope.filter(
            grant_id=grant.id,
            project_id=project_id,
            content_category=category,
        ).exists()
        if not operator_granted or not scope_granted:
            raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
        return grant
