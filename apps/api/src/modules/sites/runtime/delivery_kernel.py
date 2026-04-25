from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Literal, TypeVar
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
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext

logger = get_logger(__name__)
_CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300"
_CACHE_PREVIEW = "no-store"
_T = TypeVar("_T")


@dataclass(frozen=True, slots=True)
class RuntimeDeliveryTarget:
    runtime_id: UUID
    site_id: UUID
    tenant_context: TenantContext


class SiteRuntimeDeliveryKernel:
    def __init__(self, site_service: SiteService) -> None:
        self._site_service = site_service

    async def _with_tenant_service(
        self,
        target: RuntimeDeliveryTarget,
        operation: Callable[[SiteService], Awaitable[_T]],
    ) -> _T:
        async with TenantDatabaseRouter(target.tenant_context).connection() as conn:
            return await operation(self._site_service.with_database_connection(conn))

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

    async def create_preview_token(self, *, target: RuntimeDeliveryTarget, ttl_seconds: int) -> SitePreviewTokenOut:
        return await self._with_tenant_service(
            target,
            lambda service: service.create_preview_token(site_id=target.site_id, ttl_seconds=ttl_seconds),
        )

    async def get_runtime(
        self,
        *,
        target: RuntimeDeliveryTarget,
        mode: Literal["public", "preview"],
        token: str | None,
        locale: str | None,
    ) -> SiteRuntimeOut:
        async def operation(service: SiteService) -> SiteRuntimeOut:
            site_id = target.site_id
            await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
            return await service.get_runtime(site_id=site_id, mode=mode, locale=locale)

        return await self._with_tenant_service(target, operation)

    async def resolve_route(
        self,
        *,
        target: RuntimeDeliveryTarget,
        path: str,
        mode: Literal["public", "preview"],
        token: str | None,
    ) -> SiteRouteResolveOut:
        async def operation(service: SiteService) -> SiteRouteResolveOut:
            site_id = target.site_id
            await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
            return await service.resolve_route(site_id=site_id, path=path, mode=mode)

        return await self._with_tenant_service(target, operation)

    async def get_delivery_menu(self, *, target: RuntimeDeliveryTarget, menu_key: str) -> DeliveryMenuOut:
        return await self._with_tenant_service(
            target,
            lambda service: service.delivery_get_menu(site_id=target.site_id, menu_key=menu_key),
        )

    async def get_delivery_style(self, *, target: RuntimeDeliveryTarget) -> DeliveryStyleOut:
        return await self._with_tenant_service(
            target,
            lambda service: service.delivery_get_style(site_id=target.site_id),
        )

    async def resolve_delivery_page(
        self,
        *,
        target: RuntimeDeliveryTarget,
        path: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryPageOut:
        async def operation(service: SiteService) -> DeliveryPageOut:
            site_id = target.site_id
            await service.assert_preview_access_async(
                site_id=site_id,
                mode=self.mode_for_perspective(perspective),
                token=token,
            )
            data = await service.delivery_resolve_page(
                site_id=site_id,
                path=path,
                perspective=perspective,
            )
            if data is None:
                logger.warning(
                    "Delivery page route not found",
                    path=path,
                    perspective=perspective,
                    runtime_id=str(target.runtime_id),
                    site_id=str(site_id),
                )
                raise NotFound("Route not found", error="PAGE_ROUTE_NOT_FOUND")
            return data

        return await self._with_tenant_service(target, operation)

    async def get_delivery_page_by_id(
        self,
        *,
        target: RuntimeDeliveryTarget,
        page_id: UUID,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryPageOut:
        async def operation(service: SiteService) -> DeliveryPageOut:
            site_id = target.site_id
            await service.assert_preview_access_async(
                site_id=site_id,
                mode=self.mode_for_perspective(perspective),
                token=token,
            )
            data = await service.delivery_get_page_by_id(
                site_id=site_id,
                page_id=page_id,
                perspective=perspective,
            )
            if data is None:
                logger.warning(
                    "Delivery page lookup failed",
                    page_id=str(page_id),
                    perspective=perspective,
                    runtime_id=str(target.runtime_id),
                    site_id=str(site_id),
                )
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")
            return data

        return await self._with_tenant_service(target, operation)

    async def get_delivery_section_by_alias(
        self,
        *,
        target: RuntimeDeliveryTarget,
        alias: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliverySectionOut:
        async def operation(service: SiteService) -> DeliverySectionOut:
            site_id = target.site_id
            await service.assert_preview_access_async(
                site_id=site_id,
                mode=self.mode_for_perspective(perspective),
                token=token,
            )
            return await service.delivery_get_section_by_alias(
                site_id=site_id,
                alias=alias,
                perspective=perspective,
            )

        return await self._with_tenant_service(target, operation)

    async def get_delivery_global_set(
        self,
        *,
        target: RuntimeDeliveryTarget,
        key: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryGlobalSetOut:
        async def operation(service: SiteService) -> DeliveryGlobalSetOut:
            site_id = target.site_id
            await service.assert_preview_access_async(
                site_id=site_id,
                mode=self.mode_for_perspective(perspective),
                token=token,
            )
            return await service.delivery_get_global_set(
                site_id=site_id,
                key=key,
                perspective=perspective,
            )

        return await self._with_tenant_service(target, operation)


def get_site_runtime_delivery_kernel(
    site_service: Annotated[SiteService, Depends(get_site_service)],
) -> SiteRuntimeDeliveryKernel:
    return SiteRuntimeDeliveryKernel(site_service)
