from __future__ import annotations

from uuid import UUID

from src.common.services.base import BaseService
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.modules.sites.patterns.repository import SitePatternRepository
from src.modules.sites.schema import SitePatternCreateIn, SitePatternOut, SitePatternUpdateIn


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
            page_blueprint_fragment_json=payload.page_blueprint_fragment.model_dump(by_alias=True, exclude_none=True),
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
        if payload.page_blueprint_fragment is not None:
            fields["page_blueprint_fragment_json"] = payload.page_blueprint_fragment.model_dump(
                by_alias=True, exclude_none=True
            )
        if fields:
            record = await self._repo.update_pattern(record, fields)
        return SitePatternOut.model_validate(record, from_attributes=True)

    async def delete_pattern(self, *, pattern_id: UUID) -> None:
        deleted = await self._repo.delete_pattern(pattern_id)
        if not deleted:
            raise NotFound("Pattern not found.")
