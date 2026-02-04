from __future__ import annotations

from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.core.exceptions import NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.modules.analytics.models.audit_event import AuditEvent
from apps.api.modules.analytics.repository import AuditEventRepository
from apps.api.modules.analytics.schema import AuditEventListQuery, AuditEventOut


class ActivityService(BaseService):
    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        super().__init__(settings)
        self.repo = AuditEventRepository()

    async def list_events(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters: AuditEventListQuery,
    ) -> PageData[AuditEventOut]:
        qs = self.repo.build_queryset(organization_id=organization_id, filters=filters)
        return await paginate_queryset(qs, params=params, out_schema=AuditEventOut)

    async def get_event(
        self,
        *,
        organization_id: UUID,
        event_id: UUID,
    ) -> AuditEventOut:
        row = await AuditEvent.get_or_none(id=event_id, organization_id=organization_id)
        if row is None:
            raise NotFound(message="Activity event not found", error="NOT_FOUND")
        return AuditEventOut.model_validate(row, from_attributes=True)
