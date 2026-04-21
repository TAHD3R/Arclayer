from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.projects.runtime.schema import RuntimePreviewTokenOut
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.projects.runtime.site.schema import ProjectRuntimeSiteOut
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
from src.modules.sites.runtime.delivery_kernel import (
    SiteRuntimeDeliveryKernel,
    get_site_runtime_delivery_kernel,
)
from src.modules.sites.schema import SitePreviewTokenOut, SiteRouteResolveOut, SiteRuntimeOut


class ProjectRuntimeDeliveryFacade:
    def __init__(
        self,
        runtime_service: ProjectRuntimeService,
        kernel: SiteRuntimeDeliveryKernel,
    ) -> None:
        self._runtime_service = runtime_service
        self._kernel = kernel

    async def get_project_site(self, *, project_id: UUID, actor_user_id: UUID | None) -> ProjectRuntimeSiteOut:
        context = await self._runtime_service.get_context_by_project(
            project_id=project_id,
            actor_user_id=actor_user_id,
        )
        return self._runtime_service.to_project_site_out(context)

    async def create_project_preview_token(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID | None,
        ttl_seconds: int,
    ) -> tuple[SitePreviewTokenOut, ProjectRuntimeContext]:
        context = await self._runtime_service.get_context_by_project(
            project_id=project_id,
            actor_user_id=actor_user_id,
        )
        token = await self._kernel.create_preview_token(site_id=context.site_id, ttl_seconds=ttl_seconds)
        return token, context

    async def create_runtime_preview_token(
        self,
        *,
        runtime_id: UUID,
        ttl_seconds: int,
    ) -> RuntimePreviewTokenOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        token = await self._kernel.create_preview_token(site_id=context.site_id, ttl_seconds=ttl_seconds)
        return self._runtime_service.to_preview_token_out(context=context, token=token)

    async def get_runtime(
        self,
        *,
        runtime_id: UUID,
        mode: Literal["public", "preview"],
        token: str | None,
        locale: str | None,
    ) -> SiteRuntimeOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_runtime(site_id=context.site_id, mode=mode, token=token, locale=locale)

    async def resolve_route(
        self,
        *,
        runtime_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
        token: str | None,
    ) -> SiteRouteResolveOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.resolve_route(site_id=context.site_id, path=path, mode=mode, token=token)

    async def get_delivery_menu(self, *, runtime_id: UUID, menu_key: str) -> DeliveryMenuOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_delivery_menu(site_id=context.site_id, menu_key=menu_key)

    async def get_delivery_style(self, *, runtime_id: UUID) -> DeliveryStyleOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_delivery_style(site_id=context.site_id)

    async def resolve_delivery_page(
        self,
        *,
        runtime_id: UUID,
        path: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryPageOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.resolve_delivery_page(
            site_id=context.site_id,
            path=path,
            perspective=perspective,
            token=token,
            runtime_id=context.runtime_id,
        )

    async def get_delivery_page_by_id(
        self,
        *,
        runtime_id: UUID,
        page_id: UUID,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryPageOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_delivery_page_by_id(
            site_id=context.site_id,
            page_id=page_id,
            perspective=perspective,
            token=token,
            runtime_id=context.runtime_id,
        )

    async def get_delivery_section_by_alias(
        self,
        *,
        runtime_id: UUID,
        alias: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliverySectionOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_delivery_section_by_alias(
            site_id=context.site_id,
            alias=alias,
            perspective=perspective,
            token=token,
        )

    async def get_delivery_global_set(
        self,
        *,
        runtime_id: UUID,
        key: str,
        perspective: DeliveryPerspective,
        token: str | None,
    ) -> DeliveryGlobalSetOut:
        context = await self._runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
        return await self._kernel.get_delivery_global_set(
            site_id=context.site_id,
            key=key,
            perspective=perspective,
            token=token,
        )


def get_project_runtime_service(settings: Settings = Depends(get_settings)) -> ProjectRuntimeService:
    return ProjectRuntimeService(settings)


def get_project_runtime_delivery_facade(
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ProjectRuntimeDeliveryFacade:
    return ProjectRuntimeDeliveryFacade(runtime_service=runtime_service, kernel=kernel)
