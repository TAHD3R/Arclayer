from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.queryset import QuerySet

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.sites.site_pattern import SitePattern


class SitePatternRepository(TortoiseORMRepository):
    def list_by_site(self, site_id: UUID) -> QuerySet[SitePattern]:
        return SitePattern.filter(site_id=site_id).order_by("-created_at")

    async def get_by_id(self, pattern_id: UUID) -> SitePattern | None:
        return await SitePattern.filter(id=pattern_id).first()

    async def get_by_site_and_code(self, site_id: UUID, code: str) -> SitePattern | None:
        return await SitePattern.filter(site_id=site_id, code=code).first()

    async def create_pattern(self, *, site_id: UUID, **data: Any) -> SitePattern:
        return await SitePattern.create(site_id=site_id, **data)

    async def update_pattern(self, pattern: SitePattern, fields: dict[str, Any]) -> SitePattern:
        return await self.update_fields(pattern, fields=fields)

    async def delete_pattern(self, pattern_id: UUID) -> int:
        return await self.delete_by_id(SitePattern, pattern_id)
