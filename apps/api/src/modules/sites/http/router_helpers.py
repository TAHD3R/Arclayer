from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.modules.commerce.dunning.command_policy import (
    RestrictedRecoveryCommandPolicy,
    build_restricted_recovery_command_policy,
)
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.sites.http.service import get_site_service
from src.modules.sites.service import SiteService


def get_site_commercial_policy() -> RestrictedRecoveryCommandPolicy:
    return build_restricted_recovery_command_policy()


async def _authorize_site_commercial_effect(
    *,
    site_id: PublicUUID,
    effect: RestrictedRecoveryEffect,
    service: SiteService,
    policy: RestrictedRecoveryCommandPolicy,
) -> None:
    site = await service.get_site_by_id(site_id=site_id)
    await policy.authorize(workspace_id=site.workspace_id, effects={effect})


def require_site_commercial_effect(effect: RestrictedRecoveryEffect):
    async def authorize(
        site_id: PublicUUID,
        service: Annotated[SiteService, Depends(get_site_service)],
        policy: Annotated[RestrictedRecoveryCommandPolicy, Depends(get_site_commercial_policy)],
    ) -> None:
        await _authorize_site_commercial_effect(
            site_id=site_id,
            effect=effect,
            service=service,
            policy=policy,
        )

    return Depends(authorize)


def require_preview_site_commercial_effect(effect: RestrictedRecoveryEffect):
    async def authorize(
        site_id: PublicUUID,
        token: Annotated[str, Query(..., description="Preview token (required).")],
        service: Annotated[SiteService, Depends(get_site_service)],
        policy: Annotated[RestrictedRecoveryCommandPolicy, Depends(get_site_commercial_policy)],
    ) -> None:
        await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
        await _authorize_site_commercial_effect(
            site_id=site_id,
            effect=effect,
            service=service,
            policy=policy,
        )

    return Depends(authorize)
