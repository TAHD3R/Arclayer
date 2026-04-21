from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends

from src.core.exceptions import NotFound
from src.core.logging import get_logger
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
from src.modules.sites.http.service import get_site_service
from src.modules.sites.schema import SitePreviewTokenOut, SiteRouteResolveOut, SiteRuntimeOut
from src.modules.sites.service import SiteService

logger = get_logger(__name__)
_CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300"
_CACHE_PREVIEW = "no-store"


class SiteRuntimeDeliveryKernel:
    def __init__(self, site_service: SiteService) -> None:
        self._site_service = site_service

    @staticmethod
    def cache_for_mode(mode: Literal["public", "preview"]) -> str:
        return _CACHE_PREVIEW if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"

    @staticmethod
    def cache_for_route_mode(mode: Literal["public", "preview"]) -> str:
        return _CACHE_PREVIEW if mode == "preview" else _CACHE_PUBLIC

    @staticmethod
    def cache_for_perspective(perspective: DeliveryPerspective) -> str:
        return _CACHE_PREVIEW if perspective == "preview" else _CACHE_PUBLIC

    @staticmethod
    def mode_for_perspective(perspective: DeliveryPerspective) -> Literal["public", "preview"]:
        return "preview" if perspective == "preview" else "public"

    async def create_preview_token(self, *, site_id: UUID, ttl_seconds: int) -> SitePreviewTokenOut:
        return await self._site_service.create_preview_token(site_id=site_id, ttl_seconds=ttl_seconds)

    async def get_runtime(
        self,
        *,
        site_id: UUID,
        mode: Literal["public", "preview"],
        token: str | None,
        locale: str | None,
    ) -> SiteRuntimeOut:
        await self._site_service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
        return await self._site_service.get_runtime(site_id=site_id, mode=mode, locale=locale)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
        token: str | None,
    ) -> SiteRouteResolveOut:
        await self._site_service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
        return await self._site_service.resolve_route(site_id=site_id, path=path, mode=mode)

    async def get_delivery_menu(self, *, site_id: UUID, menu_key: str) -> DeliveryMenuOut:
        return await self._site_service.delivery_get_menu(site_id=site_id, menu_key=menu_key)

    async def get_delivery_style(self, *, site_id: UUID) -> DeliveryStyleOut:
        return await self._site_service.delivery_get_style(site_id=site_id)

    async def resolve_delivery_page(
        self,
        *,
        site_id: UUID,
        path: str,
        perspective: DeliveryPerspective,
        token: str | None,
        runtime_id: UUID | None = None,
    ) -> DeliveryPageOut:
        await self._site_service.assert_preview_access_async(
            site_id=site_id,
            mode=self.mode_for_perspective(perspective),
            token=token,
        )
        data = await self._site_service.delivery_resolve_page(
            site_id=site_id,
            path=path,
            perspective=perspective,
        )
        if data is None:
            logger.warning(
                "Delivery page route not found",
                path=path,
                perspective=perspective,
                runtime_id=str(runtime_id) if runtime_id is not None else None,
                site_id=str(site_id),
            )
            raise NotFound("Route not found", error="PAGE_ROUTE_NOT_FOUND")
        return data

    async def get_delivery_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        perspective: DeliveryPerspective,
        token: str | None,
        runtime_id: UUID | None = None,
    ) -> DeliveryPageOut:
        await self._site_service.assert_preview_access_async(
            site_id=site_id,
            mode=self.mode_for_perspective(perspective),
            token=token,
        )
        data = await self._site_service.delivery_get_page_by_id(
            site_id=site_id,
            page_id=page_id,
            perspective=perspective,
        )
        if data is None:
            logger.warning(
                "Delivery page lookup failed",
                page_id=str(page_id),
                perspective=perspective,
                runtime_id=str(runtime_id) if runtime_id is not None else None,
                site_id=str(site_id),
            )
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")
        return data

    async def get_delivery_section_by_alias(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliverySectionOut:
        await self._site_service.assert_preview_access_async(
            site_id=site_id,
            mode=self.mode_for_perspective(perspective),
            token=token,
        )
        return await self._site_service.delivery_get_section_by_alias(
            site_id=site_id,
            alias=alias,
            perspective=perspective,
        )

    async def get_delivery_global_set(
        self,
        *,
        site_id: UUID,
        key: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryGlobalSetOut:
        await self._site_service.assert_preview_access_async(
            site_id=site_id,
            mode=self.mode_for_perspective(perspective),
            token=token,
        )
        return await self._site_service.delivery_get_global_set(
            site_id=site_id,
            key=key,
            perspective=perspective,
        )


def get_site_runtime_delivery_kernel(
    site_service: Annotated[SiteService, Depends(get_site_service)],
) -> SiteRuntimeDeliveryKernel:
    return SiteRuntimeDeliveryKernel(site_service)
