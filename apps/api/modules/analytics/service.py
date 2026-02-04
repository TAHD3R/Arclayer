from __future__ import annotations

from math import ceil
from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import NotFound
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.modules.analytics.models.audit_event import AuditEvent
from apps.api.modules.analytics.repository import AuditEventRepository
from apps.api.modules.analytics.schema import ActivityUserSummaryOut, AuditEventListQuery, AuditEventOut
from apps.api.modules.organization.models.user import User


class ActivityService(BaseService):
    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        super().__init__(settings)
        self.repo = AuditEventRepository()

    def _to_user_summary(self, user: User) -> ActivityUserSummaryOut:
        return ActivityUserSummaryOut(
            id=UUID(str(user.id)),
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        )

    async def list_events(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters: AuditEventListQuery,
    ) -> PageData[AuditEventOut]:
        qs = self.repo.build_queryset(organization_id=organization_id, filters=filters)

        total = int(await qs.count())
        pages = ceil(total / params.size) if params.size else 0
        if total == 0 or params.page > pages:
            items: list[AuditEventOut] = []
        else:
            rows = await qs.limit(params.limit).offset(params.offset).all()

            user_ids: set[UUID] = set()
            for r in rows:
                if r.actor_user_id:
                    user_ids.add(UUID(str(r.actor_user_id)))
                if r.subject_user_id:
                    user_ids.add(UUID(str(r.subject_user_id)))

            users = await User.filter(id__in=list(user_ids)).all() if user_ids else []
            user_by_id = {UUID(str(u.id)): u for u in users}

            items = []
            for r in rows:
                actor_u = user_by_id.get(UUID(str(r.actor_user_id))) if r.actor_user_id else None
                subject_u = user_by_id.get(UUID(str(r.subject_user_id))) if r.subject_user_id else None
                out = AuditEventOut.model_validate(r, from_attributes=True)
                items.append(
                    out.model_copy(
                        update={
                            "actor": self._to_user_summary(actor_u) if actor_u else None,
                            "subject": self._to_user_summary(subject_u) if subject_u else None,
                        }
                    )
                )

        next_page: int | None = None
        prev_page: int | None = None
        if pages > 0:
            if params.page < pages:
                next_page = params.page + 1
            if params.page > 1:
                prev_page = min(params.page - 1, pages)

        return PageData[AuditEventOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def get_event(
        self,
        *,
        organization_id: UUID,
        event_id: UUID,
    ) -> AuditEventOut:
        row = await AuditEvent.get_or_none(id=event_id, organization_id=organization_id)
        if row is None:
            raise NotFound(message="Activity event not found", error="NOT_FOUND")
        out = AuditEventOut.model_validate(row, from_attributes=True)

        user_ids: set[UUID] = set()
        if row.actor_user_id:
            user_ids.add(UUID(str(row.actor_user_id)))
        if row.subject_user_id:
            user_ids.add(UUID(str(row.subject_user_id)))
        users = await User.filter(id__in=list(user_ids)).all() if user_ids else []
        user_by_id = {UUID(str(u.id)): u for u in users}

        actor_u = user_by_id.get(UUID(str(row.actor_user_id))) if row.actor_user_id else None
        subject_u = user_by_id.get(UUID(str(row.subject_user_id))) if row.subject_user_id else None
        return out.model_copy(
            update={
                "actor": self._to_user_summary(actor_u) if actor_u else None,
                "subject": self._to_user_summary(subject_u) if subject_u else None,
            }
        )
