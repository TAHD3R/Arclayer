from __future__ import annotations

from fastapi import Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.i18n import t


async def require_self_host_deployment_mode(
    settings: Settings = Depends(get_settings),
) -> None:
    """
    Hard security gate for instance-level system administration endpoints.

    When running in SaaS mode, tenant org owners must NOT be able to access any deployment-level
    endpoints (e.g. system settings/mail), otherwise they could modify instance configuration.
    """

    if settings.application.deployment_mode == "saas":
        # Use 404 to avoid leaking the existence of instance-level endpoints in SaaS mode.
        raise NotFound(
            message=t("errors", "NOT_FOUND", default="资源不存在"),
            error="SYSTEM_ENDPOINT_DISABLED",
        )
