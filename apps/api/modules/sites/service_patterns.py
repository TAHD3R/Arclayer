from __future__ import annotations

from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.modules.sites.repository_patterns import SitePatternRepository
from apps.api.modules.sites.schema import SitePatternCreateIn, SitePatternOut, SitePatternUpdateIn


class SitePatternService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self._repo = SitePatternRepository()

    async def list_patterns(self, *, site_id: UUID, params: PageParams) -> PageData[SitePatternOut]:
        qs = self._repo.list_by_site(site_id)
        return await paginate_queryset(qs, params=params, out_schema=SitePatternOut)

    async def create_pattern(self, *, site_id: UUID, payload: SitePatternCreateIn) -> SitePatternOut:
        existing = await self._repo.get_by_site_and_code(site_id, payload.code)
        if existing:
            raise Conflict(f"Pattern code '{payload.code}' already exists for this site.")
        record = await self._repo.create_pattern(
            site_id=site_id,
            code=payload.code,
            label_json=payload.label,
            category=payload.category,
            preview_image_url=payload.preview_image_url,
            blocks_json=payload.blocks,
        )
        return SitePatternOut.model_validate(record, from_attributes=True)

    async def update_pattern(self, *, pattern_id: UUID, payload: SitePatternUpdateIn) -> SitePatternOut:
        record = await self._repo.get_by_id(pattern_id)
        if not record:
            raise NotFound("Pattern not found.")
        fields: dict[str, object] = {}
        if payload.label is not None:
            fields["label_json"] = payload.label
        if payload.category is not None:
            fields["category"] = payload.category
        if payload.preview_image_url is not None:
            fields["preview_image_url"] = payload.preview_image_url
        if payload.blocks is not None:
            fields["blocks_json"] = payload.blocks
        if fields:
            record = await self._repo.update_pattern(record, fields)
        return SitePatternOut.model_validate(record, from_attributes=True)

    async def delete_pattern(self, *, pattern_id: UUID) -> None:
        deleted = await self._repo.delete_pattern(pattern_id)
        if not deleted:
            raise NotFound("Pattern not found.")
